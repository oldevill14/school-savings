"use client";

/**
 * BatchDepositTable — ตารางบันทึกฝาก-ถอนทั้งห้องทีเดียว (client component)
 *
 * ใช้ในหน้า /transactions/new:
 * - เลือกห้อง (teacher ถูกล็อกเป็นห้องตัวเอง) -> โหลดนักเรียนทั้งห้อง
 * - แต่ละแถว: ชื่อ | ยอดคงเหลือ | ช่องกรอกจำนวน | ประเภท (ฝาก/ถอน)
 * - ปุ่ม "เติมยอดเท่ากันทุกคน", กด Enter/Tab ไล่ลงแถวถัดไปได้
 * - แถวถอนเกินยอด → เตือนแดงทันทีฝั่ง client (server ตรวจซ้ำอีกชั้น)
 * - "บันทึกทั้งหมด" → ยืนยันใน Modal → POST /api/transactions/batch (atomic ทั้งชุด)
 */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Save, Wand2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";
import { formatBaht, parseBaht } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface BatchStudentRow {
  studentId: string;
  studentCode: string;
  name: string;
  /** ยอดคงเหลือปัจจุบัน (แปลงจาก Prisma Decimal เป็น number แล้วฝั่ง server) */
  balance: number;
}

export interface BatchDepositTableProps {
  /** ห้องเรียนที่เลือกได้ (teacher จะได้เฉพาะห้องตัวเอง) */
  classrooms: { id: string; name: string }[];
  /** ห้องที่เลือกอยู่ ("" = ยังไม่เลือก) */
  selectedClassroomId: string;
  /** true เมื่อมีห้องเดียว (teacher) — ล็อก select */
  lockClassroom?: boolean;
  students: BatchStudentRow[];
}

type TxnType = "DEPOSIT" | "WITHDRAW";
type RowState = { amount: string; type: TxnType };

const EMPTY_ROW: RowState = { amount: "", type: "DEPOSIT" };

const TYPE_OPTIONS = [
  { value: "DEPOSIT", label: "ฝาก" },
  { value: "WITHDRAW", label: "ถอน" },
];

export default function BatchDepositTable({
  classrooms,
  selectedClassroomId,
  lockClassroom = false,
  students,
}: BatchDepositTableProps) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [fillValue, setFillValue] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(
    null
  );
  const amountRefs = useRef<(HTMLInputElement | null)[]>([]);

  const getRow = (studentId: string): RowState => rows[studentId] ?? EMPTY_ROW;

  const setRow = (studentId: string, patch: Partial<RowState>) => {
    setRows((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] ?? EMPTY_ROW), ...patch },
    }));
  };

  /** สถานะที่คำนวณจากทุกแถว: รายการที่กรอกแล้ว + ข้อผิดพลาดฝั่ง client */
  const summary = useMemo(() => {
    const entries: { studentId: string; name: string; amount: number; type: TxnType }[] = [];
    const rowErrors: Record<string, string> = {};

    for (const s of students) {
      const row = rows[s.studentId];
      if (!row || row.amount.trim() === "") continue;

      const amount = parseBaht(row.amount);
      if (amount === null) {
        rowErrors[s.studentId] = "จำนวนเงินไม่ถูกต้อง (ต้องมากกว่า 0 ทศนิยมไม่เกิน 2 ตำแหน่ง)";
        continue;
      }
      if (row.type === "WITHDRAW" && amount > s.balance) {
        rowErrors[s.studentId] = `ถอนเกินยอดคงเหลือ (มี ${formatBaht(s.balance)} บาท)`;
        continue;
      }
      entries.push({ studentId: s.studentId, name: s.name, amount, type: row.type });
    }

    const depositEntries = entries.filter((e) => e.type === "DEPOSIT");
    const withdrawEntries = entries.filter((e) => e.type === "WITHDRAW");
    return {
      entries,
      rowErrors,
      errorCount: Object.keys(rowErrors).length,
      depositCount: depositEntries.length,
      depositTotal: depositEntries.reduce((sum, e) => sum + e.amount, 0),
      withdrawCount: withdrawEntries.length,
      withdrawTotal: withdrawEntries.reduce((sum, e) => sum + e.amount, 0),
    };
  }, [rows, students]);

  const handleClassroomChange = (classroomId: string) => {
    setRows({});
    setBanner(null);
    router.push(
      classroomId
        ? `/transactions/new?classroomId=${encodeURIComponent(classroomId)}`
        : "/transactions/new"
    );
  };

  /** เติมยอดเท่ากันทุกคน (ตั้งประเภทเป็น "ฝาก" ให้ทุกแถว) */
  const handleFillAll = () => {
    setBanner(null);
    const amount = parseBaht(fillValue);
    if (amount === null) {
      setBanner({
        kind: "error",
        text: "จำนวนเงินที่จะเติมไม่ถูกต้อง — ต้องมากกว่า 0 และทศนิยมไม่เกิน 2 ตำแหน่ง",
      });
      return;
    }
    const next: Record<string, RowState> = {};
    for (const s of students) {
      next[s.studentId] = { amount: String(amount), type: "DEPOSIT" };
    }
    setRows(next);
  };

  /** กด Enter ที่ช่องจำนวนเงิน → เลื่อนไปช่องของแถวถัดไป */
  const handleAmountKeyDown = (index: number) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      amountRefs.current[index + 1]?.focus();
    }
  };

  const handleOpenConfirm = () => {
    setBanner(null);
    if (summary.errorCount > 0) {
      setBanner({
        kind: "error",
        text: `มี ${summary.errorCount} แถวที่ไม่ถูกต้อง กรุณาแก้ไข (ดูข้อความสีแดงใต้ช่องกรอก) ก่อนบันทึก`,
      });
      return;
    }
    if (summary.entries.length === 0) {
      setBanner({ kind: "error", text: "ยังไม่ได้กรอกจำนวนเงินของนักเรียนคนใดเลย" });
      return;
    }
    setConfirmOpen(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await fetch("/api/transactions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: summary.entries.map(({ studentId, amount, type }) => ({
            studentId,
            amount,
            type,
          })),
        }),
      });
      const data: { ok?: boolean; count?: number; error?: string } = await res
        .json()
        .catch(() => ({}));

      if (res.ok && data.ok) {
        setRows({});
        setFillValue("");
        setConfirmOpen(false);
        setBanner({
          kind: "success",
          text: `บันทึกเรียบร้อย ${data.count ?? summary.entries.length} รายการ — ยอดคงเหลือในตารางอัปเดตแล้ว`,
        });
        router.refresh();
      } else {
        setConfirmOpen(false);
        setBanner({
          kind: "error",
          text: data.error ?? "เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่อีกครั้ง",
        });
      }
    } catch {
      setConfirmOpen(false);
      setBanner({
        kind: "error",
        text: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* แถบเลือกห้อง + เติมยอดเท่ากัน */}
      <div className="card-surface flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <Select
            label="ห้องเรียน"
            placeholder={lockClassroom ? undefined : "— เลือกห้องเรียน —"}
            options={classrooms.map((c) => ({ value: c.id, label: c.name }))}
            value={selectedClassroomId}
            onChange={(e) => handleClassroomChange(e.target.value)}
            disabled={lockClassroom}
          />
          {lockClassroom && (
            <p className="mt-1 text-sm text-slate-500">
              คุณเป็นครูประจำชั้นห้องนี้ — บันทึกได้เฉพาะห้องตัวเอง
            </p>
          )}
        </div>

        {students.length > 0 && (
          <div className="flex w-full items-end gap-2 sm:w-auto">
            <div className="w-36">
              <Input
                label="จำนวนเงิน (บาท)"
                inputMode="decimal"
                placeholder="เช่น 20"
                value={fillValue}
                onChange={(e) => setFillValue(e.target.value)}
                className="text-right tabular-nums"
              />
            </div>
            <Button variant="secondary" onClick={handleFillAll}>
              <Wand2 className="h-4 w-4" />
              เติมยอดเท่ากันทุกคน
            </Button>
          </div>
        )}
      </div>

      {/* แบนเนอร์ผลลัพธ์ / ข้อผิดพลาด */}
      {banner && (
        <div
          role="alert"
          className={cn(
            "flex items-start gap-2 rounded-card border px-4 py-3 text-sm",
            banner.kind === "success"
              ? "border-green-200 bg-green-50 text-deposit"
              : "border-red-200 bg-red-50 text-withdraw"
          )}
        >
          {banner.kind === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      {/* ตารางนักเรียนทั้งห้อง */}
      <Table minWidth="720px">
        <THead>
          <TR>
            <TH>รหัส</TH>
            <TH>ชื่อ-นามสกุล</TH>
            <TH align="right">ยอดคงเหลือ (บาท)</TH>
            <TH align="right">จำนวนเงิน (บาท)</TH>
            <TH>ประเภท</TH>
          </TR>
        </THead>
        <TBody>
          {students.map((s, index) => {
            const row = getRow(s.studentId);
            const error = summary.rowErrors[s.studentId];
            return (
              <TR key={s.studentId}>
                <TD className="text-slate-500">{s.studentCode}</TD>
                <TD className="font-medium text-slate-900">{s.name}</TD>
                <TD align="right">{formatBaht(s.balance)}</TD>
                <TD align="right" className="w-44">
                  <Input
                    ref={(el) => {
                      amountRefs.current[index] = el;
                    }}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`จำนวนเงินของ ${s.name}`}
                    value={row.amount}
                    error={error}
                    onChange={(e) => setRow(s.studentId, { amount: e.target.value })}
                    onKeyDown={handleAmountKeyDown(index)}
                    className="text-right tabular-nums"
                  />
                </TD>
                <TD className="w-28">
                  <Select
                    aria-label={`ประเภทธุรกรรมของ ${s.name}`}
                    options={TYPE_OPTIONS}
                    value={row.type}
                    onChange={(e) =>
                      setRow(s.studentId, { type: e.target.value as TxnType })
                    }
                    className="font-medium"
                  />
                </TD>
              </TR>
            );
          })}
          {students.length === 0 && (
            <TableEmpty
              colSpan={5}
              message={
                selectedClassroomId
                  ? "ไม่มีนักเรียนสถานะกำลังศึกษาในห้องนี้"
                  : "เลือกห้องเรียนเพื่อแสดงรายชื่อนักเรียน"
              }
            />
          )}
        </TBody>
      </Table>

      {/* สรุป + ปุ่มบันทึกทั้งหมด */}
      {students.length > 0 && (
        <div className="card-surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span>
              กรอกแล้ว{" "}
              <strong className="text-slate-900">{summary.entries.length}</strong> /{" "}
              {students.length} คน
            </span>
            <span>
              ฝากรวม{" "}
              <strong className="tabular-nums text-deposit">
                {formatBaht(summary.depositTotal)}
              </strong>{" "}
              บาท
            </span>
            <span>
              ถอนรวม{" "}
              <strong className="tabular-nums text-withdraw">
                {formatBaht(summary.withdrawTotal)}
              </strong>{" "}
              บาท
            </span>
            {summary.errorCount > 0 && (
              <Badge variant="red">{summary.errorCount} แถวไม่ถูกต้อง</Badge>
            )}
          </div>
          <Button size="lg" onClick={handleOpenConfirm} disabled={submitting}>
            <Save className="h-4 w-4" />
            บันทึกทั้งหมด
          </Button>
        </div>
      )}

      {/* Modal ยืนยันก่อนบันทึก */}
      <Modal
        open={confirmOpen}
        onClose={() => !submitting && setConfirmOpen(false)}
        title="ยืนยันการบันทึกธุรกรรม"
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
              {submitting ? "กำลังบันทึก..." : "ยืนยันบันทึก"}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-slate-700">
          <p>
            จะบันทึกทั้งหมด{" "}
            <strong className="text-slate-900">{summary.entries.length} รายการ</strong>
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              ฝาก {summary.depositCount} รายการ รวม{" "}
              <strong className="tabular-nums text-deposit">
                {formatBaht(summary.depositTotal)}
              </strong>{" "}
              บาท
            </li>
            <li>
              ถอน {summary.withdrawCount} รายการ รวม{" "}
              <strong className="tabular-nums text-withdraw">
                {formatBaht(summary.withdrawTotal)}
              </strong>{" "}
              บาท
            </li>
          </ul>
          <p className="text-slate-500">
            ระบบบันทึกทั้งชุดในครั้งเดียว — หากมีรายการใดไม่ผ่าน (เช่น ถอนเกินยอด)
            จะยกเลิกทั้งชุดและแจ้งสาเหตุ
          </p>
        </div>
      </Modal>
    </div>
  );
}
