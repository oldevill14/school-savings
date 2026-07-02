"use client";

/**
 * /classrooms — จัดการห้องเรียนของปีการศึกษาที่กำลังใช้งาน (ADMIN เท่านั้น)
 *
 * เป็น client component ที่ดึงข้อมูลผ่าน GET /api/classrooms
 * — สิทธิ์ถูกบังคับฝั่ง server สองชั้น: middleware (prefix /classrooms = ADMIN)
 *   และ requireRoleApi(["ADMIN"]) ในทุก endpoint ที่หน้านี้เรียก
 */
import { useCallback, useEffect, useState } from "react";
import { GraduationCap, Pencil, Plus, School, Trash2, Wallet } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import StatCard from "@/components/StatCard";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";
import { formatBaht } from "@/lib/money";

interface ClassroomRow {
  id: string;
  name: string;
  teacher: { id: string; name: string } | null;
  studentCount: number;
  totalStudentCount: number;
  totalBalance: number;
}

interface TeacherOption {
  id: string;
  name: string;
}

interface ClassroomsData {
  activeYear: { id: string; year: number } | null;
  classrooms: ClassroomRow[];
  teachers: TeacherOption[];
}

type FormState = {
  mode: "create" | "edit";
  id: string | null;
  name: string;
  teacherId: string;
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default function ClassroomsPage() {
  const [data, setData] = useState<ClassroomsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ClassroomRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setPageError(null);
    try {
      const res = await fetch("/api/classrooms", { cache: "no-store" });
      const json = await readJson(res);
      if (!res.ok) {
        throw new Error((json.error as string) || "โหลดข้อมูลไม่สำเร็จ");
      }
      setData(json as unknown as ClassroomsData);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate() {
    setFormError(null);
    setForm({ mode: "create", id: null, name: "", teacherId: "" });
  }

  function openEdit(c: ClassroomRow) {
    setFormError(null);
    setForm({ mode: "edit", id: c.id, name: c.name, teacherId: c.teacher?.id ?? "" });
  }

  async function submitForm() {
    if (!form) return;
    setSaving(true);
    setFormError(null);
    try {
      const isCreate = form.mode === "create";
      const res = await fetch("/api/classrooms", {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isCreate ? {} : { id: form.id }),
          name: form.name,
          teacherId: form.teacherId || null,
        }),
      });
      const json = await readJson(res);
      if (!res.ok) {
        setFormError((json.error as string) || "บันทึกไม่สำเร็จ");
        return;
      }
      setForm(null);
      await refresh();
    } catch {
      setFormError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  async function submitDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/classrooms", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const json = await readJson(res);
      if (!res.ok) {
        setDeleteError((json.error as string) || "ลบไม่สำเร็จ");
        return;
      }
      setDeleteTarget(null);
      await refresh();
    } catch {
      setDeleteError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-slate-500">กำลังโหลดข้อมูล...</div>
    );
  }

  if (pageError) {
    return (
      <Card title="จัดการห้องเรียน">
        <p className="text-sm text-withdraw">{pageError}</p>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => void refresh()}>
            ลองใหม่
          </Button>
        </div>
      </Card>
    );
  }

  if (!data?.activeYear) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-900">จัดการห้องเรียน</h1>
        <Card>
          <p className="text-sm text-slate-600">
            ยังไม่มีปีการศึกษาที่กำลังใช้งาน — เปิดปีการศึกษาได้ที่เมนู &quot;ปีการศึกษา&quot;
          </p>
        </Card>
      </div>
    );
  }

  const { classrooms, teachers, activeYear } = data;
  const totalStudents = classrooms.reduce((s, c) => s + c.studentCount, 0);
  const totalBalance = classrooms.reduce((s, c) => s + c.totalBalance, 0);

  return (
    <div className="space-y-6">
      {/* ส่วนหัว */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">จัดการห้องเรียน</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            ปีการศึกษา {activeYear.year} <Badge variant="green" className="ml-1">กำลังใช้งาน</Badge>
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          เพิ่มห้องเรียน
        </Button>
      </div>

      {/* สถิติรวม */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard title="จำนวนห้องเรียน" value={`${classrooms.length} ห้อง`} icon={School} />
        <StatCard
          title="นักเรียนที่กำลังศึกษา"
          value={`${totalStudents} คน`}
          icon={GraduationCap}
          tone="green"
        />
        <StatCard
          title="ยอดออมรวมทุกห้อง"
          value={formatBaht(totalBalance)}
          hint="บาท"
          icon={Wallet}
          tone="gold"
        />
      </div>

      {/* ตารางห้องเรียน */}
      <Table>
        <THead>
          <TR>
            <TH>ห้องเรียน</TH>
            <TH>ครูประจำชั้น</TH>
            <TH align="right">นักเรียน (คน)</TH>
            <TH align="right">ยอดออมรวม (บาท)</TH>
            <TH align="center">จัดการ</TH>
          </TR>
        </THead>
        <TBody>
          {classrooms.map((c) => (
            <TR key={c.id}>
              <TD className="font-medium text-slate-900">{c.name}</TD>
              <TD>
                {c.teacher ? (
                  c.teacher.name
                ) : (
                  <span className="text-slate-400">ยังไม่ระบุ</span>
                )}
              </TD>
              <TD align="right">{c.studentCount}</TD>
              <TD align="right" className="font-medium">
                {formatBaht(c.totalBalance)}
              </TD>
              <TD align="center">
                <div className="flex items-center justify-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                    <Pencil className="h-4 w-4" />
                    แก้ไข
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-withdraw hover:bg-red-50"
                    disabled={c.totalStudentCount > 0}
                    title={
                      c.totalStudentCount > 0
                        ? "ลบได้เฉพาะห้องที่ไม่มีนักเรียน"
                        : "ลบห้องเรียน"
                    }
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteTarget(c);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    ลบ
                  </Button>
                </div>
              </TD>
            </TR>
          ))}
          {classrooms.length === 0 && (
            <TableEmpty colSpan={5} message="ยังไม่มีห้องเรียนในปีการศึกษานี้" />
          )}
        </TBody>
      </Table>

      {/* Modal เพิ่ม/แก้ไขห้อง */}
      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.mode === "create" ? "เพิ่มห้องเรียน" : `แก้ไขห้องเรียน ${form?.name ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button onClick={() => void submitForm()} disabled={saving}>
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <Input
              label="ชื่อห้องเรียน"
              placeholder="เช่น ป.1/1"
              hint="ใช้รูปแบบ ป.<ชั้น>/<ห้อง> เช่น ป.1/1 เพื่อให้ระบบเลื่อนชั้นอัตโนมัติตอนปิดปี"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Select
              label="ครูประจำชั้น"
              placeholder="— ไม่ระบุครูประจำชั้น —"
              options={teachers.map((t) => ({ value: t.id, label: t.name }))}
              value={form.teacherId}
              onChange={(e) => setForm({ ...form, teacherId: e.target.value })}
            />
            {formError && <p className="text-sm text-withdraw">{formError}</p>}
          </div>
        )}
      </Modal>

      {/* Modal ยืนยันลบ */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="ยืนยันการลบห้องเรียน"
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              ยกเลิก
            </Button>
            <Button variant="danger" onClick={() => void submitDelete()} disabled={deleting}>
              {deleting ? "กำลังลบ..." : "ลบห้องเรียน"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          ต้องการลบห้องเรียน{" "}
          <span className="font-semibold text-slate-900">{deleteTarget?.name}</span>{" "}
          ของปีการศึกษา {activeYear.year} ใช่หรือไม่?
          ระบบอนุญาตให้ลบเฉพาะห้องที่ไม่มีนักเรียนเท่านั้น
        </p>
        {deleteError && <p className="mt-3 text-sm text-withdraw">{deleteError}</p>}
      </Modal>
    </div>
  );
}
