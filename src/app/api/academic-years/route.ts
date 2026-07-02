/**
 * API ปีการศึกษา — ADMIN เท่านั้น
 *
 * GET -> รายการปีการศึกษาทั้งหมด (ใหม่ -> เก่า) พร้อมสถานะ จำนวนห้อง จำนวนบัญชี ยอดรวม
 *
 * การปิดปี + เปิดปีใหม่อยู่ที่ POST /api/academic-years/close (ไฟล์ close/route.ts)
 */
import { NextResponse } from "next/server";
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function errorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("api/academic-years:", e);
  return NextResponse.json(
    { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
    { status: 500 }
  );
}

export async function GET() {
  try {
    await requireRoleApi(["ADMIN"]);

    const [years, balances] = await Promise.all([
      prisma.academicYear.findMany({
        orderBy: { year: "desc" },
        include: { _count: { select: { classrooms: true, accounts: true } } },
      }),
      prisma.account.groupBy({
        by: ["academicYearId"],
        _sum: { balance: true },
      }),
    ]);

    const balanceByYearId = new Map(
      balances.map((b) => [b.academicYearId, Number(b._sum.balance ?? 0)])
    );

    return NextResponse.json({
      years: years.map((y) => ({
        id: y.id,
        year: y.year,
        isActive: y.isActive,
        openedAt: y.openedAt.toISOString(),
        closedAt: y.closedAt ? y.closedAt.toISOString() : null,
        classroomCount: y._count.classrooms,
        accountCount: y._count.accounts,
        totalBalance: balanceByYearId.get(y.id) ?? 0,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
