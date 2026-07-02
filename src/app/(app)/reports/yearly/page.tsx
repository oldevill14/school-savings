import Link from "next/link";
import { ArrowLeft, TrendingDown, TrendingUp, Users, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { formatThaiDateTime } from "@/lib/thai-date";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";
import StatCard from "@/components/StatCard";
import PrintButton from "../PrintButton";
import { buildYearlyReport } from "../report-data";

/**
 * /reports/yearly — รายงานสรุปรายปีการศึกษา (ADMIN, TEACHER)
 * เลือกปีการศึกษา -> สรุปทุกห้อง: ห้อง | จำนวนบัญชี | รวมฝาก | รวมถอน | คงเหลือรวม
 * + แถวรวมทั้งโรงเรียน + สรุปยอดฝาก-ถอนรายเดือนของปีนั้น
 * ทุกตัวเลขคำนวณจากธุรกรรมสถานะปกติ (NORMAL) ไม่ใช้ยอดคงเหลือสะสม
 */
export const dynamic = "force-dynamic";

const PRINT_STYLE = `
.print-only { display: none; }
@media print {
  @page { size: A4; margin: 12mm; }
  body { background: #fff !important; }
  aside, nav, header.sticky, .print-hide { display: none !important; }
  main { padding: 0 !important; }
  div[class*="pl-64"] { padding-left: 0 !important; }
  .print-only { display: block !important; }
  .card-surface { box-shadow: none !important; border-color: #94a3b8 !important; }
  table { min-width: 0 !important; width: 100% !important; }
  thead { background: #fff !important; }
  thead th { color: #000 !important; border-bottom: 1.5pt solid #000 !important; }
  tbody tr { break-inside: avoid; background: #fff !important; }
}
`;

type SearchParams = Record<string, string | string[] | undefined>;

function firstParam(v: string | string[] | undefined): string | undefined {
  const value = Array.isArray(v) ? v[0] : v;
  return value?.trim() || undefined;
}

export default async function YearlyReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(["ADMIN", "TEACHER"]);
  const sp = await searchParams;

  const years = await prisma.academicYear.findMany({
    orderBy: { year: "desc" },
    select: { year: true, isActive: true },
  });

  // ปีที่เลือก: จาก query ?year= (ต้องมีอยู่จริง) -> ปีที่เปิดใช้งาน -> ปีล่าสุด
  const requestedYear = Number(firstParam(sp.year));
  const selectedYear =
    Number.isInteger(requestedYear) && years.some((y) => y.year === requestedYear)
      ? requestedYear
      : years.find((y) => y.isActive)?.year ?? years[0]?.year ?? null;

  const report = selectedYear !== null ? await buildYearlyReport(selectedYear) : null;
  const generatedAt = new Date();

  return (
    <div className="space-y-5">
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />

      {/* หัวหน้าเพจ (เฉพาะบนจอ) */}
      <div className="print-hide flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/reports"
            className="link-navy inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            รายงานสรุป
          </Link>
          <h1 className="mt-1 text-xl">รายงานสรุปรายปีการศึกษา</h1>
          <p className="mt-1 text-sm text-slate-500">
            สรุปยอดออมทรัพย์ทุกห้องเรียนและรายเดือนของปีการศึกษา
            คำนวณจากธุรกรรมสถานะปกติทั้งหมด
          </p>
        </div>
        {report && <PrintButton />}
      </div>

      {years.length === 0 && (
        <Card>
          <p className="text-sm text-slate-600">
            ยังไม่มีปีการศึกษาในระบบ — ให้ผู้ดูแลระบบเพิ่มปีการศึกษาที่เมนู
            &ldquo;ปีการศึกษา&rdquo; ก่อนจึงจะดูรายงานได้
          </p>
        </Card>
      )}

      {years.length > 0 && (
        <Card title="ตัวเลือกรายงาน" className="print-hide">
          <form
            method="get"
            className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Select
              name="year"
              label="ปีการศึกษา"
              options={years.map((y) => ({
                value: String(y.year),
                label: `ปีการศึกษา ${y.year}${y.isActive ? " (ปีปัจจุบัน)" : ""}`,
              }))}
              defaultValue={selectedYear !== null ? String(selectedYear) : ""}
            />
            <Button type="submit">แสดงรายงาน</Button>
          </form>
        </Card>
      )}

      {report && (
        <div className="space-y-5">
          {/* หัวกระดาษเมื่อสั่งพิมพ์ */}
          <div className="print-only text-center text-slate-900">
            <div className="text-lg font-bold">โรงเรียนบ้านกะดาด</div>
            <div className="text-sm">
              สำนักงานเขตพื้นที่การศึกษาประถมศึกษาสุรินทร์ เขต 3
            </div>
            <div className="mt-2 text-base font-semibold">
              รายงานสรุปออมทรัพย์ประจำปีการศึกษา {report.year}
            </div>
          </div>

          {/* หัวรายงาน (แสดงทั้งบนจอและตอนพิมพ์) */}
          <div className="card-surface flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                ปีการศึกษา{" "}
                <span className="font-semibold text-slate-900">{report.year}</span>
              </span>
              {report.isActive && <Badge variant="gold">ปีปัจจุบัน</Badge>}
              <span>บัญชีทั้งหมด {report.totals.accountCount} บัญชี</span>
            </div>
            <div className="text-slate-500">
              ข้อมูล ณ วันที่ {formatThaiDateTime(generatedAt)} —
              คำนวณจากธุรกรรมสถานะปกติ (ไม่รวมรายการที่ยกเลิก)
            </div>
          </div>

          {/* สรุปตัวเลขรวม (เฉพาะบนจอ — ตอนพิมพ์ใช้แถวรวมในตาราง) */}
          <div className="print-hide grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="จำนวนบัญชี"
              value={`${report.totals.accountCount} บัญชี`}
              icon={Users}
              tone="navy"
            />
            <StatCard
              title="รวมฝากทั้งปี"
              value={formatBaht(report.totals.deposit)}
              icon={TrendingUp}
              tone="green"
              hint="บาท"
            />
            <StatCard
              title="รวมถอนทั้งปี"
              value={formatBaht(report.totals.withdraw)}
              icon={TrendingDown}
              tone="red"
              hint="บาท"
            />
            <StatCard
              title="คงเหลือรวมทั้งโรงเรียน"
              value={formatBaht(report.totals.closing)}
              icon={Wallet}
              tone="gold"
              hint="รวมยอดยกมาต้นปี"
            />
          </div>

          {/* ตารางสรุปรายห้อง */}
          <section className="space-y-2">
            <h2 className="text-base">สรุปรายห้องเรียน</h2>
            <Table minWidth="720px">
              <THead>
                <TR>
                  <TH>ห้อง</TH>
                  <TH align="right">จำนวนบัญชี</TH>
                  <TH align="right">รวมฝาก</TH>
                  <TH align="right">รวมถอน</TH>
                  <TH align="right">คงเหลือรวม</TH>
                </TR>
              </THead>
              <TBody>
                {report.classrooms.map((row) => (
                  <TR key={row.classroomId ?? "orphan"}>
                    <TD>
                      <span className="font-medium text-slate-900">{row.name}</span>
                      {row.teacherName && (
                        <span className="ml-2 text-xs text-slate-500">
                          ครูประจำชั้น {row.teacherName}
                        </span>
                      )}
                    </TD>
                    <TD align="right">{row.accountCount}</TD>
                    <TD align="right" className="text-deposit">
                      {formatBaht(row.deposit)}
                    </TD>
                    <TD align="right" className="text-withdraw">
                      {formatBaht(row.withdraw)}
                    </TD>
                    <TD align="right" className="font-semibold">
                      {formatBaht(row.closing)}
                    </TD>
                  </TR>
                ))}
                {report.classrooms.length === 0 && (
                  <TableEmpty
                    colSpan={5}
                    message={`ยังไม่มีห้องเรียนในปีการศึกษา ${report.year}`}
                  />
                )}
                {report.classrooms.length > 0 && (
                  <TR className="border-t-2 border-navy/30 !bg-gold/10 font-semibold">
                    <TD className="text-slate-900">รวมทั้งโรงเรียน</TD>
                    <TD align="right">{report.totals.accountCount}</TD>
                    <TD align="right" className="text-deposit">
                      {formatBaht(report.totals.deposit)}
                    </TD>
                    <TD align="right" className="text-withdraw">
                      {formatBaht(report.totals.withdraw)}
                    </TD>
                    <TD align="right" className="text-slate-900">
                      {formatBaht(report.totals.closing)}
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
            <p className="print-hide text-xs text-slate-500">
              คงเหลือรวม = ยอดยกมาต้นปี ({formatBaht(report.totals.opening)} บาท) + รวมฝาก
              - รวมถอน · ไม่รวมรายการที่ถูกยกเลิก (VOIDED)
            </p>
          </section>

          {/* ตารางสรุปรายเดือน */}
          <section className="space-y-2">
            <h2 className="text-base">สรุปรายเดือน ปีการศึกษา {report.year}</h2>
            <Table minWidth="560px">
              <THead>
                <TR>
                  <TH>เดือน</TH>
                  <TH align="right">รวมฝาก</TH>
                  <TH align="right">รวมถอน</TH>
                  <TH align="right">เปลี่ยนแปลงสุทธิ</TH>
                </TR>
              </THead>
              <TBody>
                {report.monthly.map((row) => (
                  <TR key={row.month}>
                    <TD>{row.label}</TD>
                    <TD align="right" className="text-deposit">
                      {formatBaht(row.deposit)}
                    </TD>
                    <TD align="right" className="text-withdraw">
                      {formatBaht(row.withdraw)}
                    </TD>
                    <TD
                      align="right"
                      className={
                        row.net.startsWith("-")
                          ? "font-medium text-withdraw"
                          : "font-medium text-slate-900"
                      }
                    >
                      {formatBaht(row.net)}
                    </TD>
                  </TR>
                ))}
                {report.monthly.length === 0 && (
                  <TableEmpty colSpan={4} message="ยังไม่มีธุรกรรมในปีการศึกษานี้" />
                )}
                {report.monthly.length > 0 && (
                  <TR className="border-t-2 border-navy/30 !bg-gold/10 font-semibold">
                    <TD className="text-slate-900">รวมทั้งปี</TD>
                    <TD align="right" className="text-deposit">
                      {formatBaht(report.totals.deposit)}
                    </TD>
                    <TD align="right" className="text-withdraw">
                      {formatBaht(report.totals.withdraw)}
                    </TD>
                    <TD align="right" className="text-slate-900">
                      {formatBaht(report.totals.net)}
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </section>
        </div>
      )}
    </div>
  );
}
