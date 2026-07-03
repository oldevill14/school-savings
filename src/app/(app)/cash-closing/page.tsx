/**
 * /cash-closing — ปิดยอดเงินสดรายวัน (ข้อ 5)
 *
 * - ADMIN: เลือกวันที่ → สรุปฝาก-ถอน NORMAL ของวัน แยกตามห้อง + ยอดสุทธิ
 *   → กรอกยอดนับจริง บันทึกการปิดยอด (แสดงผลต่าง) + ดูประวัติย้อนหลัง
 * - TEACHER: เห็นเฉพาะห้องที่ตนประจำชั้น แบบดูอย่างเดียว (ไม่มีปุ่มปิดยอด)
 *
 * middleware กัน route นี้ให้เฉพาะ ADMIN + TEACHER แล้ว — ยังเช็ค role ซ้ำที่นี่
 */
import { Coins, Calculator, Lock } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { formatThaiDate, formatThaiDateFull } from "@/lib/thai-date";
import { cn } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Badge from "@/components/ui/Badge";
import StatCard from "@/components/StatCard";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";
import { dayRangeFromParam, computeDayCash } from "./cash-data";
import CashClosingForm from "./CashClosingForm";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(v: string | string[] | undefined): string | undefined {
  const value = Array.isArray(v) ? v[0] : v;
  return value?.trim() || undefined;
}

export default async function CashClosingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireRole(["ADMIN", "TEACHER"]);
  const sp = await searchParams;
  const isAdmin = session.role === "ADMIN";

  const { start, end, iso } = dayRangeFromParam(firstParam(sp.date));

  // TEACHER: จำกัดเฉพาะห้องที่ตนประจำชั้นในปีที่เปิดอยู่
  let classroomIds: string[] | undefined;
  let teacherHasRoom = true;
  if (session.role === "TEACHER") {
    const activeYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    const rooms = activeYear
      ? await prisma.classroom.findMany({
          where: { teacherId: session.userId, academicYearId: activeYear.id },
          select: { id: true },
        })
      : [];
    classroomIds = rooms.map((r) => r.id);
    teacherHasRoom = rooms.length > 0;
  }

  const summary = await computeDayCash(
    start,
    end,
    iso,
    classroomIds ? { classroomIds } : undefined
  );

  // ADMIN: การปิดยอดของวันนี้ (ถ้ามี) + ประวัติย้อนหลัง
  const existingClosing = isAdmin
    ? await prisma.cashClosing.findUnique({
        where: { closeDate_scope: { closeDate: start, scope: "ALL" } },
        include: { closedBy: { select: { name: true } } },
      })
    : null;

  const history = isAdmin
    ? await prisma.cashClosing.findMany({
        where: { scope: "ALL" },
        orderBy: { closeDate: "desc" },
        take: 30,
        include: { closedBy: { select: { name: true } } },
      })
    : [];

  const closingDiff = existingClosing
    ? Math.round(
        (Number(existingClosing.countedAmount) - Number(existingClosing.expectedNet)) * 100
      ) / 100
    : null;

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-navy text-white">
          <Coins className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl">ปิดยอดเงินสด</h1>
          <p className="text-sm text-slate-500">
            {isAdmin
              ? "สรุปเงินสดฝาก-ถอนรายวัน แยกตามห้อง แล้วบันทึกยอดนับจริง"
              : "สรุปเงินสดฝาก-ถอนรายวันของห้องที่คุณประจำชั้น (ดูอย่างเดียว)"}
          </p>
        </div>
      </header>

      {/* เลือกวันที่ */}
      <Card padded>
        <form
          method="get"
          action="/cash-closing"
          className="flex flex-col items-end gap-3 sm:flex-row"
        >
          <div className="w-full sm:w-56">
            <Input name="date" type="date" label="วันที่" defaultValue={iso} />
          </div>
          <Button type="submit">
            <Calculator className="h-4 w-4" />
            แสดงสรุป
          </Button>
        </form>
        <p className="mt-2 text-sm text-slate-500">
          วันที่ {formatThaiDateFull(start)}
        </p>
      </Card>

      {session.role === "TEACHER" && !teacherHasRoom && (
        <Card>
          <p className="text-sm text-slate-600">
            คุณยังไม่ได้เป็นครูประจำชั้นของห้องใดในปีการศึกษาที่เปิดอยู่ — จึงยังไม่มีข้อมูลเงินสดให้แสดง
          </p>
        </Card>
      )}

      {/* สรุปยอดรวม */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="ฝากรวมวันนี้"
          value={formatBaht(summary.totals.depositTotal)}
          hint={`${summary.totals.depositCount.toLocaleString("th-TH")} รายการ`}
          tone="green"
        />
        <StatCard
          title="ถอนรวมวันนี้"
          value={formatBaht(summary.totals.withdrawTotal)}
          hint={`${summary.totals.withdrawCount.toLocaleString("th-TH")} รายการ`}
          tone="red"
        />
        <StatCard
          title="ยอดสุทธิที่ต้องนำส่ง"
          value={formatBaht(summary.totals.net)}
          hint="ฝากรวม − ถอนรวม"
          tone="gold"
        />
      </div>

      {/* ตารางแยกตามห้อง */}
      <Table minWidth="720px">
        <THead>
          <TR>
            <TH>ห้องเรียน</TH>
            <TH align="right">ฝาก (รายการ)</TH>
            <TH align="right">ฝากรวม</TH>
            <TH align="right">ถอน (รายการ)</TH>
            <TH align="right">ถอนรวม</TH>
            <TH align="right">สุทธิ</TH>
          </TR>
        </THead>
        <TBody>
          {summary.rows.map((r) => (
            <TR key={r.classroomId}>
              <TD className="font-medium text-slate-900">{r.classroomName}</TD>
              <TD align="right">{r.depositCount.toLocaleString("th-TH")}</TD>
              <TD align="right" className="text-deposit">
                {formatBaht(r.depositTotal)}
              </TD>
              <TD align="right">{r.withdrawCount.toLocaleString("th-TH")}</TD>
              <TD align="right" className="text-withdraw">
                {formatBaht(r.withdrawTotal)}
              </TD>
              <TD align="right" className="font-semibold">
                {formatBaht(r.net)}
              </TD>
            </TR>
          ))}
          {summary.rows.length === 0 && (
            <TableEmpty colSpan={6} message="ไม่มีรายการฝาก-ถอนในวันที่เลือก" />
          )}
          {summary.rows.length > 0 && (
            <TR className="border-t-2 border-navy/30 !bg-gold/10 font-semibold">
              <TD className="text-slate-900">รวมทั้งหมด</TD>
              <TD align="right">
                {summary.totals.depositCount.toLocaleString("th-TH")}
              </TD>
              <TD align="right" className="text-deposit">
                {formatBaht(summary.totals.depositTotal)}
              </TD>
              <TD align="right">
                {summary.totals.withdrawCount.toLocaleString("th-TH")}
              </TD>
              <TD align="right" className="text-withdraw">
                {formatBaht(summary.totals.withdrawTotal)}
              </TD>
              <TD align="right" className="text-slate-900">
                {formatBaht(summary.totals.net)}
              </TD>
            </TR>
          )}
        </TBody>
      </Table>

      {/* ADMIN: ปิดยอด / ผลการปิดยอด */}
      {isAdmin &&
        (existingClosing ? (
          <Card
            title="ปิดยอดแล้ว"
            description={`ปิดโดย ${existingClosing.closedBy.name} · ${formatThaiDate(
              existingClosing.createdAt
            )}`}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <div className="text-sm text-slate-500">ยอดที่ระบบคำนวณ</div>
                <div className="text-xl font-bold tabular-nums text-slate-900">
                  {formatBaht(existingClosing.expectedNet)}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-500">ยอดนับได้จริง</div>
                <div className="text-xl font-bold tabular-nums text-slate-900">
                  {formatBaht(existingClosing.countedAmount)}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-500">ผลต่าง</div>
                <div
                  className={cn(
                    "text-xl font-bold tabular-nums",
                    closingDiff === 0 ? "text-deposit" : "text-withdraw"
                  )}
                >
                  {closingDiff === 0
                    ? "ตรงพอดี"
                    : closingDiff! > 0
                      ? `เกิน ${formatBaht(closingDiff!)}`
                      : `ขาด ${formatBaht(Math.abs(closingDiff!))}`}
                </div>
              </div>
            </div>
            {existingClosing.note && (
              <p className="mt-3 text-sm text-slate-600">
                หมายเหตุ: {existingClosing.note}
              </p>
            )}
          </Card>
        ) : (
          <Card
            title="บันทึกการปิดยอด"
            description="กรอกยอดเงินสดที่นับได้จริงเพื่อปิดยอดของวันที่เลือก"
          >
            <CashClosingForm date={iso} expectedNet={summary.totals.net} />
          </Card>
        ))}

      {session.role === "TEACHER" && (
        <div className="flex items-start gap-2 rounded-card border border-line bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            การปิดยอดเงินสดเป็นหน้าที่ของผู้ดูแลระบบ — หน้านี้แสดงข้อมูลของห้องคุณเพื่อการตรวจสอบเท่านั้น
          </span>
        </div>
      )}

      {/* ADMIN: ประวัติการปิดยอด */}
      {isAdmin && (
        <section className="space-y-2">
          <h2 className="text-base">ประวัติการปิดยอดย้อนหลัง</h2>
          <Table minWidth="720px">
            <THead>
              <TR>
                <TH>วันที่ปิดยอด</TH>
                <TH align="right">ยอดที่คำนวณ</TH>
                <TH align="right">ยอดนับได้จริง</TH>
                <TH align="right">ผลต่าง</TH>
                <TH>ผู้ปิดยอด</TH>
                <TH>หมายเหตุ</TH>
              </TR>
            </THead>
            <TBody>
              {history.map((h) => {
                const d =
                  Math.round(
                    (Number(h.countedAmount) - Number(h.expectedNet)) * 100
                  ) / 100;
                return (
                  <TR key={h.id}>
                    <TD className="whitespace-nowrap">{formatThaiDate(h.closeDate)}</TD>
                    <TD align="right">{formatBaht(h.expectedNet)}</TD>
                    <TD align="right">{formatBaht(h.countedAmount)}</TD>
                    <TD align="right">
                      {d === 0 ? (
                        <Badge variant="green">ตรงพอดี</Badge>
                      ) : (
                        <Badge variant="red">
                          {d > 0 ? "เกิน " : "ขาด "}
                          {formatBaht(Math.abs(d))}
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-slate-600">{h.closedBy.name}</TD>
                    <TD className="max-w-[16rem] text-slate-600">{h.note ?? "-"}</TD>
                  </TR>
                );
              })}
              {history.length === 0 && (
                <TableEmpty colSpan={6} message="ยังไม่มีประวัติการปิดยอด" />
              )}
            </TBody>
          </Table>
        </section>
      )}
    </div>
  );
}
