/**
 * PATCH /api/users/[id] — จัดการผู้ใช้รายคน (ADMIN เท่านั้น)
 *
 * body: { action: "reset-password" | "disable" | "enable" }
 * - reset-password : สุ่มรหัสผ่านใหม่ 8 ตัว คืนครั้งเดียว (ถ้าบัญชีถูกปิดใช้งานอยู่ จะเปิดกลับด้วย)
 * - disable        : ปิดใช้งาน — ห้ามปิดตัวเอง และต้องเหลือ ADMIN ที่ใช้งานได้อย่างน้อย 1 คน
 * - enable         : เปิดใช้งานกลับ
 *
 * ไม่มีการลบผู้ใช้ (หลักการ "ไม่มีอะไรถูกลบ") — ปิดใช้งานเท่านั้น
 * กลไกปิดใช้งาน: เติม prefix "DISABLED:" หน้า passwordHash (ดู NOTES-admin.md)
 */
import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { requireRoleApi, hashPassword, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit, AuditAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

const DISABLED_PREFIX = "DISABLED:";

/** สุ่มรหัสผ่าน 8 ตัว — ชุดตัวอักษรเดียวกับ POST /api/users */
const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function generatePassword(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)];
  }
  return out;
}

function errorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("api/users/[id]:", e);
  return NextResponse.json(
    { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
    { status: 500 }
  );
}

function userSummary(u: {
  id: string;
  username: string;
  name: string;
  role: string;
  passwordHash: string;
}) {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    active: !u.passwordHash.startsWith(DISABLED_PREFIX),
  };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRoleApi(["ADMIN"]);
    const { id } = await params;

    const body = await req.json().catch(() => null);
    const action = body?.action;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 });
    }

    // ---------- รีเซ็ตรหัสผ่าน ----------
    if (action === "reset-password") {
      const password = generatePassword(8);
      const updated = await prisma.user.update({
        where: { id: target.id },
        // hash ใหม่ทับ prefix DISABLED: เดิม = บัญชีกลับมาใช้งานได้ด้วย
        // + บังคับให้ผู้ใช้เปลี่ยนรหัสผ่านเองครั้งถัดไปที่ล็อกอิน (B2 เป็นผู้บังคับใช้ตอน login/account)
        data: { passwordHash: await hashPassword(password), mustChangePassword: true },
      });
      await logAudit({
        userId: session.userId,
        action: AuditAction.PASSWORD_RESET,
        detail: `รีเซ็ตรหัสผ่านของ ${target.username} (${target.name})`,
      });
      return NextResponse.json({ ok: true, user: userSummary(updated), password });
    }

    // ---------- ปิดใช้งาน ----------
    if (action === "disable") {
      if (target.id === session.userId) {
        return NextResponse.json(
          { error: "ปิดใช้งานบัญชีของตัวเองไม่ได้" },
          { status: 400 }
        );
      }
      if (target.passwordHash.startsWith(DISABLED_PREFIX)) {
        return NextResponse.json(
          { error: "บัญชีนี้ถูกปิดใช้งานอยู่แล้ว" },
          { status: 400 }
        );
      }
      if (target.role === "ADMIN") {
        const admins = await prisma.user.findMany({
          where: { role: "ADMIN", id: { not: target.id } },
          select: { passwordHash: true },
        });
        const otherActive = admins.filter(
          (a) => !a.passwordHash.startsWith(DISABLED_PREFIX)
        );
        if (otherActive.length === 0) {
          return NextResponse.json(
            { error: "ต้องเหลือผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน" },
            { status: 400 }
          );
        }
      }
      const updated = await prisma.user.update({
        where: { id: target.id },
        data: { passwordHash: `${DISABLED_PREFIX}${target.passwordHash}` },
      });
      await logAudit({
        userId: session.userId,
        action: AuditAction.USER_DISABLE,
        detail: `ปิดใช้งานบัญชี ${target.username} (${target.name})`,
      });
      return NextResponse.json({ ok: true, user: userSummary(updated) });
    }

    // ---------- เปิดใช้งานกลับ ----------
    if (action === "enable") {
      if (!target.passwordHash.startsWith(DISABLED_PREFIX)) {
        return NextResponse.json(
          { error: "บัญชีนี้ใช้งานได้อยู่แล้ว" },
          { status: 400 }
        );
      }
      const updated = await prisma.user.update({
        where: { id: target.id },
        data: { passwordHash: target.passwordHash.slice(DISABLED_PREFIX.length) },
      });
      await logAudit({
        userId: session.userId,
        action: AuditAction.USER_ENABLE,
        detail: `เปิดใช้งานบัญชี ${target.username} (${target.name})`,
      });
      return NextResponse.json({ ok: true, user: userSummary(updated) });
    }

    return NextResponse.json(
      { error: "action ไม่ถูกต้อง (reset-password / disable / enable)" },
      { status: 400 }
    );
  } catch (e) {
    return errorResponse(e);
  }
}
