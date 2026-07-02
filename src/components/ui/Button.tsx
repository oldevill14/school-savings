import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary=น้ำเงินกรมท่า (default), secondary=ขาวขอบเทา, success=เขียวฝาก, danger=แดงถอน, ghost=โปร่ง */
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-navy text-white hover:bg-navy-light focus-visible:ring-navy/40",
  secondary:
    "border border-line bg-white text-navy hover:bg-slate-50 focus-visible:ring-navy/30",
  success: "bg-deposit text-white hover:bg-deposit/90 focus-visible:ring-deposit/40",
  danger: "bg-withdraw text-white hover:bg-withdraw/90 focus-visible:ring-withdraw/40",
  ghost: "text-slate-600 hover:bg-slate-100 focus-visible:ring-navy/30",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-6 text-base",
};

/**
 * ปุ่มมาตรฐานของระบบ
 *
 * ใช้: <Button>บันทึก</Button>
 *      <Button variant="danger" size="sm">ยกเลิกรายการ</Button>
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    />
  );
});

export default Button;
