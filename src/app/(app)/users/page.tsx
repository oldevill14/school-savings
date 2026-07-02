"use client";

/**
 * /users — จัดการผู้ใช้ (ADMIN เท่านั้น)
 *
 * - ตารางผู้ใช้ทั้งหมด + สถานะใช้งาน
 * - สร้างผู้ใช้ใหม่ (PARENT ต้องเลือกนักเรียนที่ผูก) — รหัสผ่านสุ่ม 8 ตัว แสดงครั้งเดียว
 * - รีเซ็ตรหัสผ่าน (สุ่มใหม่ แสดงครั้งเดียว)
 * - ปิด/เปิดใช้งาน (ไม่มีการลบผู้ใช้)
 *
 * สิทธิ์ถูกบังคับฝั่ง server: middleware (prefix /users = ADMIN)
 * + requireRoleApi(["ADMIN"]) ในทุก endpoint
 */
import { useCallback, useEffect, useState } from "react";
import { Ban, CircleCheck, KeyRound, TriangleAlert, UserPlus } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";
import { ROLE_LABELS } from "@/components/layout/Topbar";
import { formatThaiDate } from "@/lib/thai-date";
import type { Role } from "@/lib/auth";

interface UserRow {
  id: string;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  linkedStudent: { id: string; studentCode: string; name: string } | null;
  createdAt: string;
}

interface StudentOption {
  id: string;
  studentCode: string;
  name: string;
  classroomName: string;
}

interface UsersData {
  me: string;
  users: UserRow[];
  students: StudentOption[];
}

const ROLE_BADGE: Record<Role, "gold" | "navy" | "gray"> = {
  ADMIN: "gold",
  TEACHER: "navy",
  PARENT: "gray",
};

type CreateForm = {
  username: string;
  name: string;
  role: Role;
  linkedStudentId: string;
};

const EMPTY_CREATE: CreateForm = {
  username: "",
  name: "",
  role: "TEACHER",
  linkedStudentId: "",
};

/** modal ยืนยันการกระทำกับผู้ใช้รายคน */
type ConfirmAction = {
  action: "reset-password" | "disable" | "enable";
  user: UserRow;
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default function UsersPage() {
  const [data, setData] = useState<UsersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // รหัสผ่านที่เพิ่งสร้าง/รีเซ็ต — แสดงครั้งเดียวเท่านั้น
  const [passwordReveal, setPasswordReveal] = useState<{
    username: string;
    password: string;
    kind: "create" | "reset";
  } | null>(null);

  const refresh = useCallback(async () => {
    setPageError(null);
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const json = await readJson(res);
      if (!res.ok) {
        throw new Error((json.error as string) || "โหลดข้อมูลไม่สำเร็จ");
      }
      setData(json as unknown as UsersData);
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
    setCreateForm(EMPTY_CREATE);
    setCreateError(null);
    setCreateOpen(true);
  }

  async function submitCreate() {
    setSaving(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: createForm.username,
          name: createForm.name,
          role: createForm.role,
          linkedStudentId:
            createForm.role === "PARENT" ? createForm.linkedStudentId || null : null,
        }),
      });
      const json = await readJson(res);
      if (!res.ok) {
        setCreateError((json.error as string) || "สร้างผู้ใช้ไม่สำเร็จ");
        return;
      }
      setCreateOpen(false);
      setPasswordReveal({
        username: (json.user as { username: string }).username,
        password: json.password as string,
        kind: "create",
      });
      await refresh();
    } catch {
      setCreateError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  async function submitConfirm() {
    if (!confirm) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch(`/api/users/${confirm.user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: confirm.action }),
      });
      const json = await readJson(res);
      if (!res.ok) {
        setConfirmError((json.error as string) || "ดำเนินการไม่สำเร็จ");
        return;
      }
      const done = confirm;
      setConfirm(null);
      if (done.action === "reset-password") {
        setPasswordReveal({
          username: done.user.username,
          password: json.password as string,
          kind: "reset",
        });
      }
      await refresh();
    } catch {
      setConfirmError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่");
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-slate-500">กำลังโหลดข้อมูล...</div>
    );
  }

  if (pageError || !data) {
    return (
      <Card title="จัดการผู้ใช้">
        <p className="text-sm text-withdraw">{pageError ?? "โหลดข้อมูลไม่สำเร็จ"}</p>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => void refresh()}>
            ลองใหม่
          </Button>
        </div>
      </Card>
    );
  }

  const confirmTitle =
    confirm?.action === "reset-password"
      ? "ยืนยันรีเซ็ตรหัสผ่าน"
      : confirm?.action === "disable"
        ? "ยืนยันปิดใช้งานบัญชี"
        : "ยืนยันเปิดใช้งานบัญชี";

  return (
    <div className="space-y-6">
      {/* ส่วนหัว */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">จัดการผู้ใช้</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            ผู้ใช้ทั้งหมด {data.users.length} คน — ระบบไม่ลบผู้ใช้ ใช้การปิดใช้งานแทน
          </p>
        </div>
        <Button onClick={openCreate}>
          <UserPlus className="h-4 w-4" />
          เพิ่มผู้ใช้
        </Button>
      </div>

      {/* ตารางผู้ใช้ */}
      <Table minWidth="860px">
        <THead>
          <TR>
            <TH>ชื่อผู้ใช้</TH>
            <TH>ชื่อ-นามสกุล</TH>
            <TH>บทบาท</TH>
            <TH>นักเรียนที่ผูก</TH>
            <TH>สถานะ</TH>
            <TH>สร้างเมื่อ</TH>
            <TH align="center">จัดการ</TH>
          </TR>
        </THead>
        <TBody>
          {data.users.map((u) => (
            <TR key={u.id} className={u.active ? undefined : "text-slate-400"}>
              <TD className="font-medium text-slate-900">
                {u.username}
                {u.id === data.me && (
                  <Badge variant="navy" className="ml-2">
                    คุณ
                  </Badge>
                )}
              </TD>
              <TD>{u.name}</TD>
              <TD>
                <Badge variant={ROLE_BADGE[u.role]}>{ROLE_LABELS[u.role]}</Badge>
              </TD>
              <TD>
                {u.linkedStudent ? (
                  <span>
                    {u.linkedStudent.studentCode} — {u.linkedStudent.name}
                  </span>
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </TD>
              <TD>
                {u.active ? (
                  <Badge variant="green">ใช้งานได้</Badge>
                ) : (
                  <Badge variant="gray">ปิดใช้งาน</Badge>
                )}
              </TD>
              <TD>{formatThaiDate(u.createdAt)}</TD>
              <TD align="center">
                <div className="flex items-center justify-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setConfirmError(null);
                      setConfirm({ action: "reset-password", user: u });
                    }}
                  >
                    <KeyRound className="h-4 w-4" />
                    รีเซ็ตรหัส
                  </Button>
                  {u.active ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-withdraw hover:bg-red-50"
                      disabled={u.id === data.me}
                      title={
                        u.id === data.me
                          ? "ปิดใช้งานบัญชีของตัวเองไม่ได้"
                          : "ปิดใช้งานบัญชีนี้"
                      }
                      onClick={() => {
                        setConfirmError(null);
                        setConfirm({ action: "disable", user: u });
                      }}
                    >
                      <Ban className="h-4 w-4" />
                      ปิดใช้งาน
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-deposit hover:bg-green-50"
                      onClick={() => {
                        setConfirmError(null);
                        setConfirm({ action: "enable", user: u });
                      }}
                    >
                      <CircleCheck className="h-4 w-4" />
                      เปิดใช้งาน
                    </Button>
                  )}
                </div>
              </TD>
            </TR>
          ))}
          {data.users.length === 0 && (
            <TableEmpty colSpan={7} message="ยังไม่มีผู้ใช้ในระบบ" />
          )}
        </TBody>
      </Table>

      {/* Modal สร้างผู้ใช้ */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="เพิ่มผู้ใช้ใหม่"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              ยกเลิก
            </Button>
            <Button onClick={() => void submitCreate()} disabled={saving}>
              {saving ? "กำลังสร้าง..." : "สร้างผู้ใช้"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="ชื่อผู้ใช้ (username)"
            placeholder="เช่น teacher2"
            hint="อักษรอังกฤษ ตัวเลข _ . - ยาว 3-32 ตัวอักษร"
            autoComplete="off"
            value={createForm.username}
            onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
          />
          <Input
            label="ชื่อ-นามสกุล"
            placeholder="เช่น ครูสมศรี ใจดี"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
          />
          <Select
            label="บทบาท"
            options={(Object.keys(ROLE_LABELS) as Role[]).map((r) => ({
              value: r,
              label: ROLE_LABELS[r],
            }))}
            value={createForm.role}
            onChange={(e) =>
              setCreateForm({
                ...createForm,
                role: e.target.value as Role,
                linkedStudentId: "",
              })
            }
          />
          {createForm.role === "PARENT" && (
            <Select
              label="นักเรียนที่ผูกบัญชี"
              placeholder="— เลือกนักเรียน —"
              options={data.students.map((s) => ({
                value: s.id,
                label: `${s.studentCode} ${s.name} (${s.classroomName})`,
              }))}
              value={createForm.linkedStudentId}
              onChange={(e) =>
                setCreateForm({ ...createForm, linkedStudentId: e.target.value })
              }
            />
          )}
          <p className="text-sm text-slate-500">
            ระบบจะสุ่มรหัสผ่าน 8 ตัวให้อัตโนมัติ และแสดงเพียงครั้งเดียวหลังสร้างสำเร็จ
          </p>
          {createError && <p className="text-sm text-withdraw">{createError}</p>}
        </div>
      </Modal>

      {/* Modal ยืนยันการกระทำ */}
      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirmTitle}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirm(null)}
              disabled={confirming}
            >
              ยกเลิก
            </Button>
            <Button
              variant={confirm?.action === "disable" ? "danger" : "primary"}
              onClick={() => void submitConfirm()}
              disabled={confirming}
            >
              {confirming ? "กำลังดำเนินการ..." : "ยืนยัน"}
            </Button>
          </>
        }
      >
        {confirm && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {confirm.action === "reset-password" && (
                <>
                  รีเซ็ตรหัสผ่านของ{" "}
                  <span className="font-semibold text-slate-900">
                    {confirm.user.username}
                  </span>{" "}
                  ({confirm.user.name}) — ระบบจะสุ่มรหัสผ่านใหม่และแสดงเพียงครั้งเดียว
                  {!confirm.user.active && " (บัญชีที่ถูกปิดใช้งานจะถูกเปิดกลับด้วย)"}
                </>
              )}
              {confirm.action === "disable" && (
                <>
                  ปิดใช้งานบัญชี{" "}
                  <span className="font-semibold text-slate-900">
                    {confirm.user.username}
                  </span>{" "}
                  ({confirm.user.name}) — ผู้ใช้นี้จะเข้าสู่ระบบไม่ได้จนกว่าจะเปิดใช้งานกลับ
                  ข้อมูลและประวัติทั้งหมดยังอยู่ครบ
                </>
              )}
              {confirm.action === "enable" && (
                <>
                  เปิดใช้งานบัญชี{" "}
                  <span className="font-semibold text-slate-900">
                    {confirm.user.username}
                  </span>{" "}
                  ({confirm.user.name}) ให้เข้าสู่ระบบได้อีกครั้ง
                </>
              )}
            </p>
            {confirmError && <p className="text-sm text-withdraw">{confirmError}</p>}
          </div>
        )}
      </Modal>

      {/* Modal แสดงรหัสผ่านครั้งเดียว */}
      <Modal
        open={passwordReveal !== null}
        onClose={() => setPasswordReveal(null)}
        title={
          passwordReveal?.kind === "create"
            ? "สร้างผู้ใช้สำเร็จ — รหัสผ่านชั่วคราว"
            : "รีเซ็ตรหัสผ่านสำเร็จ — รหัสผ่านใหม่"
        }
        size="sm"
        footer={<Button onClick={() => setPasswordReveal(null)}>รับทราบ ปิดหน้าต่าง</Button>}
      >
        {passwordReveal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              รหัสผ่านของ{" "}
              <span className="font-semibold text-slate-900">
                {passwordReveal.username}
              </span>{" "}
              คือ
            </p>
            <div className="rounded-lg border border-line bg-surface px-4 py-3 text-center font-mono text-2xl font-bold tracking-widest text-navy">
              {passwordReveal.password}
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-gold-dark">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                รหัสผ่านนี้จะแสดง<span className="font-semibold">เพียงครั้งเดียว</span> —
                กรุณาจดและส่งให้เจ้าของบัญชีทันที หากลืมให้ใช้ &quot;รีเซ็ตรหัส&quot; อีกครั้ง
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
