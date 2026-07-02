/**
 * POST /api/transactions/batch — บันทึกฝาก-ถอนหลายคนพร้อมกัน (ADMIN, TEACHER)
 *
 * body: { items: { studentId: string; amount: number; type: "DEPOSIT" | "WITHDRAW"; note?: string }[] }
 *
 * กติกา (หัวใจของระบบ):
 * - ทุกรายการอยู่ใน prisma.$transaction เดียว — validate ทุกแถว
 *   (จำนวน > 0, ถอนไม่เกิน balance) แถวใดไม่ผ่าน rollback ทั้งชุด
 * - error ภาษาไทย ระบุชื่อนักเรียน + ยอดคงเหลือ (ดู recordTransactions ใน ../_lib.ts)
 * - TEACHER บันทึกได้เฉพาะนักเรียนในห้องที่ตนประจำชั้น (เช็คฝั่ง server เสมอ)
 */
import { NextResponse } from "next/server";
import { requireRoleApi, AuthError } from "@/lib/auth";
import {
  recordTransactions,
  parseTxnItem,
  TxnError,
  MAX_BATCH_SIZE,
  type TxnItem,
} from "../_lib";

export async function POST(req: Request) {
  try {
    const session = await requireRoleApi(["ADMIN", "TEACHER"]);

    const body: unknown = await req.json().catch(() => null);
    const rawItems =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).items
        : undefined;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json(
        { error: "ไม่มีรายการธุรกรรมให้บันทึก — กรุณากรอกจำนวนเงินอย่างน้อย 1 คน" },
        { status: 400 }
      );
    }
    if (rawItems.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `บันทึกได้ครั้งละไม่เกิน ${MAX_BATCH_SIZE} รายการ` },
        { status: 400 }
      );
    }

    const items: TxnItem[] = rawItems.map((raw, i) => parseTxnItem(raw, i));
    const { count } = await recordTransactions(session, items);

    return NextResponse.json({ ok: true, count });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof TxnError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[/api/transactions/batch]", e);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
