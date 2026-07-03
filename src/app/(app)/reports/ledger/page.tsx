import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSchoolSetting } from "@/lib/settings";
import { formatBaht } from "@/lib/money";
import { formatThaiDateTime } from "@/lib/thai-date";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import PrintButton from "../PrintButton";
import ExcelLinkButton from "../ExcelLinkButton";
import {
  buildLedgerReport,
  defaultRangeForYear,
  monthKeysForYear,
  monthLabel,
} from "../report-data";

/**
 * /reports/ledger — ทะเบียนคุมเงินออมทรัพย์นักเรียน (ADMIN, TEACHER, EXECUTIVE อ่าน)
 *
 * เลือกขอบเขต (ทั้งโรงเรียน / รายห้อง) + ช่วงเดือน -> ทะเบียนแนวราชการรายบัญชี:
 *   วันที่ | รายการ | รับ (ฝาก) | จ่าย (ถอน) | คงเหลือ | ผู้บันทึก  พร้อมยอดยกมา/ยกไป
 * - TEACHER เห็นเฉพาะห้องของตน (ไม่มีตัวเลือกทั้งโรงเรียน)
 * - ทุกตัวเลขคำนวณจากธุรกรรมสถานะปกติ (NORMAL) · พิมพ์ A4 แนวนอน + ดาวน์โหลด Excel
 */
export const dynamic = "force-dynamic";

const PRINT_STYLE = `
.print-only { display: none; }
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  body { background: #fff !important; }
  aside, nav, header.sticky, .print-hide { display: none !important; }
  main { padding: 0 !important; }
  div[class*="pl-64"] { padding-left: 0 !important; }
  .print-only { display: block !important; }
  .card-surface { box-shadow: none !important; border-color: #94a3b8 !important; }
  .ledger-account { break-inside: avoid; }
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

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireRole(["ADMIN", "TEACHER", "EXECUTIVE"]);
  const sp = await searchParams;

  const [activeYear, school] = await Promise.all([
    prisma.academicYear.findFirst({
      where: { isActive: true },
      orderBy: { year: "desc" },
    }),
    getSchoolSetting(),
  ]);

  const canSeeAll = session.role !== "TEACHER";

  // ห้องให้เลือก: ADMIN/EXECUTIVE = ทุกห้องของปีที่เปิด, TEACHER = เฉพาะห้องตน
  const classrooms = activeYear
    ? await prisma.classroom.findMany({
        where: {
          academicYearId: activeYear.id,
          ...(session.role === "TEACHER" ? { teacherId: session.userId } : {}),
        },
        orderBy: { name: "asc" },
      })
    : [];

  // ---------- ตัดสิน scope ----------
  const requestedScope = firstParam(sp.scope);
  let scope: string | undefined;
  let forbidden = false;

  if (session.role === "TEACHER") {
    if (requestedScope === "ALL") {
      forbidden = true;
    } else if (requestedScope && !classrooms.some((c) => c.id === requestedScope)) {
      forbidden = true;
    } else {
      scope = requestedScope;
    }
    if (!scope && !forbidden) scope = classrooms[0]?.id;
  } else {
    // ADMIN / EXECUTIVE
    if (requestedScope === "ALL") scope = "ALL";
    else if (requestedScope && classrooms.some((c) => c.id === requestedScope))
      scope = requestedScope;
    else scope = activeYear ? "ALL" : undefined;
  }

  const report =
    scope && !forbidden
      ? await buildLedgerReport(scope, {
          fromKey: firstParam(sp.from) ?? null,
          toKey: firstParam(sp.to) ?? null,
        })
      : null;

  // ตัวเลือกเดือนอิงปีการศึกษาของ report (หรือปีที่เปิดใช้งาน)
  const optionYear = report?.academicYear ?? activeYear?.year ?? null;
  const monthOptions = optionYear
    ? monthKeysForYear(optionYear).map((key) => ({ value: key, label: monthLabel(key) }))
    : [];
  const defaults = optionYear ? defaultRangeForYear(optionYear) : null;
  const fromValue = report?.fromKey ?? defaults?.fromKey ?? "";
  const toValue = report?.toKey ?? defaults?.toKey ?? "";

  const scopeOptions = [
    ...(canSeeAll ? [{ value: "ALL", label: "ทั้งโรงเรียน" }] : []),
    ...classrooms.map((c) => ({ value: c.id, label: c.name })),
  ];

  const exportHref = report
    ? `/api/export/ledger?scope=${encodeURIComponent(report.scope)}&from=${report.fromKey}&to=${report.toKey}`
    : null;

  const generatedAt = new Date();

  return (
    <div className="space-y-5">
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />

      {/* หัวหน้าเพจ (เฉพาะบนจอ) */}
      <div className="print-hide flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/reports" className="link-navy inline-flex items-center gap-1 text-sm">
            <ArrowLeft className="h-4 w-4" />
            รายงานสรุป
          </Link>
          <h1 className="mt-1 text-xl">ทะเบียนคุมเงินออมทรัพย์นักเรียน</h1>
          <p className="mt-1 text-sm text-slate-500">
            ทะเบียนแนวราชการรายบัญชี — รับ จ่าย คงเหลือ พร้อมยอดยกมา/ยกไป
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
            &ldquo;ปีการศึกษา&rdquo; ก่อนจึงจะดูทะเบียนได้
          </p>
        </Card>
      )}

      {forbidden && (
        <div className="card-surface print-hide border-withdraw/40 bg-red-50 p-4 text-sm text-withdraw">
          ครูประจำชั้นดูทะเบียนได้เฉพาะห้องเรียนของตนเองเท่านั้น
        </div>
      )}

      {activeYear && session.role === "TEACHER" && classrooms.length === 0 && (
        <Card>
          <p className="text-sm text-slate-600">
            คุณยังไม่ได้เป็นครูประจำชั้นของห้องเรียนใดในปีการศึกษา {activeYear.year} —
            ติดต่อผู้ดูแลระบบเพื่อกำหนดห้องประจำชั้นที่เมนู &ldquo;ห้องเรียน&rdquo;
          </p>
        </Card>
      )}

      {activeYear && scopeOptions.length > 0 && (
        <Card title="ตัวเลือกทะเบียน" className="print-hide">
          <form
            method="get"
            className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Select
              name="scope"
              label="ขอบเขต"
              options={scopeOptions}
              defaultValue={scope ?? ""}
            />
            <Select name="from" label="ตั้งแต่เดือน" options={monthOptions} defaultValue={fromValue} />
            <Select name="to" label="ถึงเดือน" options={monthOptions} defaultValue={toValue} />
            <Button type="submit">แสดงทะเบียน</Button>
          </form>
        </Card>
      )}

      {report && (
        <div className="space-y-5">
          {/* หัวกระดาษเมื่อสั่งพิมพ์ */}
          <div className="print-only text-center text-slate-900">
            <div className="text-lg font-bold">{school.schoolName}</div>
            <div className="text-sm">{school.schoolArea}</div>
            <div className="mt-2 text-base font-semibold">ทะเบียนคุมเงินออมทรัพย์นักเรียน</div>
            <div className="text-sm">
              {report.scopeLabel} · ปีการศึกษา {report.academicYear} · ช่วง {report.fromLabel} –{" "}
              {report.toLabel}
            </div>
          </div>

          {/* หัวรายงาน (บนจอ) */}
          <div className="card-surface print-hide flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span>
                ขอบเขต{" "}
                <span className="font-semibold text-slate-900">{report.scopeLabel}</span>
              </span>
              <span>
                ปีการศึกษา{" "}
                <span className="font-semibold text-slate-900">{report.academicYear}</span>
              </span>
              <span>
                ช่วงข้อมูล{" "}
                <span className="font-semibold text-slate-900">
                  {report.fromLabel} – {report.toLabel}
                </span>
              </span>
              <span>{report.accounts.length} บัญชี</span>
            </div>
            <div className="text-slate-500">
              ข้อมูล ณ วันที่ {formatThaiDateTime(generatedAt)} — คำนวณจากธุรกรรมสถานะปกติ
            </div>
          </div>

          {report.accounts.length === 0 && (
            <Card>
              <p className="text-sm text-slate-600">
                ยังไม่มีบัญชีนักเรียนในขอบเขตที่เลือก
              </p>
            </Card>
          )}

          {/* ทะเบียนรายบัญชี */}
          {report.accounts.map((acc) => (
            <section key={acc.studentId} className="ledger-account space-y-2">
              <h2 className="text-base">
                บัญชีเลขที่ {acc.studentCode} — {acc.fullName}{" "}
                <span className="text-sm font-normal text-slate-500">
                  (ห้อง {acc.classroomName})
                </span>
              </h2>
              <Table minWidth="820px">
                <THead>
                  <TR>
                    <TH>วันที่</TH>
                    <TH>รายการ</TH>
                    <TH align="right">รับ (ฝาก)</TH>
                    <TH align="right">จ่าย (ถอน)</TH>
                    <TH align="right">คงเหลือ</TH>
                    <TH>ผู้บันทึก</TH>
                  </TR>
                </THead>
                <TBody>
                  {/* ยอดยกมา */}
                  <TR className="italic text-slate-600">
                    <td className="px-4 py-2.5" colSpan={2}>
                      ยอดยกมา ({report.fromLabel})
                    </td>
                    <TD align="right">-</TD>
                    <TD align="right">-</TD>
                    <TD align="right" className="font-semibold not-italic text-slate-900">
                      {formatBaht(acc.carry)}
                    </TD>
                    <TD />
                  </TR>

                  {acc.entries.map((e) => (
                    <TR key={e.txnId}>
                      <TD className="whitespace-nowrap">{e.dateLabel}</TD>
                      <TD>{e.description}</TD>
                      <TD align="right" className="text-deposit">
                        {e.isDeposit ? formatBaht(e.deposit) : ""}
                      </TD>
                      <TD align="right" className="text-withdraw">
                        {e.isDeposit ? "" : formatBaht(e.withdraw)}
                      </TD>
                      <TD align="right" className="font-semibold">
                        {formatBaht(e.balance)}
                      </TD>
                      <TD className="whitespace-nowrap text-slate-600">{e.recordedBy}</TD>
                    </TR>
                  ))}

                  {/* ยอดยกไป */}
                  <TR className="border-t-2 border-navy/30 !bg-gold/10 font-semibold">
                    <td className="px-4 py-2.5 text-slate-900" colSpan={2}>
                      ยอดยกไป ({report.toLabel})
                    </td>
                    <TD align="right" className="text-deposit">
                      {formatBaht(acc.totalDeposit)}
                    </TD>
                    <TD align="right" className="text-withdraw">
                      {formatBaht(acc.totalWithdraw)}
                    </TD>
                    <TD align="right" className="text-slate-900">
                      {formatBaht(acc.closing)}
                    </TD>
                    <TD />
                  </TR>
                </TBody>
              </Table>
            </section>
          ))}

          {/* แถวรวมทุกบัญชี */}
          {report.accounts.length > 0 && (
            <div className="card-surface flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-navy/30 bg-gold/10 p-4 text-sm font-semibold text-slate-900">
              <span>รวมทุกบัญชี ({report.accounts.length} บัญชี)</span>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <span className="text-deposit">
                  รับรวม {formatBaht(report.totals.deposit)}
                </span>
                <span className="text-withdraw">
                  จ่ายรวม {formatBaht(report.totals.withdraw)}
                </span>
                <span>คงเหลือรวม {formatBaht(report.totals.closing)}</span>
              </div>
            </div>
          )}

          {/* ช่องเซ็น ผู้จัดทำ / ผู้ตรวจ */}
          <div className="grid grid-cols-1 gap-8 pt-6 text-center text-sm sm:grid-cols-2">
            <div>
              <div className="mb-8">ลงชื่อ ......................................................</div>
              <div>( ...................................................... )</div>
              <div className="mt-1 text-slate-600">ผู้จัดทำ</div>
            </div>
            <div>
              <div className="mb-8">ลงชื่อ ......................................................</div>
              <div>( ...................................................... )</div>
              <div className="mt-1 text-slate-600">ผู้ตรวจ</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
