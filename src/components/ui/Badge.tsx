import { cn } from "@/lib/utils";

export type BadgeVariant = "navy" | "green" | "red" | "gold" | "gray";

export interface BadgeProps {
  /** navy=ทั่วไป, green=ฝาก/ปกติ/active, red=ถอน/ยกเลิก, gold=ไฮไลต์, gray=ปิด/ย้าย */
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  navy: "bg-navy/10 text-navy border-navy/20",
  green: "bg-green-50 text-deposit border-green-200",
  red: "bg-red-50 text-withdraw border-red-200",
  gold: "bg-amber-50 text-gold-dark border-amber-200",
  gray: "bg-slate-100 text-slate-600 border-slate-200",
};

/**
 * ป้ายสถานะขนาดเล็ก
 *
 * ใช้: <Badge variant="green">ฝาก</Badge> <Badge variant="red">ถอน</Badge>
 *      <Badge variant="gray">ยกเลิกแล้ว</Badge>
 */
export default function Badge({ variant = "navy", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
