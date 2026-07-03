/**
 * POST  /api/transactions — บันทึกธุรกรรมรายคน (ADMIN, TEACHER)
 *   body: { studentId: string; amount: number; type: "DEPOSIT" | "WITHDRAW"; note?: string }
 *   ใช้ logic ชุดเดียวกับ batch (recordTransactions ใน _lib.ts) — validate + อัปเดตยอดใน $transaction
 *
 * PATCH /api/transactions — ยกเลิกรายการ (ADMIN เท่านั้น)
 *   body: { id: string }
 *   ห้ามลบธุรกรรม — ตั้ง status=VOIDED + คืนยอดใน $transaction เดียว
 */
import { NextResponse } from "next/server";
import { requireRoleApi, AuthError } from "@/lib/auth";
import {
  recordTransactions,
  voidTransaction,
  parseTxnItem,
  TxnError,
} from "./_lib";

function errorResponse(e: unknown): NextResponse {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof TxnError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("[/api/transactions]", e);
  return NextResponse.json(
    { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
    { status: 500 }
  );
}

export async function POST(req: Request) {
  try {
    const session = await requireRoleApi(["ADMIN", "TEACHER"]);

    const body: unknown = await req.json().catch(() => null);
    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { error: "รูปแบบข้อมูลไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const item = parseTxnItem(body);
    const { count, results } = await recordTransactions(session, [item]);

    return NextResponse.json({ ok: true, count, results });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireRoleApi(["ADMIN"]);

    const body: unknown = await req.json().catch(() => null);
    const id =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).id
        : undefined;
    if (typeof id !== "string" || id.trim() === "") {
      return NextResponse.json(
        { error: "ไม่ได้ระบุรายการที่ต้องการยกเลิก" },
        { status: 400 }
      );
    }

    await voidTransaction(session, id.trim());

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
