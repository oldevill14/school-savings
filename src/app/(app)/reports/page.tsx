import Link from "next/link";
import { ArrowRight, CalendarDays, School } from "lucide-react";
import { requireRole } from "@/lib/auth";

/**
 * /reports — หน้าเลือกประเภทรายงาน (ADMIN, TEACHER)
 * การ์ด 2 ใบ: รายงานรายห้องเรียน / รายงานรายปีการศึกษา
 */
export const dynamic = "force-dynamic";

const REPORT_TYPES = [
  {
    href: "/reports/classroom",
    icon: School,
    title: "รายงานสรุปรายห้องเรียน",
    description:
      "เลือกห้องเรียนและช่วงเดือน — แสดงยอดยกมา รวมฝาก รวมถอน และคงเหลือของนักเรียนรายคน พร้อมแถวรวมท้ายตาราง",
  },
  {
    href: "/reports/yearly",
    icon: CalendarDays,
    title: "รายงานสรุปรายปีการศึกษา",
    description:
      "เลือกปีการศึกษา — สรุปยอดทุกห้องเรียน แถวรวมทั้งโรงเรียน และสรุปยอดฝาก-ถอนรายเดือนของปีนั้น",
  },
] as const;

export default async function ReportsPage() {
  await requireRole(["ADMIN", "TEACHER"]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl">รายงานสรุป</h1>
        <p className="mt-1 text-sm text-slate-500">
          ตัวเลขทุกรายงานคำนวณจากธุรกรรมจริง (สถานะปกติ) ย้อนหลังทั้งหมด
          ไม่ใช้ยอดคงเหลือสะสมในบัญชี — ทุกรายงานสั่งพิมพ์ได้จากปุ่มพิมพ์ในหน้ารายงาน
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
    </div>
  );
}
