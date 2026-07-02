import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "navy" | "green" | "red" | "gold";

export interface StatCardProps {
  /** ชื่อสถิติ เช่น "ยอดฝากวันนี้" */
  title: string;
  /** ค่าที่ format แล้ว เช่น formatBaht(1234.5) หรือ "20 คน" */
  value: string;
  icon?: LucideIcon;
  /** navy=ทั่วไป, green=ฝาก, red=ถอน, gold=ยอดสะสม/ไฮไลต์ */
  tone?: StatTone;
  /** บรรทัดเสริมใต้ค่า เช่น "12 รายการ" */
  hint?: string;
  className?: string;
}

const TONE_CLASSES: Record<StatTone, { bubble: string; value: string }> = {
  navy: { bubble: "bg-navy/10 text-navy", value: "text-slate-900" },
  green: { bubble: "bg-green-50 text-deposit", value: "text-deposit" },
  red: { bubble: "bg-red-50 text-withdraw", value: "text-withdraw" },
  gold: { bubble: "bg-amber-50 text-gold-dark", value: "text-gold-dark" },
};

/**
 * การ์ดสถิติสำหรับแดชบอร์ด
 *
 * ใช้: <StatCard title="ยอดฝากวันนี้" value={formatBaht(2450)} hint="18 รายการ"
 *        icon={ArrowDownToLine} tone="green" />
 */
export default function StatCard({
  title,
  value,
  icon: Icon,
  tone = "navy",
  hint,
  className,
}: StatCardProps) {
  const toneClasses = TONE_CLASSES[tone];
  return (
    <div className={cn("card-surface flex items-center gap-4 p-5", className)}>
      {Icon && (
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg",
            toneClasses.bubble
          )}
        >
          <Icon className="h-6 w-6" />
        </span>
      )}
      <div className="min-w-0">
        <div className="truncate text-sm text-slate-500">{title}</div>
        <div className={cn("text-2xl font-bold tabular-nums", toneClasses.value)}>
          {value}
        </div>
        {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
      </div>
    </div>
  );
}
