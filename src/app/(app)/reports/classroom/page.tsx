import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSchoolSetting } from "@/lib/settings";
import { formatBaht } from "@/lib/money";
import { formatThaiDateTime } from "@/lib/thai-date";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";
import PrintButton from "../PrintButton";
import ExcelLinkButton from "../ExcelLinkButton";
import {
  buildClassroomReport,
  defaultRangeForYear,
  monthKeysForYear,
  monthLabel,
} from "../report-data";

/**
 * /reports/classroom — รายงานสรุปรายห้องเรียน (ADMIN, TEACHER)
 * เลือกห้อง + ช่วงเดือน -> ตารางรายนักเรียน: รหัส | ชื่อ | ยอดยกมา | รวมฝาก | รวมถอน | คงเหลือ
 * TEACHER เห็นเฉพาะห้องที่ตนเป็นครูประจำชั้น — ทุกตัวเลขคำนวณจากธุรกรรมสถานะปกติ (NORMAL)
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

export default async function ClassroomReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireRole(["ADMIN", "TEACHER", "EXECUTIVE"]);
  const sp = await searchParams;
  const school = await getSchoolSetting();

  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    orderBy: { year: "desc" },
  });

  // รายการห้องให้เลือก: ADMIN = ทุกห้องของปีที่เปิดใช้งาน, TEACHER = เฉพาะห้องที่ตนประจำชั้น
  const classrooms = activeYear
    ? await prisma.classroom.findMany({
        where: {
          academicYearId: activeYear.id,
          ...(session.role === "TEACHER" ? { teacherId: session.userId } : {}),
        },
        orderBy: { name: "asc" },
      })
    : [];

  const requestedId = firstParam(sp.classroomId);
  let selectedId = requestedId;
  let forbidden = false;

  if (session.role === "TEACHER") {
    // ครูดูได้เฉพาะห้องของตนเอง — id แปลกปลอมถือว่าไม่มีสิทธิ์
    if (selectedId && !classrooms.some((c) => c.id === selectedId)) {
      forbidden = true;
      selectedId = undefined;
    }
    // ยังไม่เลือก -> เปิดห้องแรกของตนให้อัตโนมัติ
    if (!selectedId && !forbidden) selectedId = classrooms[0]?.id;
  }

  const report = selectedId
    ? await buildClassroomReport(selectedId, {
        fromKey: firstParam(sp.from) ?? null,
        toKey: firstParam(sp.to) ?? null,
      })
    : null;

  // ตัวเลือกเดือนอิงปีการศึกษาของห้องที่เลือก (ถ้ายังไม่เลือกใช้ปีที่เปิดใช้งาน)
  const optionYear = report?.academicYear ?? activeYear?.year ?? null;
  const monthOptions = optionYear
    ? monthKeysForYear(optionYear).map((key) => ({ value: key, label: monthLabel(key) }))
    : [];
  const defaults = optionYear ? defaultRangeForYear(optionYear) : null;
  const fromValue = report?.fromKey ?? defaults?.fromKey ?? "";
  const toValue = report?.toKey ?? defaults?.toKey ?? "";

  const exportHref = report
    ? `/api/export/classroom-report?classroomId=${encodeURIComponent(
        report.classroom.id
      )}&from=${report.fromKey}&to=${report.toKey}`
    : null;

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
          <h1 className="mt-1 text-xl">รายงานสรุปรายห้องเรียน</h1>
          <p className="mt-1 text-sm text-slate-500">
            ยอดยกมา รวมฝาก รวมถอน และคงเหลือของนักเรียนรายคน
            คำนวณจากธุรกรรมสถานะปกติทั้งหมด
          </p>
        </div>
        {report && exportHref && (
          <div className="flex flex-wrap gap-2">
            <ExcelLinkButton href={exportHref} />
            <PrintButton />
          </div>
        )}
      </div>

      {!activeYear && (
        <Card>
          <p className="text-sm text-slate-600">
            ยังไม่มีปีการศึกษาที่เปิดใช้งาน — ให้ผู้ดูแลระบบเปิดปีการศึกษาที่เมนู
            &ldquo;ปีการศึกษา&rdquo; ก่อนจึงจะดูรายงานได้
          </p>
        </Card>
      )}

      {forbidden && (
        <div className="card-surface print-hide border-withdraw/40 bg-red-50 p-4 text-sm text-withdraw">
          ครูประจำชั้นดูรายงานได้เฉพาะห้องเรียนของตนเองเท่านั้น
        </div>
      )}

      {activeYear && session.role === "TEACHER" && classrooms.length === 0 && (
        <Card>
          <p className="text-sm text-slate-600">
            คุณยังไม่ได้เป็นครูประจำชั้นของห้องเรียนใดในปีการศึกษา {activeYear.year}{" "}
            — ติดต่อผู้ดูแลระบบเพื่อกำหนดห้องประจำชั้นที่เมนู &ldquo;ห้องเรียน&rdquo;
          </p>
        </Card>
      )}

      {activeYear && classrooms.length > 0 && (
        <Card title="ตัวเลือกรายงาน" className="print-hide">
          <form
            method="get"
            className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Select
              name="classroomId"
              label="ห้องเรียน"
              placeholder={session.role !== "TEACHER" ? "— เลือกห้องเรียน —" : undefined}
              options={classrooms.map((c) => ({ value: c.id, label: c.name }))}
              defaultValue={selectedId ?? ""}
              required
            />
            <Select
              name="from"
              label="ตั้งแต่เดือน"
              options={monthOptions}
              defaultValue={fromValue}
            />
            <Select
              name="to"
              label="ถึงเดือน"
              options={monthOptions}
              defaultValue={toValue}
            />
            <Button type="submit">แสดงรายงาน</Button>
          </form>
        </Card>
      )}

      {selectedId && !report && (
        <Card>
          <p className="text-sm text-slate-600">ไม่พบห้องเรียนที่เลือก</p>
        </Card>
      )}

      {activeYear && classrooms.length > 0 && !selectedId && !forbidden && (
        <Card className="print-hide">
          <p className="text-sm text-slate-600">
            เลือกห้องเรียนและช่วงเดือน แล้วกด &ldquo;แสดงรายงาน&rdquo;
            เพื่อดูตารางสรุปรายนักเรียน
          </p>
        </Card>
      )}

      {report && (
        <div className="space-y-4">
          {/* หัวกระดาษเมื่อสั่งพิมพ์ */}
          <div className="print-only text-center text-slate-900">
            <div className="text-lg font-bold">{school.schoolName}</div>
            <div className="text-sm">{school.schoolArea}</div>
            <div className="mt-2 text-base font-semibold">
              รายงานสรุปออมทรัพย์รายห้องเรียน — ห้อง {report.classroom.name}{" "}
              ปีการศึกษา {report.academicYear}
            </div>
          </div>

          {/* หัวรายงาน (แสดงทั้งบนจอและตอนพิมพ์) */}
          <div className="card-surface flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span>
                ห้องเรียน{" "}
                <span className="font-semibold text-slate-900">
                  {report.classroom.name}
                </span>{" "}
                ปีการศึกษา {report.academicYear}
              </span>
              <span>
                ช่วงข้อมูล{" "}
                <span className="font-semibold text-slate-900">
                  {report.fromLabel} – {report.toLabel}
                </span>
              </span>
              {report.teacherName && <span>ครูประจำชั้น {report.teacherName}</span>}
              <span>นักเรียน {report.studentCount} คน</span>
            </div>
            <div className="text-slate-500">
              ข้อมูล ณ วันที่ {formatThaiDateTime(generatedAt)} —
              คำนวณจากธุรกรรมสถานะปกติ (ไม่รวมรายการที่ยกเลิก)
            </div>
          </div>

          <Table minWidth="760px">
            <THead>
              <TR>
                <TH>รหัส</TH>
                <TH>ชื่อ - นามสกุล</TH>
                <TH align="right">ยอดยกมา</TH>
                <TH align="right">รวมฝาก</TH>
                <TH align="right">รวมถอน</TH>
                <TH align="right">คงเหลือ</TH>
              </TR>
            </THead>
            <TBody>
              {report.rows.map((row) => (
                <TR key={row.studentId}>
                  <TD className="whitespace-nowrap">{row.studentCode}</TD>
                  <TD>
                    {row.fullName}
                    {row.studentStatus === "GRADUATED" && (
                      <Badge variant="gray" className="ml-2">
                        จบการศึกษา
                      </Badge>
                    )}
                    {row.studentStatus === "MOVED" && (
                      <Badge variant="gray" className="ml-2">
                        ย้ายออก
                      </Badge>
                    )}
                    {!row.hasAccount && (
                      <Badge variant="gray" className="ml-2">
                        ยังไม่เปิดบัญชี
                      </Badge>
                    )}
                  </TD>
                  <TD align="right">{formatBaht(row.carry)}</TD>
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
              {report.rows.length === 0 && (
                <TableEmpty colSpan={6} message="ไม่มีนักเรียนในห้องเรียนนี้" />
              )}
              {report.rows.length > 0 && (
                <TR className="border-t-2 border-navy/30 !bg-gold/10 font-semibold">
                  <td colSpan={2} className="px-4 py-2.5 text-slate-900">
                    รวมทั้งห้อง ({report.studentCount} คน)
                  </td>
                  <TD align="right">{formatBaht(report.totals.carry)}</TD>
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
            ยอดยกมา = ยอดต้นปี + ฝาก - ถอน ก่อนเดือนเริ่มต้น · คงเหลือ = ยอดยกมา + รวมฝาก
            - รวมถอน ณ สิ้นเดือนที่เลือก · ไม่รวมรายการที่ถูกยกเลิก (VOIDED)
          </p>
        </div>
      )}
    </div>
  );
}
