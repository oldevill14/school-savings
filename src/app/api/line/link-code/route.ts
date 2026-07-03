/**
 * POST /api/line/link-code — ออกโค้ดชั่วคราวให้ผู้ปกครองผูกบัญชี LINE
 *
 * - PARENT เท่านั้น (requireRoleApi) — ผู้ใช้เอาโค้ดไปพิมพ์ในแชท LINE ว่า "ผูกบัญชี <รหัส>"
 * - โค้ดหมดอายุใน 10 นาที; ออกใหม่ = ยกเลิก (หมดอายุ) โค้ดเดิมที่ยังไม่ใช้ของคนนี้
 *   เพื่อให้มีโค้ดที่ใช้งานได้ทีละอัน
 *
 * runtime = nodejs เพราะใช้ crypto (randomBytes) + prisma
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ตัวอักษรโค้ด — ตัด O/0/I/1 ที่สับสนตอนพิมพ์ */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const EXPIRY_MS = 10 * 60 * 1000; // 10 นาที

function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export async function POST() {
  try {
    const session = await requireRoleApi(["PARENT"]);

    // ยกเลิกโค้ดเก่าที่ยังไม่ถูกใช้/ยังไม่หมดอายุของผู้ใช้คนนี้ (ให้มีโค้ด active ทีละอัน)
    await prisma.lineLinkCode.updateMany({
      where: {
        userId: session.userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { expiresAt: new Date() },
    });

    // สร้างโค้ดไม่ซ้ำ (retry กันชน unique constraint)
    let code = generateCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await prisma.lineLinkCode.findUnique({ where: { code } });
      if (!exists) break;
      code = generateCode();
    }

    const expiresAt = new Date(Date.now() + EXPIRY_MS);
    await prisma.lineLinkCode.create({
      data: { code, userId: session.userId, expiresAt },
    });

    return NextResponse.json({
      ok: true,
      code,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("สร้างโค้ดผูก LINE ล้มเหลว:", e);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
