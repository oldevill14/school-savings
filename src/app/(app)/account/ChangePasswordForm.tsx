"use client";

/**
 * ChangePasswordForm — ฟอร์มเปลี่ยนรหัสผ่านตนเอง (client component)
 *
 * POST /api/account/password { currentPassword, newPassword, confirmPassword }
 * - validate ฝั่ง client ก่อน (ครบทุกช่อง, ใหม่ >= 8 ตัว, ตรง confirm, ต่างจากเดิม)
 *   server ตรวจซ้ำเสมอ
 * - สำเร็จ -> เคลียร์ฟอร์ม + ข้อความสำเร็จ + router.refresh() เพื่อล้าง banner
 *   เตือนเปลี่ยนรหัส (mustChangePassword=false แล้ว) — cookie session ถูกออกใหม่
 *   โดย response แล้ว จึงยังล็อกอินอยู่
 */
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

const MIN_PASSWORD_LENGTH = 8;

export default function ChangePasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setSuccess(false);

    if (!current || !next || !confirm) {
      setError("กรุณากรอกข้อมูลให้ครบทุกช่อง");
      return;
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`);
      return;
    }
    if (next !== confirm) {
      setError("รหัสผ่านใหม่และการยืนยันไม่ตรงกัน");
      return;
    }
    if (next === current) {
      setError("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next,
          confirmPassword: confirm,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!res.ok || !data?.ok) {
        setError(
          data?.error ?? "เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
        );
        setLoading(false);
        return;
      }

      setSuccess(true);
      setCurrent("");
      setNext("");
      setConfirm("");
      setLoading(false);
      router.refresh();
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง");
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <Input
        label="รหัสผ่านปัจจุบัน"
        type={show ? "text" : "password"}
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        disabled={loading}
      />
      <Input
        label="รหัสผ่านใหม่"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        disabled={loading}
        hint={`อย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`}
      />
      <Input
        label="ยืนยันรหัสผ่านใหม่"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        disabled={loading}
      />

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={show}
          onChange={(e) => setShow(e.target.checked)}
          className="h-4 w-4 rounded border-line text-navy focus:ring-navy/30"
        />
        แสดงรหัสผ่าน
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-withdraw/30 bg-withdraw/10 px-3 py-2 text-sm text-withdraw"
        >
          {error}
        </p>
      )}
      {success && (
        <p className="flex items-center gap-2 rounded-lg border border-deposit/30 bg-deposit/10 px-3 py-2 text-sm text-deposit">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          เปลี่ยนรหัสผ่านเรียบร้อยแล้ว
        </p>
      )}

      <Button type="submit" disabled={loading}>
        <KeyRound className="h-4 w-4" aria-hidden="true" />
        {loading ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
      </Button>
    </form>
  );
}
