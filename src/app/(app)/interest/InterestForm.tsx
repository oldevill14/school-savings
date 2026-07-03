"use client";

/**
 * InterestForm — จ่ายดอกเบี้ยประจำปี (ADMIN เท่านั้น)
 *
 * กรอกอัตรา % → preview ตารางดอกเบี้ยรายบัญชี (คำนวณด้วย interest-calc ชุดเดียวกับ server)
 * → ยืนยันโดยพิมพ์เลขปี → POST /api/interest
 * guard: ถ้าปีนี้เคยจ่ายดอกเบี้ยแล้ว ต้องติ๊กยืนยัน "จ่ายซ้ำ" (force) เพิ่ม
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Coins, Percent } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";
import { formatBaht } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  buildInterestPreview,
  type InterestAccountInput,
} from "./interest-calc";

export interface InterestFormProps {
  year: number;
  accounts: InterestAccountInput[];
  /** ปีนี้เคยจ่ายดอกเบี้ยแล้วหรือยัง (ต้อง confirm พิเศษ) */
  alreadyPaid: boolean;
  /** จำนวนรายการดอกเบี้ยที่เคยจ่ายในปีนี้ */
  priorCount: number;
}

/** parse อัตราดอกเบี้ย (%) — > 0, <= 100, ทศนิยมไม่เกิน 2 (mirror ของฝั่ง server) */
function parseRate(input: string): number | null {
  const cleaned = input.replace(/[,\s%]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return n;
}

export default function InterestForm({
  year,
  accounts,
  alreadyPaid,
  priorCount,
}: InterestFormProps) {
  const router = useRouter();
  const [rate, setRate] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmYear, setConfirmYear] = useState("");
  const [needForce, setNeedForce] = useState(alreadyPaid);
  const [priorPaidCount, setPriorPaidCount] = useState(priorCount);
  const [forceChecked, setForceChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    count: number;
    total: number;
    rate: number;
  } | null>(null);

  const parsedRate = parseRate(rate);
  const preview = useMemo(
    () => (parsedRate === null ? null : buildInterestPreview(accounts, parsedRate)),
    [accounts, parsedRate]
  );

  const handleOpenConfirm = () => {
    setError(null);
    setRateError(null);
    if (parsedRate === null) {
      setRateError("กรอกอัตราดอกเบี้ยให้ถูกต้อง (มากกว่า 0 ไม่เกิน 100 ทศนิยมไม่เกิน 2 ตำแหน่ง)");
      return;
    }
    if (!preview || preview.payableCount === 0) {
      setRateError("ไม่มีบัญชีที่ได้รับดอกเบี้ยที่อัตรานี้ (ยอดคงเหลือเป็น 0 หรือดอกเบี้ยปัดลงเหลือ 0)");
      return;
    }
    setConfirmYear("");
    setForceChecked(false);
    setConfirmOpen(true);
  };

  const canSubmit =
    parsedRate !== null &&
    confirmYear.trim() === String(year) &&
    (!needForce || forceChecked) &&
    !submitting;

  const handleSubmit = async () => {
    if (parsedRate === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rate: parsedRate,
          confirmYear: Number(confirmYear.trim()),
          force: needForce ? forceChecked : false,
        }),
      });
      const data: {
        ok?: boolean;
        error?: string;
        alreadyPaid?: boolean;
        priorCount?: number;
        summary?: { count: number; totalInterest: number; rate: number };
      } = await res.json().catch(() => ({}));

      if (res.ok && data.ok && data.summary) {
        setConfirmOpen(false);
        setSuccess({
          count: data.summary.count,
          total: data.summary.totalInterest,
          rate: data.summary.rate,
        });
        setRate("");
        setNeedForce(true); // จ่ายแล้ว → รอบถัดไปถือเป็นจ่ายซ้ำ
        setPriorPaidCount((prev) => prev + data.summary!.count);
        router.refresh();
      } else if (res.status === 409 && data.alreadyPaid) {
        // ต้องยืนยันจ่ายซ้ำ
        setNeedForce(true);
        if (typeof data.priorCount === "number") setPriorPaidCount(data.priorCount);
        setForceChecked(false);
        setError(data.error ?? "ปีนี้เคยจ่ายดอกเบี้ยแล้ว กรุณายืนยันการจ่ายซ้ำ");
      } else {
        setError(data.error ?? "จ่ายดอกเบี้ยไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {success && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-card border border-green-200 bg-green-50 px-4 py-3 text-sm text-deposit"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            จ่ายดอกเบี้ยเรียบร้อย {success.count.toLocaleString("th-TH")} บัญชี · อัตรา{" "}
            {success.rate}% · รวม{" "}
            <strong className="tabular-nums">{formatBaht(success.total)}</strong> บาท
          </span>
        </div>
      )}

      {alreadyPaid && !success && (
        <div className="flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-gold-dark">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            ปีการศึกษา {year} เคยจ่ายดอกเบี้ยไปแล้ว {priorPaidCount.toLocaleString("th-TH")}{" "}
            รายการ — หากจ่ายอีกครั้งจะเป็นการจ่ายเพิ่ม (ต้องยืนยันการจ่ายซ้ำ)
          </span>
        </div>
      )}

      <div className="w-full sm:max-w-xs">
        <Input
          label="อัตราดอกเบี้ยต่อปี (%)"
          inputMode="decimal"
          placeholder="เช่น 2 หรือ 2.5"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          error={rateError ?? undefined}
          className="text-right tabular-nums"
        />
      </div>

      {preview && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span>
              บัญชีที่ได้ดอกเบี้ย{" "}
              <strong className="text-slate-900">
                {preview.payableCount.toLocaleString("th-TH")}
              </strong>{" "}
              / {accounts.length.toLocaleString("th-TH")} บัญชี
            </span>
            <span>
              รวมดอกเบี้ย{" "}
              <strong className="tabular-nums text-deposit">
                {formatBaht(preview.totalInterest)}
              </strong>{" "}
              บาท
            </span>
          </div>

          <Table minWidth="720px">
            <THead>
              <TR>
                <TH>รหัส</TH>
                <TH>ชื่อ-นามสกุล</TH>
                <TH>ห้อง</TH>
                <TH align="right">ยอดคงเหลือ</TH>
                <TH align="right">ดอกเบี้ย</TH>
                <TH align="right">ยอดใหม่</TH>
              </TR>
            </THead>
            <TBody>
              {preview.payableRows.map((r) => (
                <TR key={r.accountId}>
                  <TD className="text-slate-500">{r.studentCode}</TD>
                  <TD className="font-medium text-slate-900">{r.studentName}</TD>
                  <TD className="text-slate-600">{r.classroomName}</TD>
                  <TD align="right">{formatBaht(r.balance)}</TD>
                  <TD align="right" className="text-deposit">
                    {formatBaht(r.interest)}
                  </TD>
                  <TD align="right" className="font-semibold">
                    {formatBaht(r.balance + r.interest)}
                  </TD>
                </TR>
              ))}
              {preview.payableCount === 0 && (
                <TableEmpty
                  colSpan={6}
                  message="ไม่มีบัญชีที่ได้รับดอกเบี้ยที่อัตรานี้"
                />
              )}
            </TBody>
          </Table>
        </>
      )}

      {error && !confirmOpen && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-withdraw"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleOpenConfirm}
          disabled={submitting || !preview || preview.payableCount === 0}
        >
          <Coins className="h-4 w-4" />
          จ่ายดอกเบี้ยประจำปี {year}
        </Button>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => !submitting && setConfirmOpen(false)}
        title="ยืนยันการจ่ายดอกเบี้ย"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              ยกเลิก
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? "กำลังจ่าย..." : "ยืนยันจ่ายดอกเบี้ย"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-slate-700">
          <div className="flex items-center gap-2">
            <Percent className="h-4 w-4 text-navy" />
            <span>
              อัตรา <strong>{parsedRate ?? "-"}%</strong> · ปีการศึกษา{" "}
              <strong>{year}</strong>
            </span>
          </div>
          {preview && (
            <ul className="list-inside list-disc space-y-1">
              <li>
                จ่ายให้{" "}
                <strong>{preview.payableCount.toLocaleString("th-TH")} บัญชี</strong>
              </li>
              <li>
                รวมดอกเบี้ย{" "}
                <strong className="tabular-nums text-deposit">
                  {formatBaht(preview.totalInterest)}
                </strong>{" "}
                บาท
              </li>
            </ul>
          )}

          {needForce && (
            <div className="space-y-2 rounded-card border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start gap-2 text-gold-dark">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  ปีนี้เคยจ่ายดอกเบี้ยแล้ว{" "}
                  {priorPaidCount.toLocaleString("th-TH")} รายการ —
                  การจ่ายครั้งนี้จะเป็นการจ่ายเพิ่ม
                </span>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={forceChecked}
                  onChange={(e) => setForceChecked(e.target.checked)}
                  className="h-4 w-4 rounded border-line"
                />
                <span>ยืนยันจ่ายดอกเบี้ยซ้ำ</span>
              </label>
            </div>
          )}

          <Input
            label={`พิมพ์เลขปี "${year}" เพื่อยืนยัน`}
            inputMode="numeric"
            placeholder={String(year)}
            value={confirmYear}
            onChange={(e) => setConfirmYear(e.target.value)}
          />

          {error && (
            <p
              role="alert"
              className={cn(
                "rounded-lg px-3 py-2",
                "bg-red-50 text-withdraw"
              )}
            >
              {error}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
