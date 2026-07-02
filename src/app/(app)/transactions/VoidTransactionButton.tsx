"use client";

/**
 * ปุ่ม "ยกเลิก" รายการธุรกรรม (ADMIN เท่านั้น — หน้า /transactions render ให้เฉพาะ admin)
 *
 * เปิด Modal ยืนยัน → PATCH /api/transactions { id }
 * ระบบไม่ลบธุรกรรม — ตั้ง status=VOIDED + คืนยอดเงินฝั่ง server ใน $transaction เดียว
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";

export interface VoidTransactionButtonProps {
  transactionId: string;
  /** รายละเอียดรายการ เช่น "ฝาก 20.00 บาท — กิตติศักดิ์ สายบุตร (2 ก.ค. 2569)" */
  description: string;
}

export default function VoidTransactionButton({
  transactionId,
  description,
}: VoidTransactionButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (submitting) return;
    setOpen(false);
    setError(null);
  };

  const handleVoid = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: transactionId }),
      });
      const data: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(data.error ?? "ยกเลิกรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        <Ban className="h-3.5 w-3.5" />
        ยกเลิก
      </Button>

      <Modal
        open={open}
        onClose={handleClose}
        title="ยืนยันการยกเลิกรายการ"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={handleClose} disabled={submitting}>
              ปิด
            </Button>
            <Button variant="danger" onClick={handleVoid} disabled={submitting}>
              {submitting ? "กำลังยกเลิก..." : "ยืนยันยกเลิกรายการ"}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-slate-700">
          <p className="font-medium text-slate-900">{description}</p>
          <p>
            ระบบจะคืนยอดเงินให้ถูกต้อง และเก็บรายการนี้ไว้ในประวัติแบบขีดฆ่า
            (สถานะ &ldquo;ยกเลิกแล้ว&rdquo;) — ไม่มีการลบข้อมูล
          </p>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-withdraw">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
