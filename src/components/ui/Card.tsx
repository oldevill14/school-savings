import { cn } from "@/lib/utils";

export interface CardProps {
  /** หัวข้อการ์ด (แสดงในแถบ header ถ้ามี) */
  title?: string;
  /** คำอธิบายสั้นใต้หัวข้อ */
  description?: string;
  /** ปุ่ม/ลิงก์มุมขวาของ header */
  actions?: React.ReactNode;
  /** ส่วนท้ายการ์ด (มีเส้นคั่น) */
  footer?: React.ReactNode;
  /** ใส่ padding ให้เนื้อหา (default true) — ปิดเมื่อวาง Table เต็มการ์ด */
  padded?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * การ์ดพื้นผิวมาตรฐาน — ขาว ขอบบาง เงาบาง มุมโค้ง 12px
 *
 * ใช้: <Card title="ยอดฝากวันนี้" actions={<Button size="sm">ดูทั้งหมด</Button>}>...</Card>
 */
export default function Card({
  title,
  description,
  actions,
  footer,
  padded = true,
  className,
  children,
}: CardProps) {
  return (
    <section className={cn("card-surface", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            {title && <h3 className="text-base font-semibold text-slate-900">{title}</h3>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cn(padded && "p-5")}>{children}</div>
      {footer && <footer className="border-t border-line px-5 py-3">{footer}</footer>}
    </section>
  );
}
