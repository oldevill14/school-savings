/**
 * /dashboard — แดชบอร์ดสรุป (ADMIN เห็นทั้งโรงเรียน, TEACHER เห็นเฉพาะห้องที่ตนประจำชั้น)
 *
 * ประกอบด้วย StatCard 4 ใบ + กราฟฝาก-ถอนรายเดือน (recharts) + ตารางธุรกรรมล่าสุด 10 รายการ
 * ตัวเลขทั้งหมดนับเฉพาะธุรกรรมสถานะ NORMAL (รายการ VOIDED ไม่ถูกนับ แต่ยังแสดงในตารางล่าสุด)
 */
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  PiggyBank,
  Wallet,
} from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { formatThaiDate } from "@/lib/thai-date";
import { cn } from "@/lib/utils";
import StatCard from "@/components/StatCard";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";
import MonthlyChart, { type MonthlyChartPoint } from "@/components/charts/MonthlyChart";
import {
  monthKey,
  monthKeysForYear,
  monthLabel,
  parseMonthKey,
} from "../reports/report-data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireRole(["ADMIN", "TEACHER"]);

  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
  });

  if (!activeYear) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl lg:text-2xl">แดชบอร์ด</h1>
        <Card title="ยังไม่มีปีการศึกษาที่เปิดใช้งาน">
          <p className="text-sm text-slate-600">
            ระบบยังไม่ได้เปิดปีการศึกษา กรุณาให้ผู้ดูแลระบบเปิดปีการศึกษาที่เมนู
            &ldquo;ปีการศึกษา&rdquo; ก่อนเริ่มใช้งาน
          </p>
        </Card>
      </div>
    );
  }

  // ขอบเขตบัญชี: ADMIN = ทุกบัญชีของปี active, TEACHER = เฉพาะห้องที่ตนเป็นครูประจำชั้นในปี active
  const accountWhere: Prisma.AccountWhereInput = {
    academicYearId: activeYear.id,
    ...(session.role === "TEACHER"
      ? {
          student: {
            classroom: {
              teacherId: session.userId,
              academicYearId: activeYear.id,
            },
          },
        }
      : {}),
  };

  // ช่วงเวลา "วันนี้" ตามเวลาเครื่อง server
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  // หน้าต่างปีการศึกษา (พ.ค. ปีนั้น – เม.ย. ปีถัดไป) สำหรับกราฟรายเดือน
  // ใช้ monthKeysForYear ชุดเดียวกับ /reports/yearly เพื่อให้ตัวเลขสองหน้าตรงกันเสมอ
  const yearMonthKeys = monthKeysForYear(activeYear.year);
  const yearStart = parseMonthKey(yearMonthKeys[0])!.start;
  const yearEnd = parseMonthKey(yearMonthKeys[yearMonthKeys.length - 1])!.next;

  const [
    homerooms,
    balanceAgg,
    accountCount,
    depositAgg,
    withdrawAgg,
    yearTxns,
    recentTxns,
  ] = await Promise.all([
    session.role === "TEACHER"
      ? prisma.classroom.findMany({
          where: { teacherId: session.userId, academicYearId: activeYear.id },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.account.aggregate({ where: accountWhere, _sum: { balance: true } }),
    prisma.account.count({ where: accountWhere }),
    prisma.transaction.aggregate({
      where: {
        type: "DEPOSIT",
        status: "NORMAL",
        txnDate: { gte: startOfToday, lt: startOfTomorrow },
        account: accountWhere,
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.transaction.aggregate({
      where: {
        type: "WITHDRAW",
        status: "NORMAL",
        txnDate: { gte: startOfToday, lt: startOfTomorrow },
        account: accountWhere,
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.transaction.findMany({
      where: {
        status: "NORMAL",
        txnDate: { gte: yearStart, lt: yearEnd },
        account: accountWhere,
      },
      select: { type: true, amount: true, txnDate: true },
    }),
    prisma.transaction.findMany({
      where: { account: accountWhere },
      orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
      take: 10,
      include: {
        account: {
          include: { student: { include: { classroom: true } } },
        },
        recordedBy: { select: { name: true } },
      },
    }),
  ]);

  const totalBalance = Number(balanceAgg._sum.balance ?? 0);
  const todayDeposit = Number(depositAgg._sum.amount ?? 0);
  const todayDepositCount = depositAgg._count._all;
  const todayWithdraw = Number(withdrawAgg._sum.amount ?? 0);
  const todayWithdrawCount = withdrawAgg._count._all;

  // aggregate ธุรกรรมทั้งปีการศึกษาเป็นราย 12 เดือน (พ.ค.–เม.ย.) สำหรับ MonthlyChart
  const monthly: MonthlyChartPoint[] = yearMonthKeys.map((key) => ({
    month: monthLabel(key),
    deposit: 0,
    withdraw: 0,
  }));
  const monthIndexByKey = new Map(yearMonthKeys.map((key, i) => [key, i]));
  for (const t of yearTxns) {
    const idx = monthIndexByKey.get(monthKey(t.txnDate));
    if (idx === undefined) continue; // นอกหน้าต่างปีการศึกษา (กันเหนียว — query กรองแล้ว)
    const amount = t.amount.toNumber();
    if (t.type === "DEPOSIT") monthly[idx].deposit += amount;
    else monthly[idx].withdraw += amount;
  }
  for (const point of monthly) {
    point.deposit = Math.round(point.deposit * 100) / 100;
    point.withdraw = Math.round(point.withdraw * 100) / 100;
  }

  const scopeLabel =
    session.role === "ADMIN"
      ? "ภาพรวมทั้งโรงเรียน"
      : homerooms.length > 0
        ? `ห้อง ${homerooms.map((c) => c.name).join(" · ")}`
        : "ยังไม่ได้รับมอบหมายห้องเรียนในปีการศึกษานี้";

  return (
    <div className="space-y-4 lg:space-y-6">
      <div>
        <h1 className="text-xl lg:text-2xl">แดชบอร์ด</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {scopeLabel} · ปีการศึกษา {activeYear.year}
        </p>
      </div>

      {session.role === "TEACHER" && homerooms.length === 0 && (
        <Card>
          <p className="text-sm text-slate-600">
            ท่านยังไม่ได้เป็นครูประจำชั้นของห้องเรียนใดในปีการศึกษา {activeYear.year}{" "}
            ตัวเลขด้านล่างจึงยังเป็นศูนย์ — กรุณาติดต่อผู้ดูแลระบบเพื่อกำหนดห้องเรียน
          </p>
        </Card>
      )}

      {/* แถวสถิติ 4 ใบ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="ยอดเงินรวม"
          value={formatBaht(totalBalance)}
          hint={`ปีการศึกษา ${activeYear.year}`}
          icon={Wallet}
          tone="gold"
        />
        <StatCard
          title="ฝากวันนี้"
          value={formatBaht(todayDeposit)}
          hint={`${todayDepositCount.toLocaleString("th-TH")} รายการ`}
          icon={ArrowDownToLine}
          tone="green"
        />
        <StatCard
          title="ถอนวันนี้"
          value={formatBaht(todayWithdraw)}
          hint={`${todayWithdrawCount.toLocaleString("th-TH")} รายการ`}
          icon={ArrowUpFromLine}
          tone="red"
        />
        <StatCard
          title="จำนวนบัญชี"
          value={`${accountCount.toLocaleString("th-TH")} บัญชี`}
          hint="นักเรียนที่มีบัญชีปีนี้"
          icon={PiggyBank}
          tone="navy"
        />
      </div>

      {/* กราฟฝาก-ถอนรายเดือน */}
      <Card
        title={`ฝาก-ถอนรายเดือน ปีการศึกษา ${activeYear.year}`}
        description="เฉพาะรายการสถานะปกติ (ไม่รวมรายการที่ยกเลิกแล้ว)"
      >
        <MonthlyChart data={monthly} />
      </Card>

      {/* ธุรกรรมล่าสุด 10 รายการ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base lg:text-lg">ธุรกรรมล่าสุด</h2>
          <Link href="/transactions" className="link-navy text-sm">
            ดูทั้งหมด
          </Link>
        </div>
        <Table minWidth="760px">
          <THead>
            <TR>
              <TH>วันที่</TH>
              <TH>นักเรียน</TH>
              <TH>ห้อง</TH>
              <TH>รายการ</TH>
              <TH align="right">จำนวนเงิน</TH>
              <TH>ผู้บันทึก</TH>
              <TH>สถานะ</TH>
            </TR>
          </THead>
          <TBody>
            {recentTxns.map((t) => {
              const voided = t.status === "VOIDED";
              const isDeposit = t.type === "DEPOSIT";
              const mutedCls = voided ? "line-through text-slate-400" : undefined;
              return (
                <TR key={t.id}>
                  <TD className={cn("whitespace-nowrap", mutedCls)}>
                    {formatThaiDate(t.txnDate)}
                  </TD>
                  <TD className={mutedCls}>
                    <span className="block">
                      {t.account.student.firstName} {t.account.student.lastName}
                    </span>
                    <span className="text-xs text-slate-400">
                      {t.account.student.studentCode}
                    </span>
                  </TD>
                  <TD className={mutedCls}>{t.account.student.classroom.name}</TD>
                  <TD>
                    <Badge variant={isDeposit ? "green" : "red"}>
                      {isDeposit ? "ฝาก" : "ถอน"}
                    </Badge>
                  </TD>
                  <TD
                    align="right"
                    className={cn(
                      voided
                        ? "line-through text-slate-400"
                        : isDeposit
                          ? "text-deposit"
                          : "text-withdraw",
                      "font-medium"
                    )}
                  >
                    {formatBaht(t.amount)}
                  </TD>
                  <TD className={mutedCls}>{t.recordedBy.name}</TD>
                  <TD>
                    {voided ? (
                      <Badge variant="gray">ยกเลิกแล้ว</Badge>
                    ) : (
                      <Badge variant="green">ปกติ</Badge>
                    )}
                  </TD>
                </TR>
              );
            })}
            {recentTxns.length === 0 && (
              <TableEmpty colSpan={7} message="ยังไม่มีรายการฝาก-ถอนในระบบ" />
            )}
          </TBody>
        </Table>
      </section>
    </div>
  );
}
