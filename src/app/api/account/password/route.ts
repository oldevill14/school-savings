/**
 * POST /api/account/password — เปลี่ยนรหัสผ่านของตนเอง (ทุก role ที่ล็อกอิน)
 *
 * รับ { currentPassword, newPassword, confirmPassword }
 * - requireRoleApi (ทุก role) — middleware บังคับ login มาแล้วอีกชั้น
 * - รหัสใหม่ยาว >= 8 ตัว, ตรงกับ confirm, และต่างจากรหัสเดิม
 * - verify รหัสเดิมกับ hash ใน DB ก่อนเปลี่ยน
 * - update passwordHash + เคลียร์ mustChangePassword ใน transaction เดียว
 * - เพราะ hash เปลี่ยน claim "pwv" ใน JWT เดิมจะไม่ตรง fingerprint ใหม่ -> getSession
 *   จะ revoke ทุก session เดิม (ทุกเครื่อง) อัตโนมัติ จึงต้อง createSession ใหม่
 *   ให้ตัวเองที่นี่ ไม่งั้นผู้ใช้จะถูกเด้งออกทันทีหลังเปลี่ยนรหัสสำเร็จ
 * - logAudit PASSWORD_CHANGE (fire-and-forget)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  requireRoleApi,
  AuthError,
  verifyPassword,
  hashPassword,
  createSession,
} from "@/lib/auth";
import { logAudit, AuditAction } from "@/lib/audit";

// bcryptjs ต้องรันบน Node.js runtime เท่านั้น (ห้าม edge)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: Request) {
  try {
    const session = await requireRoleApi([
      "ADMIN",
      "TEACHER",
      "PARENT",
      "EXECUTIVE",
    ]);

    const body = (await req.json().catch(() => null)) as {
      currentPassword?: unknown;
      newPassword?: unknown;
      confirmPassword?: unknown;
    } | null;

    const currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword =
      typeof body?.newPassword === "string" ? body.newPassword : "";
    const confirmPassword =
      typeof body?.confirmPassword === "string" ? body.confirmPassword : "";

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: "กรุณากรอกข้อมูลให้ครบทุกช่อง" },
        { status: 400 }
      );
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `รหัสผ่านใหม่ต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร` },
        { status: 400 }
      );
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "รหัสผ่านใหม่และการยืนยันไม่ตรงกัน" },
        { status: 400 }
      );
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { passwordHash: true },
    });
    // ผ่าน requireRoleApi (getSession ตรวจ DB แล้ว) แปลว่าต้องมี user จริง — กันเหนียวไว้
    if (!user) throw new AuthError(401, "ไม่พบบัญชีผู้ใช้");

    const currentOk = await verifyPassword(currentPassword, user.passwordHash);
    if (!currentOk) {
      return NextResponse.json(
        { error: "รหัสผ่านเดิมไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash: newHash, mustChangePassword: false },
    });

    // hash เปลี่ยน -> pwv fingerprint เดิมใช้ไม่ได้ (ทุก session ถูก revoke รวมของเราเอง)
    // ออก session ใหม่ให้ตัวเองด้วย hash ล่าสุด (createSession อ่าน hash จาก DB เอง)
    await createSession({
      userId: session.userId,
      role: session.role,
      name: session.name,
      studentIds: session.studentIds,
    });

    await logAudit({
      userId: session.userId,
      action: AuditAction.PASSWORD_CHANGE,
      detail: "เปลี่ยนรหัสผ่านด้วยตนเอง",
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
