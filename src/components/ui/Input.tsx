import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** ป้ายกำกับเหนือช่องกรอก */
  label?: string;
  /** ข้อความ error ใต้ช่อง (ทำให้ขอบเป็นสีแดงด้วย) */
  error?: string;
  /** ข้อความช่วยเหลือใต้ช่อง (แสดงเมื่อไม่มี error) */
  hint?: string;
}

/**
 * ช่องกรอกข้อความมาตรฐาน
 *
 * ใช้: <Input label="จำนวนเงิน (บาท)" inputMode="decimal" error={error} />
 */
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className, ...props },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cn(
          "block h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900",
          "placeholder:text-slate-400",
          "focus:outline-none focus:ring-2",
          "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500",
          error
            ? "border-withdraw focus:border-withdraw focus:ring-withdraw/30"
            : "border-line focus:border-navy focus:ring-navy/30",
          className
        )}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error ? (
        <p className="mt-1 text-sm text-withdraw">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-sm text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
});

export default Input;
