/**
 * POST /api/auth/logout — ออกจากระบบ
 *
 * Topbar ยิง HTML form POST มาที่ path นี้ (ไม่ใช้ JS) — ตาม CONTRACTS.md:
 * destroySession() แล้ว redirect 303 ไป /login (303 = See Other บังคับ browser GET)
 *
 * idempotent: ไม่มี session อยู่แล้วก็ตอบ redirect เหมือนกัน
 */
import { NextResponse } from "next/server";
import { destroySession, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await destroySession();

  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  // กันเหนียว: ลบ cookie บน response ที่ redirect ด้วย (นอกเหนือจาก cookie store)
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
