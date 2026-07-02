/**
 * POST /api/auth/login — เข้าสู่ระบบ (endpoint สาธารณะ — ยกเว้นจาก middleware แล้ว)
 *
 * รับ { username, password } -> verifyPassword (bcryptjs) -> createSession (JWT cookie)
 * ตอบ { ok: true, role, redirect } ให้ client เป็นผู้ redirect:
 * - PARENT -> /my-child
 * - อื่นๆ  -> /dashboard
 *
 * ผิดพลาด: 401 "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" (ไม่บอกว่าผิดที่ username หรือ password)
 *
 * Rate limiting: จำกัดความพยายามที่ล้มเหลว 5 ครั้ง/15 นาที ต่อ (username + IP)
 * เกินแล้วตอบ 429 พร้อม Retry-After — ตัวนับเป็น in-memory Map (พอสำหรับ
 * deployment โรงเรียนเครื่องเดียวแบบ standalone ไม่ต้องพึ่ง Redis)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";

// bcryptjs ต้องรันบน Node.js runtime เท่านั้น (ห้าม edge)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * hash หลอกสำหรับกรณีไม่พบผู้ใช้ — ยังคงเรียก bcrypt.compare เสมอ
 * เพื่อให้เวลาตอบใกล้เคียงกัน (ลดโอกาสเดา username จาก timing)
 * เป็น hash ของสตริงสุ่มที่ไม่มีทางตรงกับรหัสผ่านจริงในระบบ
 */
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8ZzP0aQ8lXWehVQFDVkUOhQ7O2rWVW";

const INVALID_CREDENTIALS = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง";

// ---------------------------------------------------------------------------
// Rate limiting แบบ in-memory: กัน brute force รหัสผ่าน (โดยเฉพาะบัญชีผู้ปกครอง
// ที่ใช้รหัสสุ่ม 8 ตัว) — นับเฉพาะครั้งที่ "ล้มเหลว" ต่อ key = username + IP
// หมายเหตุ: อยู่ในหน่วยความจำของ process เดียว (Next.js standalone) —
// รีสตาร์ทเซิร์ฟเวอร์แล้วตัวนับหาย ซึ่งยอมรับได้สำหรับ deployment โรงเรียน
// ---------------------------------------------------------------------------

/** จำนวนครั้งที่ล้มเหลวสูงสุดก่อนถูกล็อกชั่วคราว */
const MAX_FAILED_ATTEMPTS = 5;
/** ช่วงเวลานับ/ล็อก: 15 นาที */
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

interface FailedAttemptEntry {
  count: number;
  /** เวลาหมดอายุของหน้าต่างนับ (ms epoch) */
  expiresAt: number;
  /** timer ที่จะลบ entry ทิ้งเมื่อหมดหน้าต่าง — กัน Map โตไม่จำกัด */
  timer: ReturnType<typeof setTimeout>;
}

const failedAttempts = new Map<string, FailedAttemptEntry>();

/** อ่าน IP ของ client จาก header ที่ reverse proxy ใส่มา (เอาตัวแรกใน x-forwarded-for) */
function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** ถ้า key นี้ถูกล็อกอยู่ คืนจำนวน ms ที่เหลือก่อนปลดล็อก — ไม่ล็อกคืน null */
function getLockRemainingMs(key: string): number | null {
  const entry = failedAttempts.get(key);
  if (!entry) return null;
  const remaining = entry.expiresAt - Date.now();
  if (remaining <= 0 || entry.count < MAX_FAILED_ATTEMPTS) return null;
  return remaining;
}

/** บันทึกความพยายามที่ล้มเหลว 1 ครั้ง (fixed window เริ่มนับจากครั้งแรกที่พลาด) */
function recordFailedAttempt(key: string): void {
  const existing = failedAttempts.get(key);
  if (existing && Date.now() < existing.expiresAt) {
    existing.count += 1;
    return;
  }
  // หน้าต่างเดิมหมดอายุแล้ว (หรือยังไม่มี) — เริ่มหน้าต่างใหม่
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => failedAttempts.delete(key), ATTEMPT_WINDOW_MS);
  // อย่าให้ timer ค้าง process ไว้ตอน shutdown — unref มีเฉพาะบน Node.js runtime
  // (cast ผ่าน unknown เพราะ tsconfig รวม lib "dom" ทำให้ type ของ setTimeout กำกวม)
  (timer as unknown as { unref?: () => void }).unref?.();
  failedAttempts.set(key, {
    count: 1,
    expiresAt: Date.now() + ATTEMPT_WINDOW_MS,
    timer,
  });
}

/** ล้างตัวนับเมื่อ login สำเร็จ */
function clearFailedAttempts(key: string): void {
  const entry = failedAttempts.get(key);
  if (entry) {
    clearTimeout(entry.timer);
    failedAttempts.delete(key);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      username?: unknown;
      password?: unknown;
    } | null;

    const username =
      typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" },
        { status: 400 }
      );
    }

    // เช็ค rate limit ก่อนแตะ DB/bcrypt — ถูกล็อกแล้วไม่ต้องเสียแรง verify
    const rateKey = `${username}::${getClientIp(req)}`;
    const lockRemainingMs = getLockRemainingMs(rateKey);
    if (lockRemainingMs !== null) {
      const waitMinutes = Math.max(1, Math.ceil(lockRemainingMs / 60_000));
      return NextResponse.json(
        {
          error: `พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณาลองใหม่อีกครั้งในอีก ${waitMinutes} นาที`,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(lockRemainingMs / 1000)),
          },
        }
      );
    }

    const user = await prisma.user.findUnique({ where: { username } });

    // เรียก compare เสมอแม้ไม่พบผู้ใช้ (กัน timing attack) — ผลลัพธ์ใช้ไม่ได้ถ้า user เป็น null
    const passwordOk = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_HASH
    );

    if (!user || !passwordOk) {
      recordFailedAttempt(rateKey);
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }

    // login สำเร็จ — ล้างตัวนับความพยายามที่ล้มเหลวของ key นี้
    clearFailedAttempts(rateKey);

    await createSession({
      userId: user.id,
      role: user.role,
      name: user.name,
      linkedStudentId: user.linkedStudentId ?? null,
    });

    return NextResponse.json({
      ok: true,
      role: user.role,
      redirect: user.role === "PARENT" ? "/my-child" : "/dashboard",
    });
  } catch {
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
