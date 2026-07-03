"use client";

/**
 * CashClosingForm — ฟอร์มปิดยอดเงินสดรายวัน (ADMIN เท่านั้น)
 *
 * ผู้ใช้กรอก "ยอดเงินสดที่นับได้จริง" → แสดงผลต่างเทียบยอดคาดหวังแบบสด (เขียว/แดง)
 * → ยืนยัน → POST /api/cash-closing → refresh หน้าเพื่อแสดงผลการปิดยอด
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Lock } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { formatBaht } from "@/lib/money";
import { formatThaiDateFull } from "@/lib/thai-date";
import { cn } from "@/lib/utils";

export interface CashClosingFormProps {
  /** วันที่ที่จะปิดยอด (YYYY-MM-DD) */
  date: string;
  /** ยอดสุทธิที่ระบบคำนวณ (บาท) — server จะคำนวณซ้ำตอนบันทึกจริง */
  expectedNet: number;
}

/** parse ยอดนับจริง (>= 0, ทศนิยมไม่เกิน 2) — คืน null ถ้าไม่ถูกต้อง */
function parseCounted(input: string): number | null {
  const cleaned = input.replace(/[,\s฿]/g, "").replace(/บาท$/, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function CashClosingForm({ date, expectedNet }: CashClosingFormProps) {
  const router = useRouter();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countedValue = parseCounted(counted);
  const diff =
    countedValue === null
      ? null
      : Math.round((countedValue - expectedNet) * 100) / 100;

  const handleOpen = () => {
    setError(null);
    if (countedValue === null) {
      setError("กรุณากรอกยอดเงินสดที่นับได้จริง (ตัวเลข 0 ขึ้นไป ทศนิยมไม่เกิน 2 ตำแหน่ง)");
      return;
    }
    setConfirmOpen(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cash-closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, countedAmount: countedValue, note }),
      });
      const data: { ok?: boolean; error?: string } = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setConfirmOpen(false);
        router.refresh();
      } else {
        setConfirmOpen(false);
        setError(data.error ?? "ปิดยอดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    } catch {
      setConfirmOpen(false);
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  const diffLabel =
    diff === null
      ? ""
      : diff === 0
        ? "ตรงพอดี"
        : diff > 0
          ? `เกิน ${formatBaht(diff)} บาท`
          : `ขาด ${formatBaht(Math.abs(diff))} บาท`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">
            ยอดสุทธิที่ระบบคำนวณ (บาท)
          </label>
          <div className="flex h-10 items-center justify-end rounded-lg border border-line bg-slate-50 px-3 text-sm font-semibold tabular-nums text-slate-900">
            {formatBaht(expectedNet)}
          </div>
          <p className="mt-1 text-xs text-slate-400">= ฝากรวม − ถอนรวม ของวันนี้</p>
        </div>
        <Input
          label="ยอดเงินสดที่นับได้จริง (บาท)"
          inputMode="decimal"
          placeholder="เช่น 1,250.00"
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
          className="text-right tabular-nums"
        />
      </div>

      {diff !== null && (
        <div
          className={cn(
            "rounded-card border px-4 py-3 text-sm font-medium",
            diff === 0
              ? "border-green-200 bg-green-50 text-deposit"
              : "border-red-200 bg-red-50 text-withdraw"
          )}
        >
          ผลต่าง (นับได้ − คำนวณ): {diffLabel}
        </div>
      )}

      <Input
        label="หมายเหตุ (ถ้ามี)"
        placeholder="เช่น มีเหรียญชำรุด 1 เหรียญ"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-withdraw"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleOpen} disabled={submitting}>
          <Lock className="h-4 w-4" />
          ปิดยอดวันนี้
        </Button>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => !submitting && setConfirmOpen(false)}
        title="ยืนยันการปิดยอดเงินสด"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              ยกเลิก
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "กำลังบันทึก..." : "ยืนยันปิดยอด"}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-slate-700">
          <p>
            ปิดยอดเงินสดของวัน{" "}
            <strong className="text-slate-900">{formatThaiDateFull(date)}</strong>
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              ยอดสุทธิที่ระบบคำนวณ{" "}
              <strong className="tabular-nums">{formatBaht(expectedNet)}</strong> บาท
            </li>
            <li>
              ยอดเงินสดที่นับได้จริง{" "}
              <strong className="tabular-nums">
                {countedValue === null ? "-" : formatBaht(countedValue)}
              </strong>{" "}
              บาท
            </li>
            <li>
              ผลต่าง <strong>{diffLabel}</strong>
            </li>
          </ul>
          <p className="text-slate-500">
            เมื่อปิดแล้วจะบันทึกเป็นประวัติถาวรและปิดซ้ำในวันเดียวกันไม่ได้
          </p>
        </div>
      </Modal>
    </div>
  );
}
