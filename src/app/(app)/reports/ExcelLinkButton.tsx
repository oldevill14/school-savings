import { FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ลิงก์ดาวน์โหลด Excel — ปุ่มสไตล์ secondary (ขาวขอบเทา) ที่เป็น <a> จริง
 * ใช้เป็น anchor ธรรมดา (ไม่ต้องใช้ JS) — เบราว์เซอร์ดาวน์โหลดไฟล์จาก Content-Disposition
 *
 * ใช้ในหน้ารายงาน (server component) โดยประกอบ href พร้อม query ฝั่ง server
 */
export default function ExcelLinkButton({
  href,
  children = "ดาวน์โหลด Excel",
  className,
}: {
  href: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-navy transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/30 focus-visible:ring-offset-1",
        className
      )}
    >
      <FileSpreadsheet className="h-4 w-4 text-deposit" />
      {children}
    </a>
  );
}
