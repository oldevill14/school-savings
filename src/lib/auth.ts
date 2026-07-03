/**
 * Authentication + Session (bcryptjs + jose JWT ใน httpOnly cookie ชื่อ "session")
 *
 * ใช้ได้เฉพาะฝั่ง server (Server Component / Route Handler / Server Action)
 * middleware.ts ตรวจ JWT เองด้วย jose โดยตรง (ห้าม import ไฟล์นี้จาก middleware
 * เพราะ bcryptjs ใช้บน edge runtime ไม่ได้)
 */
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

/** ตรงกับ Prisma enum Role — ประกาศแยกไว้เพื่อไม่ผูก lib/UI กับ generated client */
export type Role = "ADMIN" | "TEACHER" | "PARENT" | "EXECUTIVE";

export const SESSION_COOKIE = "session";
const SESSION_MAX_AGE = 60 * 60 * 12; // 12 ชั่วโมง

/**
 * กลไก "ปิดใช้งาน" ผู้ใช้ = เติม prefix นี้หน้า passwordHash
 * (ต้องตรงกับ PATCH /api/users/[id] และ NOTES-admin.md)
 */
const DISABLED_PREFIX = "DISABLED:";

/**
 * fingerprint สั้นๆ (ไม่ย้อนกลับได้) ของ passwordHash — ฝังใน JWT เป็น claim "pwv"
 * ใช้ revoke session เดิมทันทีเมื่อรหัสผ่านถูกรีเซ็ต (hash เปลี่ยน -> fingerprint ไม่ตรง)
 * โดยไม่ต้องเพิ่มคอลัมน์ sessionVersion ใน schema
 */
function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 16);
}

/** payload ที่เก็บใน JWT session cookie */
export type SessionPayload = {
  userId: string;
  role: Role;
  name: string;
  // นักเรียนที่ผู้ใช้ (PARENT) ผูกไว้ผ่านตาราง Guardian — เป็น cuid String[] (ไม่ใช่ number[])
  // เพราะ Student.id เป็น cuid; role อื่นเป็น [] เสมอ
  studentIds: string[];
};

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET ไม่ถูกตั้งค่าใน .env");
  return new TextEncoder().encode(secret);
}

// ---------- รหัสผ่าน ----------

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ---------- session ----------

/**
 * เซ็น JWT แล้ว set cookie "session" (httpOnly, sameSite=lax, อายุ 12 ชม.)
 *
 * Secure attribute เป็น opt-in ผ่าน env COOKIE_SECURE=true เท่านั้น —
 * ห้ามผูกกับ NODE_ENV=production เพราะ deploy จริงในโรงเรียนเป็น plain HTTP
 * ใน LAN (http://192.168.x.x:3000) ถ้าติด Secure ไป browser จะทิ้ง cookie
 * ทำให้ login สำเร็จแต่เด้งกลับหน้า login วนไม่รู้จบ
 * ตั้ง COOKIE_SECURE=true เฉพาะเมื่อมี HTTPS reverse proxy อยู่ข้างหน้าแล้วเท่านั้น
 *
 * ฝัง claim "pwv" (fingerprint ของ passwordHash ปัจจุบัน) ลง JWT ด้วย —
 * getSession จะเทียบกับ DB ทุกครั้ง ทำให้ session เดิมถูก revoke ทันที
 * เมื่อรหัสผ่านถูกรีเซ็ตหรือบัญชีถูกปิดใช้งาน
 */
export async function createSession(payload: SessionPayload): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { passwordHash: true },
  });
  if (!user) throw new Error("ไม่พบผู้ใช้สำหรับสร้าง session");

  const token = await new SignJWT({
    ...payload,
    pwv: passwordFingerprint(user.passwordHash),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/**
 * อ่าน+verify session จาก cookie — คืน null ถ้าไม่มี/หมดอายุ/ปลอม
 *
 * ตรวจกับ DB ทุกครั้งด้วย (ไม่เชื่อ JWT อย่างเดียว) — คืน null เมื่อ:
 * - ไม่พบผู้ใช้ใน DB แล้ว
 * - บัญชีถูกปิดใช้งาน (passwordHash ขึ้นต้น "DISABLED:")
 * - รหัสผ่านถูกรีเซ็ตหลังออก token (claim "pwv" ไม่ตรง fingerprint ปัจจุบัน)
 * ทำให้การปิดใช้งาน/รีเซ็ตรหัสผ่าน revoke session เดิมทันที ไม่ต้องรอ token หมดอายุ
 *
 * role / name / studentIds ใช้ค่าจาก DB (ค่าใน token อาจค้างเก่า)
 * หมายเหตุ: ตรวจใน getSession (ไม่ใช่แค่ requireRole/requireRoleApi) เพื่อให้
 * หน้า /login และ (app)/layout ที่เรียก getSession ตรงๆ เห็นผลเดียวกัน —
 * ถ้าตรวจเฉพาะใน requireRole ผู้ใช้ที่ถูกปิดจะเด้งวน /dashboard <-> /login ไม่รู้จบ
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let userId: string;
  let pwv: unknown;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    userId = payload.userId as string;
    pwv = payload.pwv;
  } catch {
    return null;
  }
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      name: true,
      passwordHash: true,
      // ผูกนักเรียนผ่าน Guardian (แทน linkedStudentId เดิม) — มีเฉพาะ PARENT
      guardians: { select: { studentId: true } },
    },
  });
  if (!user) return null;
  if (user.passwordHash.startsWith(DISABLED_PREFIX)) return null;
  if (pwv !== passwordFingerprint(user.passwordHash)) return null;

  return {
    userId,
    role: user.role as Role,
    name: user.name,
    studentIds: user.role === "PARENT" ? user.guardians.map((g) => g.studentId) : [],
  };
}

/** ลบ cookie session (logout) */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// ---------- role guard ----------

/**
 * สำหรับ Server Component / Page / Server Action:
 * - ไม่มี session -> redirect("/login")
 * - role ไม่อยู่ใน roles -> redirect ไปหน้าหลักของ role นั้น
 * - ผ่าน -> คืน SessionPayload
 *
 * ตัวอย่าง: const session = await requireRole(["ADMIN", "TEACHER"]);
 */
export async function requireRole(roles: Role[]): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!roles.includes(session.role)) {
    redirect(session.role === "PARENT" ? "/my-child" : "/dashboard");
  }
  return session;
}

/** error ที่ requireRoleApi โยนเมื่อไม่มีสิทธิ์ — มี .status (401/403) ให้แปลงเป็น response */
export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * สำหรับ API Route Handler: โยน AuthError แทน redirect
 * - ไม่มี session -> AuthError(401)
 * - role ไม่ตรง -> AuthError(403)
 *
 * ตัวอย่าง:
 *   try {
 *     const session = await requireRoleApi(["ADMIN"]);
 *     ...
 *   } catch (e) {
 *     if (e instanceof AuthError) {
 *       return NextResponse.json({ error: e.message }, { status: e.status });
 *     }
 *     throw e;
 *   }
 */
export async function requireRoleApi(roles: Role[]): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new AuthError(401, "ยังไม่ได้เข้าสู่ระบบ");
  if (!roles.includes(session.role)) throw new AuthError(403, "ไม่มีสิทธิ์เข้าถึงส่วนนี้");
  return session;
}
