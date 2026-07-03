/**
 * API ผูก/ถอด ผู้ปกครอง <-> นักเรียน (ตาราง Guardian) — ADMIN เท่านั้น
 *
 * POST   { userId, studentId } -> ผูกนักเรียนเพิ่มให้ผู้ปกครอง (ผูกซ้ำ = no-op คืน already:true)
 * DELETE { userId, studentId } -> ถอดการผูก (ถอดครบทุกคนได้ — ผู้ปกครองจะเห็นหน้า "ยังไม่ผูก")
 *
 * หลักการ "ไม่มีอะไรถูกลบ" ใช้กับ "ธุรกรรม/ผู้ใช้" — ความสัมพันธ์ Guardian เป็น mapping
 * ที่ปรับได้ (ถอดแล้วประวัติธุรกรรม/บัญชีของนักเรียนยังอยู่ครบ ไม่มีข้อมูลการเงินหาย)
 *
 * session ของผู้ปกครองอ่าน studentIds จากตาราง Guardian สดทุกครั้ง (getSession) —
 * เพิ่ม/ถอดที่นี่จึงมีผลกับสิทธิ์การเข้าถึงของผู้ปกครองทันทีในคำขอถัดไป
 */
import { NextResponse } from "next/server";
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function errorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("api/guardians:", e);
  return NextResponse.json(
    { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
    { status: 500 }
  );
}

/** อ่าน userId/studentId จาก body — คืน null ถ้าไม่ครบ */
async function readPair(
  req: Request
): Promise<{ userId: string; studentId: string } | null> {
  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const studentId = typeof body?.studentId === "string" ? body.studentId.trim() : "";
  if (!userId || !studentId) return null;
  return { userId, studentId };
}

export async function POST(req: Request) {
  try {
    await requireRoleApi(["ADMIN"]);

    const pair = await readPair(req);
    if (!pair) {
      return NextResponse.json(
        { error: "ต้องระบุผู้ใช้และนักเรียนที่จะผูก" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: pair.userId } });
    if (!user) {
      return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 404 });
    }
    if (user.role !== "PARENT") {
      return NextResponse.json(
        { error: "ผูกนักเรียนได้เฉพาะบัญชีผู้ปกครองเท่านั้น" },
        { status: 400 }
      );
    }

    const student = await prisma.student.findUnique({ where: { id: pair.studentId } });
    if (!student) {
      return NextResponse.json({ error: "ไม่พบนักเรียนที่เลือก" }, { status: 400 });
    }

    const existing = await prisma.guardian.findUnique({
      where: { userId_studentId: { userId: pair.userId, studentId: pair.studentId } },
    });
    if (existing) {
      return NextResponse.json({ ok: true, already: true });
    }

    await prisma.guardian.create({
      data: { userId: pair.userId, studentId: pair.studentId },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireRoleApi(["ADMIN"]);

    const pair = await readPair(req);
    if (!pair) {
      return NextResponse.json(
        { error: "ต้องระบุผู้ใช้และนักเรียนที่จะถอด" },
        { status: 400 }
      );
    }

    // deleteMany = ไม่ throw แม้ไม่มีแถว (idempotent)
    await prisma.guardian.deleteMany({
      where: { userId: pair.userId, studentId: pair.studentId },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
