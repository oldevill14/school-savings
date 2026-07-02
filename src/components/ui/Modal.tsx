"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModalProps {
  /** เปิด/ปิด modal (ควบคุมจากภายนอก) */
  open: boolean;
  /** เรียกเมื่อผู้ใช้ปิด (กด X, กด Escape, คลิกฉากหลัง) */
  onClose: () => void;
  title?: string;
  /** ปุ่มส่วนท้าย เช่น <><Button variant="secondary">ยกเลิก</Button><Button>ยืนยัน</Button></> */
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

const SIZE_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

/**
 * Modal มาตรฐาน (client component)
 *
 * ใช้:
 *   const [open, setOpen] = useState(false);
 *   <Modal open={open} onClose={() => setOpen(false)} title="ยืนยันการถอนเงิน" footer={...}>
 *     เนื้อหา...
 *   </Modal>
 */
export default function Modal({
  open,
  onClose,
  title,
  footer,
  size = "md",
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* ฉากหลัง */}
      <div
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* กล่อง */}
      <div
        className={cn(
          "relative w-full rounded-card border border-line bg-white shadow-xl",
          SIZE_CLASSES[size]
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
