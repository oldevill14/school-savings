import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** ป้ายกำกับเหนือช่องเลือก */
  label?: string;
  /** ข้อความ error ใต้ช่อง */
  error?: string;
  /** รายการตัวเลือก — หรือส่ง <option> เป็น children เองก็ได้ */
  options?: SelectOption[];
  /** ตัวเลือกแรกแบบ placeholder เช่น "— เลือกห้องเรียน —" (value = "") */
  placeholder?: string;
}

/**
 * ช่องเลือกมาตรฐาน
 *
 * ใช้: <Select label="ห้องเรียน" placeholder="— เลือกห้องเรียน —"
 *        options={[{ value: "1", label: "ป.1/1" }]} />
 */
const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, options, placeholder, id, className, children, ...props },
  ref
) {
  const autoId = useId();
  const selectId = id ?? autoId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          "block h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900",
          "focus:outline-none focus:ring-2",
          "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500",
          error
            ? "border-withdraw focus:border-withdraw focus:ring-withdraw/30"
            : "border-line focus:border-navy focus:ring-navy/30",
          className
        )}
        aria-invalid={error ? true : undefined}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      {error && <p className="mt-1 text-sm text-withdraw">{error}</p>}
    </div>
  );
});

export default Select;
