/**
 * GET /api/stats — สถิติแดชบอร์ดตามขอบเขตของผู้ใช้ (ADMIN = ทั้งโรงเรียน, TEACHER = ห้องตนเอง)
 *
 * ตอบ 200 เสมอเมื่อ auth ผ่าน — ถ้ายังไม่มีปีการศึกษาที่ active จะคืน academicYear: null
 * พร้อมค่าศูนย์ทั้งหมด (ผู้เรียกไม่ต้องแยก handle 404)
 *
 * รูปแบบคำตอบ:
 * {
 *   academicYear: number | null,        // ปี พ.ศ. เช่น 2569
 *   totalBalance: number,               // ยอดเงินรวมคงเหลือของบัญชีในขอบเขต
 *   todayDeposit: number,  todayDepositCount: number,
 *   todayWithdraw: number, todayWithdrawCount: number,
 *   accountCount: number,
 *   monthly: { month: string; deposit: number; withdraw: number }[]  // 12 เดือน พ.ค.–เม.ย. (หน้าต่างปีการศึกษา)
 * }
 *
 * ตัวเลขทั้งหมดนับเฉพาะธุรกรรมสถานะ NORMAL (ไม่รวม VOIDED)
 */
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { AuthError, requireRoleApi } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// ลำดับเดือนตามปีการศึกษา: พ.ค. → เม.ย. (สอดคล้อง monthKeysForYear ใน reports/report-data.ts)
const ACADEMIC_MONTHS_SHORT = [
  ...THAI_MONTHS_SHORT.slice(4),
  ...THAI_MONTHS_SHORT.slice(0, 4),
];

export async function GET() {
  try {
    const session = await requireRoleApi(["ADMIN", "TEACHER"]);

    const activeYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
    });

    if (!activeYear) {
      return NextResponse.json({
        academicYear: null,
        totalBalance: 0,
        todayDeposit: 0,
        todayDepositCount: 0,
        todayWithdraw: 0,
        todayWithdrawCount: 0,
        accountCount: 0,
        monthly: ACADEMIC_MONTHS_SHORT.map((month) => ({
          month,
          deposit: 0,
          withdraw: 0,
        })),
      });
    }

    // ขอบเขตบัญชี: ADMIN = ทุกบัญชีของปี active, TEACHER = เฉพาะห้องที่ตนประจำชั้นในปี active
    const accountWhere: Prisma.AccountWhereInput = {
      academicYearId: activeYear.id,
      ...(session.role === "TEACHER"
        ? {
            student: {
              classroom: {
                teacherId: session.userId,
                academicYearId: activeYear.id,
              },
            },
          }
        : {}),
    };

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    // หน้าต่างปีการศึกษา (พ.ค. ปีนั้น – เม.ย. ปีถัดไป) สำหรับสรุปรายเดือน
    // ให้ตรงกับตารางรายเดือนของ /reports/yearly (monthKeysForYear ใน report-data.ts)
    const chartYear = activeYear.year - 543;
    const yearStart = new Date(chartYear, 4, 1);
    const yearEnd = new Date(chartYear + 1, 4, 1);

    const [balanceAgg, accountCount, depositAgg, withdrawAgg, yearTxns] =
      await Promise.all([
        prisma.account.aggregate({ where: accountWhere, _sum: { balance: true } }),
        prisma.account.count({ where: accountWhere }),
        prisma.transaction.aggregate({
          where: {
            type: "DEPOSIT",
            status: "NORMAL",
            txnDate: { gte: startOfToday, lt: startOfTomorrow },
            account: accountWhere,
          },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.transaction.aggregate({
          where: {
            type: "WITHDRAW",
            status: "NORMAL",
            txnDate: { gte: startOfToday, lt: startOfTomorrow },
            account: accountWhere,
          },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.transaction.findMany({
          where: {
            status: "NORMAL",
            txnDate: { gte: yearStart, lt: yearEnd },
            account: accountWhere,
          },
          select: { type: true, amount: true, txnDate: true },
        }),
      ]);

    const monthly = ACADEMIC_MONTHS_SHORT.map((month) => ({
      month,
      deposit: 0,
      withdraw: 0,
    }));
    for (const t of yearTxns) {
      // bucket ตามลำดับปีการศึกษา: พ.ค. = 0 ... เม.ย. = 11
      const idx = (t.txnDate.getMonth() + 12 - 4) % 12;
      const amount = t.amount.toNumber();
      if (t.type === "DEPOSIT") monthly[idx].deposit += amount;
      else monthly[idx].withdraw += amount;
    }
    for (const point of monthly) {
      point.deposit = Math.round(point.deposit * 100) / 100;
      point.withdraw = Math.round(point.withdraw * 100) / 100;
    }

    return NextResponse.json({
      academicYear: activeYear.year,
      totalBalance: Number(balanceAgg._sum.balance ?? 0),
      todayDeposit: Number(depositAgg._sum.amount ?? 0),
      todayDepositCount: depositAgg._count._all,
      todayWithdraw: Number(withdrawAgg._sum.amount ?? 0),
      todayWithdrawCount: withdrawAgg._count._all,
      accountCount,
      monthly,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/stats ล้มเหลว:", e);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
