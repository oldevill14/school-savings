/**
 * /account — บัญชีของฉัน (ทุก role ที่ล็อกอิน): เปลี่ยนรหัสผ่านตนเอง
 *
 * - แสดง banner เตือนเมื่อ mustChangePassword=true (บัญชีเพิ่งถูกรีเซ็ตรหัสโดยผู้ดูแล)
 *   — หลัง login ผู้ใช้กลุ่มนี้จะถูกพามาหน้านี้ก่อน (ดู POST /api/auth/login)
 * - ฟอร์มเปลี่ยนรหัส (client) POST /api/account/password
 *
 * mustChangePassword ไม่อยู่ใน SessionPayload — อ่านตรงจาก DB ที่นี่
 */
import { ShieldAlert, UserRound } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/components/layout/Topbar";
import Card from "@/components/ui/Card";
import ChangePasswordForm from "./ChangePasswordForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await requireRole([
    "ADMIN",
    "TEACHER",
    "PARENT",
    "EXECUTIVE",
  ]);

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { username: true, mustChangePassword: true },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-navy text-white">
          <UserRound className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl">บัญชีของฉัน</h1>
          <p className="text-sm text-slate-500">
            {session.name} · {ROLE_LABELS[session.role]}
            {user?.username ? ` · ${user.username}` : ""}
          </p>
        </div>
      </header>

      {user?.mustChangePassword && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-card border border-gold/40 bg-gold/10 px-4 py-3"
        >
          <ShieldAlert
            className="mt-0.5 h-5 w-5 shrink-0 text-gold-dark"
            aria-hidden="true"
          />
          <div className="text-sm text-slate-700">
            <p className="font-semibold text-slate-900">กรุณาเปลี่ยนรหัสผ่าน</p>
            <p className="mt-0.5">
              บัญชีของท่านถูกตั้งรหัสผ่านชั่วคราวโดยผู้ดูแลระบบ
              กรุณาตั้งรหัสผ่านใหม่ที่มีเพียงท่านทราบก่อนใช้งานส่วนอื่นของระบบ
            </p>
          </div>
        </div>
      )}

      <Card
        title="เปลี่ยนรหัสผ่าน"
        description="กรอกรหัสผ่านปัจจุบันและตั้งรหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร) — เมื่อเปลี่ยนแล้วอุปกรณ์อื่นที่ยังค้างล็อกอินด้วยรหัสเดิมจะถูกออกจากระบบทันที"
      >
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
