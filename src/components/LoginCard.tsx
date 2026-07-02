"use client";

/**
 * LoginCard — การ์ดเข้าสู่ระบบ 2 คอลัมน์ (client component)
 *
 * ซ้าย: พื้นน้ำเงินกรมท่า โลโก้วงกลม ชื่อระบบ โรงเรียน เช็คลิสต์ 5 ฟีเจอร์จุดทอง
 *       ล่างสุด "ปีการศึกษา <ปี active จาก DB> · เวอร์ชัน 1.0" (mobile ย่อเป็น header แถบบน)
 * ขวา: ฟอร์มเข้าสู่ระบบ (ชื่อผู้ใช้ + รหัสผ่าน + toggle แสดงรหัสผ่าน)
 *       ล่าง: "ปีการศึกษา <ปี active>" ซ้าย · ลิงก์ "ลืมรหัสผ่าน?" ขวา (เปิด modal)
 *
 * ปีการศึกษารับมาทาง prop `year` (page อ่านจาก prisma.academicYear ที่ isActive)
 * — ถ้ายังไม่มีปี active (year = null) จะแสดงข้อความกลางๆ ไม่ระบุปี
 *
 * flow: POST /api/auth/login -> { ok, role, redirect } -> client redirect
 * (PARENT -> /my-child, อื่น -> /dashboard, หรือ nextPath ที่ middleware ส่งมา)
 */
import { useState, type FormEvent } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  LogIn,
  UserRound,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";

/** 5 ฟีเจอร์เด่นที่แสดงฝั่งซ้าย (จุดนำหน้าสีทอง) */
const FEATURES = [
  "บันทึกรายการฝาก–ถอนของนักเรียนรายวัน",
  "สมุดบัญชีออนไลน์ ตรวจสอบย้อนหลังได้ทุกรายการ",
  "ผู้ปกครองติดตามยอดเงินออมของบุตรหลานได้ตลอดเวลา",
  "รายงานสรุปรายห้องเรียนและภาพรวมทั้งโรงเรียน",
  "แบ่งสิทธิ์ผู้ดูแลระบบ ครูประจำชั้น และผู้ปกครองอย่างปลอดภัย",
] as const;

export interface LoginCardProps {
  /** path ที่จะพากลับไปหลัง login สำเร็จ (มาจาก ?next= ของ middleware) — ผ่านการกรองจาก page แล้ว */
  nextPath?: string | null;
  /** ปีการศึกษาที่เปิดใช้งาน (พ.ศ.) — null ถ้ายังไม่มีปี active ใน DB */
  year?: number | null;
}

export default function LoginCard({ nextPath = null, year = null }: LoginCardProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    const name = username.trim();
    if (!name || !password) {
      setError("กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, password }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        role?: string;
        redirect?: string;
        error?: string;
      } | null;

      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        setLoading(false);
        return;
      }

      // ใช้ nextPath เฉพาะเมื่อมี (middleware เป็นคนใส่มา) — ถ้า role เข้าไม่ได้
      // middleware จะพาไปหน้าหลักของ role นั้นเอง จึงปลอดภัย
      const target = nextPath ?? data.redirect ?? "/dashboard";
      // ใช้ full navigation เพื่อให้ middleware/Server Component อ่าน cookie ใหม่แน่นอน
      window.location.replace(target);
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง");
      setLoading(false);
    }
  }

  return (
    <div className="card-surface grid w-full max-w-4xl overflow-hidden lg:grid-cols-2">
      {/* ───── ซ้าย: แบรนด์ (พื้นน้ำเงินกรมท่า) ───── */}
      <div className="bg-navy text-white">
        {/* mobile: ย่อเป็น header แถบบน */}
        <div className="flex items-center gap-3 px-5 py-4 lg:hidden">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 ring-2 ring-gold">
            {/* โลโก้ระบบ — เปลี่ยนได้โดยแทนที่ไฟล์ public/logo.png (ดู README หัวข้อ "เปลี่ยนโลโก้") */}
            <img src="/logo.png" alt="ตราโรงเรียน" className="h-8 w-8 object-contain" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white">
              ระบบออมทรัพย์โรงเรียน
            </p>
            <p className="truncate text-xs text-white/70">
              โรงเรียนบ้านกะดาด สพป.สุรินทร์ เขต 3
            </p>
          </div>
        </div>

        {/* desktop: แผงเต็มความสูง */}
        <div className="hidden h-full flex-col p-10 lg:flex">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white/10 ring-2 ring-gold">
            {/* โลโก้ระบบ — เปลี่ยนได้โดยแทนที่ไฟล์ public/logo.png (ดู README หัวข้อ "เปลี่ยนโลโก้") */}
            <img src="/logo.png" alt="ตราโรงเรียน" className="h-14 w-14 object-contain" />
          </div>

          <h1 className="mt-6 text-2xl font-semibold leading-snug text-white">
            ระบบออมทรัพย์โรงเรียน
          </h1>
          <p className="mt-1 text-sm text-white/75">
            โรงเรียนบ้านกะดาด สพป.สุรินทร์ เขต 3
          </p>

          <ul className="mt-8 space-y-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm text-white/90">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold"
                  aria-hidden="true"
                />
                {feature}
              </li>
            ))}
          </ul>

          <div className="flex-1" />

          <p className="pt-8 text-xs text-white/60">
            {year !== null ? `ปีการศึกษา ${year} · เวอร์ชัน 1.0` : "เวอร์ชัน 1.0"}
          </p>
        </div>
      </div>

      {/* ───── ขวา: ฟอร์มเข้าสู่ระบบ (พื้นขาว) ───── */}
      <div className="flex flex-col justify-center bg-white p-6 sm:p-8 lg:p-10">
        <h2 className="text-xl font-semibold text-slate-900">เข้าสู่ระบบ</h2>
        <p className="mt-1 text-sm text-slate-500">
          กรอกชื่อผู้ใช้และรหัสผ่านเพื่อเข้าใช้งานระบบ
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          {/* ชื่อผู้ใช้ */}
          <div>
            <label
              htmlFor="login-username"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              ชื่อผู้ใช้
            </label>
            <div className="relative">
              <UserRound
                className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400"
                aria-hidden="true"
              />
              <Input
                id="login-username"
                name="username"
                autoComplete="username"
                placeholder="กรอกชื่อผู้ใช้"
                className="pl-10"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>
          </div>

          {/* รหัสผ่าน */}
          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              รหัสผ่าน
            </label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400"
                aria-hidden="true"
              />
              <Input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="กรอกรหัสผ่าน"
                className="pl-10 pr-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* ข้อความผิดพลาดระดับฟอร์ม */}
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-withdraw/30 bg-withdraw/10 px-3 py-2 text-sm text-withdraw"
            >
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            <LogIn className="h-5 w-5" aria-hidden="true" />
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between border-t border-line pt-4 text-sm">
          <span className="text-slate-500">
            {year !== null ? `ปีการศึกษา ${year}` : "ระบบออมทรัพย์โรงเรียน"}
          </span>
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="link-navy font-medium"
          >
            ลืมรหัสผ่าน?
          </button>
        </div>
      </div>

      {/* modal ลืมรหัสผ่าน */}
      <Modal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="ลืมรหัสผ่าน"
        size="sm"
        footer={<Button onClick={() => setForgotOpen(false)}>รับทราบ</Button>}
      >
        <p className="text-sm leading-relaxed text-slate-700">
          ระบบไม่เปิดให้รีเซ็ตรหัสผ่านด้วยตนเอง
          กรุณาติดต่อครูการเงิน (ผู้ดูแลระบบ) ที่ห้องธุรการของโรงเรียน
          เพื่อขอรีเซ็ตรหัสผ่านใหม่
        </p>
      </Modal>
    </div>
  );
}
