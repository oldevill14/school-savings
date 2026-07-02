"use client";

/**
 * ส่วน interactive ของหน้า /students (client component)
 * — ค้นหา (ชื่อ/รหัส), กรองห้อง, เพิ่ม/แก้ไข/ย้ายห้อง (Modal), นำเข้า CSV
 *
 * ADMIN เท่านั้นที่เห็นปุ่มจัดการ (canManage) — API ฝั่ง server ตรวจ role ซ้ำอีกชั้นเสมอ
 */
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  BookOpen,
  Pencil,
  Search,
  Upload,
  UserPlus,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import Badge, { type BadgeVariant } from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";
import { formatBaht } from "@/lib/money";

// ---------- types ----------

export type StudentStatusValue = "ACTIVE" | "GRADUATED" | "MOVED";

export interface StudentRow {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  status: StudentStatusValue;
  classroomId: string;
  classroomName: string;
  /** ยอดคงเหลือปี active (Decimal.toString()) — null ถ้ายังไม่มีบัญชี */
  balance: string | null;
}

export interface ClassroomOption {
  id: string;
  name: string;
}

interface StudentsClientProps {
  students: StudentRow[];
  classrooms: ClassroomOption[];
  canManage: boolean;
}

type ModalState =
  | { mode: "add" }
  | { mode: "edit"; student: StudentRow }
  | { mode: "move"; student: StudentRow }
  | { mode: "import" }
  | null;

interface StudentForm {
  studentCode: string;
  firstName: string;
  lastName: string;
  classroomId: string;
  status: StudentStatusValue;
}

interface CsvRow {
  line: number;
  studentCode: string;
  firstName: string;
  lastName: string;
  classroomName: string;
}

interface ImportResult {
  created: number;
  skipped: { line: number; studentCode: string; reason: string }[];
}

// ---------- ค่าคงที่แสดงผล ----------

const STATUS_LABELS: Record<StudentStatusValue, string> = {
  ACTIVE: "กำลังศึกษา",
  GRADUATED: "จบการศึกษา",
  MOVED: "ย้ายโรงเรียน",
};

const STATUS_VARIANTS: Record<StudentStatusValue, BadgeVariant> = {
  ACTIVE: "green",
  GRADUATED: "gray",
  MOVED: "gray",
};

const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as StudentStatusValue[]).map((s) => ({
  value: s,
  label: STATUS_LABELS[s],
}));

const EMPTY_FORM: StudentForm = {
  studentCode: "",
  firstName: "",
  lastName: "",
  classroomId: "",
  status: "ACTIVE",
};

// ---------- helpers ----------

/** เรียก API แล้วโยน Error(ข้อความไทยจาก server) เมื่อไม่สำเร็จ */
async function callApi<T>(url: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
  }
  return data;
}

/** แปลงข้อความ CSV เป็นแถวนำเข้า (studentCode,firstName,lastName,classroomName) */
function parseCsv(text: string): { rows: CsvRow[]; errors: string[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const rows: CsvRow[] = [];
  const errors: string[] = [];

  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) return;
    const cols = line.split(",").map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim());
    // ข้ามแถวหัวตาราง
    if (i === 0 && cols[0]?.toLowerCase() === "studentcode") return;
    if (cols.length < 4 || cols.slice(0, 4).some((c) => !c)) {
      errors.push(`บรรทัดที่ ${i + 1}: ข้อมูลไม่ครบ 4 คอลัมน์ (studentCode,firstName,lastName,classroomName)`);
      return;
    }
    rows.push({
      line: i + 1,
      studentCode: cols[0],
      firstName: cols[1],
      lastName: cols[2],
      classroomName: cols[3],
    });
  });

  return { rows, errors };
}

// ---------- component หลัก ----------

export default function StudentsClient({
  students,
  classrooms,
  canManage,
}: StudentsClientProps) {
  const router = useRouter();

  // ค้นหา + กรอง
  const [search, setSearch] = useState("");
  const [classroomFilter, setClassroomFilter] = useState("");

  // modal + ฟอร์ม
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<StudentForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // นำเข้า CSV
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const classroomOptions = classrooms.map((c) => ({ value: c.id, label: c.name }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (classroomFilter && s.classroomId !== classroomFilter) return false;
      if (!q) return true;
      const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
      return s.studentCode.toLowerCase().includes(q) || fullName.includes(q);
    });
  }, [students, search, classroomFilter]);

  // ---------- เปิด/ปิด modal ----------

  function closeModal() {
    if (busy) return;
    setModal(null);
    setError("");
    setForm(EMPTY_FORM);
    setCsvRows([]);
    setCsvErrors([]);
    setCsvFileName("");
    setImportResult(null);
  }

  function openAdd() {
    setForm({ ...EMPTY_FORM, classroomId: classrooms[0]?.id ?? "" });
    setError("");
    setModal({ mode: "add" });
  }

  function openEdit(student: StudentRow) {
    setForm({
      studentCode: student.studentCode,
      firstName: student.firstName,
      lastName: student.lastName,
      classroomId: student.classroomId,
      status: student.status,
    });
    setError("");
    setModal({ mode: "edit", student });
  }

  function openMove(student: StudentRow) {
    setForm({ ...EMPTY_FORM, classroomId: "" });
    setError("");
    setModal({ mode: "move", student });
  }

  function openImport() {
    setCsvRows([]);
    setCsvErrors([]);
    setCsvFileName("");
    setImportResult(null);
    setError("");
    setModal({ mode: "import" });
  }

  // ---------- submit ----------

  async function submitAdd() {
    setBusy(true);
    setError("");
    try {
      await callApi("/api/students", "POST", {
        studentCode: form.studentCode,
        firstName: form.firstName,
        lastName: form.lastName,
        classroomId: form.classroomId,
      });
      setModal(null);
      setForm(EMPTY_FORM);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(student: StudentRow) {
    setBusy(true);
    setError("");
    try {
      await callApi(`/api/students/${student.id}`, "PATCH", {
        studentCode: form.studentCode,
        firstName: form.firstName,
        lastName: form.lastName,
        classroomId: form.classroomId,
        status: form.status,
      });
      setModal(null);
      setForm(EMPTY_FORM);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  async function submitMove(student: StudentRow) {
    if (!form.classroomId) {
      setError("กรุณาเลือกห้องเรียนปลายทาง");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await callApi(`/api/students/${student.id}`, "PATCH", {
        classroomId: form.classroomId,
      });
      setModal(null);
      setForm(EMPTY_FORM);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  function onCsvFileChange(file: File | undefined) {
    setImportResult(null);
    setCsvRows([]);
    setCsvErrors([]);
    setCsvFileName(file?.name ?? "");
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { rows, errors } = parseCsv(String(reader.result ?? ""));
      setCsvRows(rows);
      setCsvErrors(errors);
      if (rows.length === 0 && errors.length === 0) {
        setCsvErrors(["ไม่พบข้อมูลนักเรียนในไฟล์"]);
      }
    };
    reader.readAsText(file, "utf-8");
  }

  async function submitImport() {
    if (csvRows.length === 0) {
      setError("กรุณาเลือกไฟล์ CSV ที่มีข้อมูลก่อนนำเข้า");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await callApi<ImportResult>("/api/students", "POST", { rows: csvRows });
      setImportResult(result);
      setCsvRows([]);
      setCsvFileName("");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  // ---------- render ----------

  return (
    <div className="space-y-4">
      {/* แถบเครื่องมือ: ค้นหา / กรองห้อง / ปุ่มจัดการ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:max-w-xl sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อหรือรหัสนักเรียน..."
              className="pl-9"
              aria-label="ค้นหาชื่อหรือรหัสนักเรียน"
            />
          </div>
          <div className="sm:w-48">
            <Select
              value={classroomFilter}
              onChange={(e) => setClassroomFilter(e.target.value)}
              placeholder="ทุกห้องเรียน"
              options={classroomOptions}
              aria-label="กรองตามห้องเรียน"
            />
          </div>
        </div>

        {canManage && (
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={openImport}>
              <Upload className="h-4 w-4" />
              นำเข้า CSV
            </Button>
            <Button onClick={openAdd}>
              <UserPlus className="h-4 w-4" />
              เพิ่มนักเรียน
            </Button>
          </div>
        )}
      </div>

      {/* ตารางรายชื่อ */}
      <Table minWidth="760px">
        <THead>
          <TR>
            <TH>รหัส</TH>
            <TH>ชื่อ-นามสกุล</TH>
            <TH>ห้องเรียน</TH>
            <TH>สถานะ</TH>
            <TH align="right">ยอดคงเหลือ (บาท)</TH>
            <TH align="center">จัดการ</TH>
          </TR>
        </THead>
        <TBody>
          {filtered.map((s) => (
            <TR key={s.id}>
              <TD className="whitespace-nowrap font-medium tabular-nums">{s.studentCode}</TD>
              <TD>
                <Link href={`/students/${s.id}`} className="link-navy font-medium">
                  {s.firstName} {s.lastName}
                </Link>
              </TD>
              <TD className="whitespace-nowrap">{s.classroomName}</TD>
              <TD>
                <Badge variant={STATUS_VARIANTS[s.status]}>{STATUS_LABELS[s.status]}</Badge>
              </TD>
              <TD align="right" className="font-medium">
                {s.balance !== null ? formatBaht(s.balance) : "-"}
              </TD>
              <TD align="center">
                <div className="inline-flex items-center gap-1">
                  <Link
                    href={`/passbook/${s.id}`}
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm text-navy hover:bg-navy/5"
                    title="เปิดสมุดบัญชี"
                  >
                    <BookOpen className="h-4 w-4" />
                    <span className="hidden xl:inline">สมุดบัญชี</span>
                  </Link>
                  {canManage && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(s)}
                        title="แก้ไขข้อมูลนักเรียน"
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="hidden xl:inline">แก้ไข</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openMove(s)}
                        title="ย้ายห้องเรียน"
                      >
                        <ArrowRightLeft className="h-4 w-4" />
                        <span className="hidden xl:inline">ย้ายห้อง</span>
                      </Button>
                    </>
                  )}
                </div>
              </TD>
            </TR>
          ))}
          {filtered.length === 0 && (
            <TableEmpty
              colSpan={6}
              message={
                students.length === 0
                  ? "ยังไม่มีนักเรียนในระบบ"
                  : "ไม่พบนักเรียนที่ตรงกับเงื่อนไขการค้นหา"
              }
            />
          )}
        </TBody>
      </Table>

      {/* ---------- Modal เพิ่มนักเรียน ---------- */}
      <Modal
        open={modal?.mode === "add"}
        onClose={closeModal}
        title="เพิ่มนักเรียนใหม่"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={busy}>
              ยกเลิก
            </Button>
            <Button onClick={submitAdd} disabled={busy}>
              {busy ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="รหัสนักเรียน"
            value={form.studentCode}
            onChange={(e) => setForm({ ...form, studentCode: e.target.value })}
            placeholder="เช่น 69021"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="ชื่อ"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              placeholder="เช่น กิตติศักดิ์"
            />
            <Input
              label="นามสกุล"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              placeholder="เช่น สายบุตร"
            />
          </div>
          <Select
            label="ห้องเรียน"
            value={form.classroomId}
            onChange={(e) => setForm({ ...form, classroomId: e.target.value })}
            placeholder="— เลือกห้องเรียน —"
            options={classroomOptions}
          />
          {error && <p className="text-sm text-withdraw">{error}</p>}
          <p className="text-xs text-slate-500">
            ระบบจะเปิดบัญชีออมทรัพย์ของปีการศึกษาปัจจุบันให้อัตโนมัติ (ยอดเริ่มต้น 0.00 บาท)
          </p>
        </div>
      </Modal>

      {/* ---------- Modal แก้ไขนักเรียน ---------- */}
      <Modal
        open={modal?.mode === "edit"}
        onClose={closeModal}
        title={
          modal?.mode === "edit"
            ? `แก้ไขข้อมูล — ${modal.student.firstName} ${modal.student.lastName}`
            : "แก้ไขข้อมูลนักเรียน"
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={busy}>
              ยกเลิก
            </Button>
            <Button
              onClick={() => modal?.mode === "edit" && submitEdit(modal.student)}
              disabled={busy}
            >
              {busy ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="รหัสนักเรียน"
            value={form.studentCode}
            onChange={(e) => setForm({ ...form, studentCode: e.target.value })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="ชื่อ"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
            <Input
              label="นามสกุล"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
          </div>
          <Select
            label="ห้องเรียน"
            value={form.classroomId}
            onChange={(e) => setForm({ ...form, classroomId: e.target.value })}
            placeholder="— เลือกห้องเรียน —"
            options={classroomOptions}
          />
          <Select
            label="สถานะ"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as StudentStatusValue })}
            options={STATUS_OPTIONS}
          />
          {error && <p className="text-sm text-withdraw">{error}</p>}
          <p className="text-xs text-slate-500">
            ประวัติธุรกรรมและบัญชีของนักเรียนจะไม่ถูกลบ ไม่ว่าจะเปลี่ยนสถานะเป็นอะไร
          </p>
        </div>
      </Modal>

      {/* ---------- Modal ย้ายห้องเรียน ---------- */}
      <Modal
        open={modal?.mode === "move"}
        onClose={closeModal}
        size="sm"
        title={
          modal?.mode === "move"
            ? `ย้ายห้องเรียน — ${modal.student.firstName} ${modal.student.lastName}`
            : "ย้ายห้องเรียน"
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={busy}>
              ยกเลิก
            </Button>
            <Button
              onClick={() => modal?.mode === "move" && submitMove(modal.student)}
              disabled={busy}
            >
              {busy ? "กำลังย้าย..." : "ยืนยันการย้ายห้อง"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {modal?.mode === "move" && (
            <p className="text-sm text-slate-600">
              ห้องเรียนปัจจุบัน: <span className="font-medium">{modal.student.classroomName}</span>
            </p>
          )}
          <Select
            label="ย้ายไปห้องเรียน"
            value={form.classroomId}
            onChange={(e) => setForm({ ...form, classroomId: e.target.value })}
            placeholder="— เลือกห้องเรียนปลายทาง —"
            options={
              modal?.mode === "move"
                ? classroomOptions.filter((c) => c.value !== modal.student.classroomId)
                : classroomOptions
            }
          />
          {error && <p className="text-sm text-withdraw">{error}</p>}
        </div>
      </Modal>

      {/* ---------- Modal นำเข้า CSV ---------- */}
      <Modal
        open={modal?.mode === "import"}
        onClose={closeModal}
        size="lg"
        title="นำเข้ารายชื่อนักเรียนจากไฟล์ CSV"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={busy}>
              ปิด
            </Button>
            <Button onClick={submitImport} disabled={busy || csvRows.length === 0}>
              {busy
                ? "กำลังนำเข้า..."
                : csvRows.length > 0
                  ? `นำเข้า ${csvRows.length} รายการ`
                  : "นำเข้า"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            รูปแบบไฟล์: 1 บรรทัดต่อนักเรียน 1 คน คั่นด้วยเครื่องหมายจุลภาค (,)
            ตามลำดับ&nbsp;
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
              studentCode,firstName,lastName,classroomName
            </code>
            &nbsp;เช่น <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">69021,สมชาย,ใจดี,ป.1/1</code>
            (มีบรรทัดหัวตารางหรือไม่ก็ได้)
          </p>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(e) => onCsvFileChange(e.target.files?.[0])}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-navy file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-navy-light"
            aria-label="เลือกไฟล์ CSV"
          />

          {csvFileName && csvRows.length > 0 && (
            <p className="text-sm text-deposit">
              อ่านไฟล์ &ldquo;{csvFileName}&rdquo; สำเร็จ — พบข้อมูลนักเรียน {csvRows.length} รายการ
              พร้อมนำเข้า
            </p>
          )}

          {csvErrors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-withdraw">
              <p className="font-medium">แถวที่มีปัญหา (จะไม่ถูกนำเข้า):</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {csvErrors.slice(0, 10).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {csvErrors.length > 10 && <li>และอีก {csvErrors.length - 10} แถว</li>}
              </ul>
            </div>
          )}

          {error && <p className="text-sm text-withdraw">{error}</p>}

          {importResult && (
            <div className="rounded-lg border border-line bg-slate-50 p-3 text-sm">
              <p className="font-medium text-deposit">
                นำเข้าสำเร็จ {importResult.created} รายการ
                {importResult.skipped.length > 0 &&
                  ` · ข้าม ${importResult.skipped.length} รายการ`}
              </p>
              {importResult.skipped.length > 0 && (
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-slate-600">
                  {importResult.skipped.slice(0, 10).map((s, i) => (
                    <li key={i}>
                      บรรทัดที่ {s.line} ({s.studentCode}): {s.reason}
                    </li>
                  ))}
                  {importResult.skipped.length > 10 && (
                    <li>และอีก {importResult.skipped.length - 10} รายการ</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
