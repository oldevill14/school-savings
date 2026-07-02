import { PiggyBank } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBaht } from "@/lib/money";
import { formatThaiDate } from "@/lib/thai-date";

export interface BalanceCardProps {
  /** หัวการ์ด (default "ยอดเงินคงเหลือ") */
  title?: string;
  /** ยอดคงเหลือ — number หรือ string (เช่น Prisma Decimal ที่ .toString() แล้ว) */
  balance: number | string;
  /** ชื่อนักเรียนเจ้าของบัญชี เช่น "เด็กชายกิตติศักดิ์ สายบุตร" */
  studentName?: string;
  /** รหัสนักเรียน เช่น "69001" */
  studentCode?: string;
  /** ห้องเรียน เช่น "ป.1/1" */
  classroomName?: string;
  /** วันที่ธุรกรรมล่าสุด — แสดงเป็น พ.ศ. เช่น "2 ก.ค. 2569" */
  updatedAt?: Date | string;
  className?: string;
}

/**
 * การ์ดยอดคงเหลือใหญ่ — ใช้ในหน้า /my-child และ /passbook
 *
 * ใช้: <BalanceCard studentName="เด็กชายกิตติศักดิ์ สายบุตร" studentCode="69001"
 *        classroomName="ป.1/1" balance={account.balance.toString()}
 *        updatedAt={lastTxn?.txnDate} />
 */
export default function BalanceCard({
  title = "ยอดเงินคงเหลือ",
  balance,
  studentName,
  studentCode,
  classroomName,
  updatedAt,
  className,
}: BalanceCardProps) {
  const meta = [studentCode, classroomName].filter(Boolean).join(" · ");

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-card bg-gradient-to-br from-navy to-navy-dark p-6 text-white shadow-card",
        className
      )}
    >
      {/* ลายน้ำมุมขวา */}
      <PiggyBank
        className="absolute -right-4 -top-4 h-32 w-32 text-white/5"
        aria-hidden="true"
      />

      <div className="relative">
        {studentName && (
          <div className="mb-3">
            <div className="text-base font-semibold">{studentName}</div>
            {meta && <div className="text-sm text-white/60">{meta}</div>}
          </div>
        )}

        <div className="text-sm text-white/70">{title}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-4xl font-bold tabular-nums text-gold-light">
            {formatBaht(balance)}
          </span>
          <span className="text-lg text-white/70">บาท</span>
        </div>

        {updatedAt && (
          <div className="mt-3 text-xs text-white/50">
            ธุรกรรมล่าสุด {formatThaiDate(updatedAt)}
          </div>
        )}
      </div>
    </div>
  );
}
