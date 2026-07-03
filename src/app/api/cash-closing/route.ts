/**
 * POST /api/cash-closing — บันทึกการปิดยอดเงินสดรายวัน (ADMIN เท่านั้น)
 *
 * body: { date: "YYYY-MM-DD"; countedAmount: number | string; note?: string }
 *
 * - คำนวณ expectedNet ใหม่ฝั่ง server (ไม่เชื่อค่าจาก client) จากธุรกรรม NORMAL ของวันนั้น
 * - scope = "ALL" (ปิดยอดทั้งโรงเรียน) — 1 ครั้ง/วัน (บังคับด้วย @@unique([closeDate, scope]))
 * - กันปิดซ้ำ: unique ชน (P2002) → 409 ข้อความไทยชัดเจน
 * - logAudit CASH_CLOSE หลังบันทึกสำเร็จ
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit, AuditAction } from "@/lib/audit";
import { formatBaht } from "@/lib/money";
import { dayRangeFromParam, computeDayCash } from "@/app/(app)/cash-closing/cash-data";

export const dynamic = "force-dynamic";

/** parse จำนวนเงินที่ >= 0 ทศนิยมไม่เกิน 2 ตำแหน่ง (ยอดนับจริงอาจเป็น 0 ได้) */
function parseCountedAmount(value: unknown): number | null {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[,\s฿]/g, "").replace(/บาท$/, ""))
        : NaN;
  if (!Number.isFinite(raw) || raw < 0 || raw > 100_000_000) return null;
  if (Math.abs(Math.round(raw * 100) - raw * 100) > 1e-6) return null;
  return Math.round(raw * 100) / 100;
}

export async function POST(req: Request) {
  try {
    const session = await requireRoleApi(["ADMIN"]);

    const body: unknown = await req.json().catch(() => null);
    const obj =
      typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

    const dateStr = typeof obj.date === "string" ? obj.date : undefined;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json(
        { error: "รูปแบบวันที่ไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const counted = parseCountedAmount(obj.countedAmount);
    if (counted === null) {
      return NextResponse.json(
        { error: "จำนวนเงินที่นับได้ไม่ถูกต้อง — ต้องเป็นตัวเลข 0 ขึ้นไป ทศนิยมไม่เกิน 2 ตำแหน่ง" },
        { status: 400 }
      );
    }

    let note: string | null = null;
    if (typeof obj.note === "string" && obj.note.trim() !== "") {
      note = obj.note.trim().slice(0, 200);
    }

    const { start, end, iso } = dayRangeFromParam(dateStr);
    const summary = await computeDayCash(start, end, iso);
    const expectedNet = summary.totals.net;

    try {
      const closing = await prisma.cashClosing.create({
        data: {
          closeDate: start,
          scope: "ALL",
          expectedNet: new Prisma.Decimal(expectedNet.toFixed(2)),
          countedAmount: new Prisma.Decimal(counted.toFixed(2)),
          note,
          closedById: session.userId,
        },
      });

      await logAudit({
        userId: session.userId,
        action: AuditAction.CASH_CLOSE,
        detail:
          `ปิดยอดเงินสดวันที่ ${iso} — คาดว่า ${formatBaht(expectedNet)} บาท ` +
          `นับได้ ${formatBaht(counted)} บาท ` +
          `ผลต่าง ${formatBaht(counted - expectedNet)} บาท`,
      });

      return NextResponse.json({
        ok: true,
        closing: {
          id: closing.id,
          expectedNet,
          countedAmount: counted,
          diff: Math.round((counted - expectedNet) * 100) / 100,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return NextResponse.json(
          { error: "ยอดเงินสดของวันที่นี้ถูกปิดไปแล้ว — ปิดซ้ำไม่ได้ (ดูประวัติการปิดยอดด้านล่าง)" },
          { status: 409 }
        );
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[/api/cash-closing]", e);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
