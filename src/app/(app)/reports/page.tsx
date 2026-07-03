import Link from "next/link";
import { ArrowRight, BookText, CalendarDays, School } from "lucide-react";
import { requireRole } from "@/lib/auth";
import Card from "@/components/ui/Card";
import ExcelLinkButton from "./ExcelLinkButton";

/**
 * /reports — หน้าเลือกประเภทรายงาน (ADMIN, TEACHER, EXECUTIVE อ่านอย่างเดียว)
 * การ์ด: รายงานรายห้องเรียน / รายงานรายปีการศึกษา / ทะเบียนคุมเงิน + ส่งออกรายชื่อนักเรียน
 */
export const dynamic = "force-dynamic";

const REPORT_TYPES = [
  {
    href: "/reports/classroom",
    icon: School,
    title: "รายงานสรุปรายห้องเรียน",
    description:
      "เลือกห้องเรียนและช่วงเดือน — แสดงยอดยกมา รวมฝาก รวมถอน และคงเหลือของนักเรียนรายคน พร้อมแถวรวมท้ายตาราง (พิมพ์ / ดาวน์โหลด Excel ได้)",
  },
  {
    href: "/reports/yearly",
    icon: CalendarDays,
    title: "รายงานสรุปรายปีการศึกษา",
    description:
      "เลือกปีการศึกษา — สรุปยอดทุกห้องเรียน แถวรวมทั้งโรงเรียน และสรุปยอดฝาก-ถอนรายเดือนของปีนั้น (พิมพ์ / ดาวน์โหลด Excel ได้)",
  },
  {
    href: "/reports/ledger",
    icon: BookText,
    title: "ทะเบียนคุมเงินออมทรัพย์นักเรียน",
    description:
      "ทะเบียนแนวราชการรายบัญชี — วันที่ รายการ รับ จ่าย คงเหลือ ผู้บันทึก พร้อมยอดยกมา/ยกไป เลือกทั้งโรงเรียนหรือรายห้อง (พิมพ์ A4 แนวนอน / ดาวน์โหลด Excel)",
  },
] as const;

export default async function ReportsPage() {
  // EXECUTIVE (ผู้บริหาร) ดูรายงานแบบอ่านอย่างเดียว (หน้าเลือกประเภทรายงาน)
  await requireRole(["ADMIN", "TEACHER", "EXECUTIVE"]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl">รายงานสรุป</h1>
        <p className="mt-1 text-sm text-slate-500">
          ตัวเลขทุกรายงานคำนวณจากธุรกรรมจริง (สถานะปกติ) ย้อนหลังทั้งหมด
          ไม่ใช้ยอดคงเหลือสะสมในบัญชี — ทุกรายงานสั่งพิมพ์และดาวน์โหลด Excel ได้จากในหน้ารายงาน
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORT_TYPES.map((report) => {
          const Icon = report.icon;
          return (
            <Link
              key={report.href}
              href={report.href}
              className="card-surface group flex flex-col gap-4 p-5 transition-colors hover:border-navy/50"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy/10">
                <Icon className="h-6 w-6 text-navy" />
              </span>
              <div className="flex-1">
                <h2 className="text-base font-semibold text-slate-900 group-hover:text-navy">
                  {report.title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  {report.description}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-navy">
                เปิดรายงาน
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>

      <Card
        title="ส่งออกข้อมูลนักเรียน"
        description="ดาวน์โหลดรายชื่อนักเรียนของปีการศึกษาที่เปิดใช้งาน พร้อมห้องเรียน สถานะ และยอดคงเหลือปัจจุบัน เป็นไฟล์ Excel"
        actions={
          <ExcelLinkButton href="/api/export/students">
            ดาวน์โหลดรายชื่อนักเรียน (Excel)
          </ExcelLinkButton>
        }
      >
        <p className="text-sm text-slate-500">
          ครูประจำชั้นจะได้รับเฉพาะรายชื่อนักเรียนในห้องของตนเอง —
          ไฟล์จัดรูปแบบตัวเลขเงินเป็นทศนิยม 2 ตำแหน่งพร้อมหัวตารางภาษาไทย
        </p>
      </Card>
    </div>
  );
}
