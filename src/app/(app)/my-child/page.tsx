/**
 * /my-child — มุมผู้ปกครอง (PARENT เท่านั้น) — mobile-first
 *
 * - รองรับผู้ปกครองหลายบุตร: มีแถบสลับบุตร (?child=<studentId>) เมื่อผูกไว้มากกว่า 1 คน
 *   ลูกเดียว = UX เดิม (ไม่มีแถบสลับ)
 * - BalanceCard ใหญ่เห็นยอดคงเหลือของบุตรที่เลือกใน 1 จอแรกโดยไม่ต้อง scroll
 * - ตราสัญลักษณ์นักออม (MilestoneBadges) + กราฟยอดสะสมรายเดือน (SavingsTrendChart)
 * - ประวัติฝาก-ถอน 20 รายการล่าสุด + ปุ่ม "ดูสมุดบัญชี" ไป /passbook/[studentId]
 *
 * ความปลอดภัย: ดึงข้อมูลเฉพาะ session.studentIds (ตรวจฝั่ง server) — ผู้ปกครอง
 * เห็นได้เฉพาะบัญชีของบุตรตนเอง; ค่า ?child ต้องอยู่ใน studentIds เท่านั้น
 */
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { formatThaiDate } from "@/lib/thai-date";
import { cn } from "@/lib/utils";
import BalanceCard from "@/components/BalanceCard";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import MilestoneBadges from "@/components/MilestoneBadges";
import LineLinkCard from "@/components/LineLinkCard";
import SavingsTrendChart from "@/components/charts/SavingsTrendChart";
import { buildSavingsTrend, type MilestoneTxn } from "@/lib/milestones";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";

export const dynamic = "force-dynamic";

export default async function MyChildPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const session = await requireRole(["PARENT"]);
  const ids = session.studentIds;

  // ผู้ปกครองต้องถูกผูกกับนักเรียนก่อนจึงเห็นข้อมูลได้
  if (ids.length === 0) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4">
        <h1 className="text-xl">ยอดของลูก</h1>
        <Card title="ยังไม่ได้ผูกบัญชีกับนักเรียน">
          <p className="text-sm text-slate-600">
            บัญชีผู้ใช้ของท่านยังไม่ได้เชื่อมกับนักเรียนคนใด
            กรุณาติดต่อครูการเงินหรือครูประจำชั้นเพื่อผูกบัญชีกับบุตรหลานของท่าน
          </p>
        </Card>
      </div>
    );
  }

  const children = await prisma.student.findMany({
    where: { id: { in: ids } },
    include: { classroom: { select: { name: true } } },
    orderBy: { studentCode: "asc" },
  });

  if (children.length === 0) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4">
        <h1 className="text-xl">ยอดของลูก</h1>
        <Card title="ไม่พบข้อมูลนักเรียน">
          <p className="text-sm text-slate-600">
            ไม่พบข้อมูลนักเรียนที่ผูกกับบัญชีของท่านในระบบ
            กรุณาติดต่อครูการเงินเพื่อตรวจสอบข้อมูล
          </p>
        </Card>
      </div>
    );
  }

  // บุตรที่เลือก — ?child ต้องเป็นหนึ่งใน studentIds ของผู้ปกครองเท่านั้น (กันสวมสิทธิ์)
  const sp = await searchParams;
  const selected =
    (sp.child && ids.includes(sp.child)
      ? children.find((c) => c.id === sp.child)
      : undefined) ?? children[0];

  const studentName = `${selected.firstName} ${selected.lastName}`;
  const multi = children.length > 1;

  // บัญชีของปีการศึกษาที่ active — ถ้าไม่มี ใช้บัญชีปีล่าสุดแทน (ช่วงคาบเกี่ยวเปลี่ยนปี)
  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });

  let account = activeYear
    ? await prisma.account.findUnique({
        where: {
          studentId_academicYearId: {
            studentId: selected.id,
            academicYearId: activeYear.id,
          },
        },
        include: { academicYear: true },
      })
    : null;

  if (!account) {
    account = await prisma.account.findFirst({
      where: { studentId: selected.id },
      orderBy: { academicYear: { year: "desc" } },
      include: { academicYear: true },
    });
  }

  // แถบสลับบุตร (แสดงเมื่อมีมากกว่า 1 คน)
  const childSwitcher = multi ? (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-500">บุตรของท่าน:</span>
      {children.map((c) => (
        <Link
          key={c.id}
          href={`/my-child?child=${c.id}`}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            c.id === selected.id
              ? "border-navy bg-navy font-medium text-white"
              : "border-line bg-white text-slate-600 hover:bg-slate-50"
          )}
        >
          {c.firstName} {c.lastName}
        </Link>
      ))}
    </div>
  ) : null;

  const header = (
    <div>
      <h1 className="text-xl">ยอดของลูก</h1>
      {account && (
        <p className="mt-0.5 text-sm text-slate-500">
          ปีการศึกษา {account.academicYear.year}
        </p>
      )}
    </div>
  );

  if (!account) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4">
        {header}
        {childSwitcher}
        <Card title="ยังไม่มีบัญชีออมทรัพย์">
          <p className="text-sm text-slate-600">
            {studentName} ({selected.studentCode}) ยังไม่มีบัญชีออมทรัพย์ในระบบ
            กรุณาติดต่อครูประจำชั้นเพื่อเปิดบัญชี
          </p>
        </Card>
      </div>
    );
  }

  const allTxns = await prisma.transaction.findMany({
    where: { accountId: account.id },
    orderBy: [{ txnDate: "asc" }, { createdAt: "asc" }],
  });

  // ข้อมูลย่อสำหรับกราฟ/ตราสัญลักษณ์ (Prisma Decimal -> number)
  const txnData: MilestoneTxn[] = allTxns.map((t) => ({
    type: t.type,
    status: t.status,
    txnDate: t.txnDate,
    amount: Number(t.amount),
  }));

  const recent = [...allTxns].reverse().slice(0, 20); // ใหม่สุดก่อน
  const lastNormalTxn = [...allTxns].reverse().find((t) => t.status === "NORMAL");
  const trend = buildSavingsTrend(Number(account.openingBalance), txnData);

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      {header}
      {childSwitcher}

      {/* ยอดคงเหลือ — ต้องเห็นใน 1 จอแรกบนมือถือ */}
      <BalanceCard
        studentName={studentName}
        studentCode={selected.studentCode}
        classroomName={selected.classroom.name}
        balance={account.balance.toString()}
        updatedAt={lastNormalTxn?.txnDate}
      />

      <Link
        href={`/passbook/${selected.id}`}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-light"
      >
        <BookOpen className="h-4 w-4" />
        ดูสมุดบัญชี
      </Link>

      {/* รับแจ้งเตือนผ่าน LINE (ผูกเป็นราย "ผู้ใช้" ไม่ผูกกับบุตรคนใดคนหนึ่ง) */}
      <LineLinkCard />

      {/* ตราสัญลักษณ์นักออม */}
      <Card title="ตราสัญลักษณ์นักออม">
        <MilestoneBadges
          balance={Number(account.balance)}
          transactions={txnData}
          showLocked
        />
      </Card>

      {/* กราฟยอดสะสมรายเดือน — แสดงเมื่อมีข้อมูลอย่างน้อย 2 เดือน */}
      {trend.length >= 2 && (
        <Card title="กราฟการออม (ยอดสะสมรายเดือน)">
          <SavingsTrendChart data={trend} />
        </Card>
      )}

      {/* ประวัติ 20 รายการล่าสุด */}
      <section className="space-y-3">
        <h2 className="text-base">ประวัติล่าสุด 20 รายการ</h2>
        <Table minWidth="360px">
          <THead>
            <TR>
              <TH>วันที่</TH>
              <TH>รายการ</TH>
              <TH align="right">จำนวนเงิน</TH>
            </TR>
          </THead>
          <TBody>
            {recent.map((t) => {
              const voided = t.status === "VOIDED";
              const isDeposit = t.type === "DEPOSIT";
              return (
                <TR key={t.id}>
                  <TD
                    className={cn(
                      "whitespace-nowrap",
                      voided && "line-through text-slate-400"
                    )}
                  >
                    {formatThaiDate(t.txnDate)}
                  </TD>
                  <TD>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={isDeposit ? "green" : "red"}>
                        {isDeposit ? "ฝาก" : "ถอน"}
                      </Badge>
                      {voided && <Badge variant="gray">ยกเลิกแล้ว</Badge>}
                    </span>
                    {t.note && (
                      <span
                        className={cn(
                          "mt-1 block text-xs text-slate-400",
                          voided && "line-through"
                        )}
                      >
                        {t.note}
                      </span>
                    )}
                  </TD>
                  <TD
                    align="right"
                    className={cn(
                      "font-medium",
                      voided
                        ? "line-through text-slate-400"
                        : isDeposit
                          ? "text-deposit"
                          : "text-withdraw"
                    )}
                  >
                    {isDeposit ? "+" : "-"}
                    {formatBaht(t.amount)}
                  </TD>
                </TR>
              );
            })}
            {recent.length === 0 && (
              <TableEmpty colSpan={3} message="ยังไม่มีรายการฝาก-ถอน" />
            )}
          </TBody>
        </Table>
      </section>
    </div>
  );
}
