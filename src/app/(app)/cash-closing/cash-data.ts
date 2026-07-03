/**
 * cash-data — คำนวณสรุปเงินสดรายวัน (ข้อ 5)
 *
 * ใช้ได้เฉพาะฝั่ง server (แตะ prisma) — ห้าม import จาก client component
 * ใช้ร่วมกันระหว่างหน้า /cash-closing (แสดงผล) และ POST /api/cash-closing
 * (คำนวณ expectedNet ใหม่ฝั่ง server — ไม่เชื่อค่าจาก client)
 *
 * "เงินสดสุทธิที่ต้องนำส่ง" ของวัน = SUM(ฝาก NORMAL) - SUM(ถอน NORMAL) ของวันนั้น
 * แยกตามห้องเรียนปัจจุบันของนักเรียน (student.classroom)
 */
import { prisma } from "@/lib/db";

export type ClassroomCashRow = {
  classroomId: string;
  classroomName: string;
  year: number;
  depositCount: number;
  depositTotal: number;
  withdrawCount: number;
  withdrawTotal: number;
  net: number;
};

export type DayCashTotals = {
  depositCount: number;
  depositTotal: number;
  withdrawCount: number;
  withdrawTotal: number;
  net: number;
};

export type DayCashSummary = {
  start: Date;
  end: Date;
  iso: string;
  rows: ClassroomCashRow[];
  totals: DayCashTotals;
};

/** ปัดจำนวนเงินเป็นสตางค์ (กันเศษ floating point) */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** แปลง "YYYY-MM-DD" เป็นช่วงเวลา [start, end) ของวันนั้น (เวลาเครื่อง server) */
export function dayRangeFromParam(dateStr?: string): {
  start: Date;
  end: Date;
  iso: string;
} {
  let base: Date;
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(`${dateStr}T00:00:00.000`);
    base = Number.isNaN(d.getTime()) ? new Date() : d;
  } else {
    base = new Date();
  }
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const end = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
  const iso =
    `${start.getFullYear()}-` +
    `${String(start.getMonth() + 1).padStart(2, "0")}-` +
    `${String(start.getDate()).padStart(2, "0")}`;
  return { start, end, iso };
}

/**
 * คำนวณสรุปเงินสดของวัน (ช่วง [start, end)) แยกตามห้องเรียน
 * @param opts.classroomIds จำกัดเฉพาะห้องที่ระบุ (ใช้กับครูประจำชั้น) — undefined = ทุกห้อง
 */
export async function computeDayCash(
  start: Date,
  end: Date,
  iso: string,
  opts?: { classroomIds?: string[] }
): Promise<DayCashSummary> {
  // ถ้าระบุ classroomIds แต่เป็น array ว่าง = ไม่มีสิทธิ์เห็นห้องใด → คืนผลว่าง
  if (opts?.classroomIds && opts.classroomIds.length === 0) {
    return {
      start,
      end,
      iso,
      rows: [],
      totals: {
        depositCount: 0,
        depositTotal: 0,
        withdrawCount: 0,
        withdrawTotal: 0,
        net: 0,
      },
    };
  }

  const txns = await prisma.transaction.findMany({
    where: {
      status: "NORMAL",
      // เฉพาะธุรกรรมเงินสดจริงที่หน้าเคาน์เตอร์ — ดอกเบี้ย (category=INTEREST)
      // เป็นเครดิตทางบัญชี ไม่ได้เข้าลิ้นชักเงินสด จึงไม่นับในการปิดยอดเงินสดรายวัน
      category: "REGULAR",
      txnDate: { gte: start, lt: end },
      ...(opts?.classroomIds
        ? { account: { student: { classroomId: { in: opts.classroomIds } } } }
        : {}),
    },
    select: {
      type: true,
      amount: true,
      account: {
        select: {
          student: {
            select: {
              classroomId: true,
              classroom: {
                select: { name: true, academicYear: { select: { year: true } } },
              },
            },
          },
        },
      },
    },
  });

  const byRoom = new Map<string, ClassroomCashRow>();
  for (const t of txns) {
    const student = t.account.student;
    const key = student.classroomId;
    let row = byRoom.get(key);
    if (!row) {
      row = {
        classroomId: key,
        classroomName: student.classroom.name,
        year: student.classroom.academicYear.year,
        depositCount: 0,
        depositTotal: 0,
        withdrawCount: 0,
        withdrawTotal: 0,
        net: 0,
      };
      byRoom.set(key, row);
    }
    const amount = Number(t.amount);
    if (t.type === "DEPOSIT") {
      row.depositCount += 1;
      row.depositTotal += amount;
    } else {
      row.withdrawCount += 1;
      row.withdrawTotal += amount;
    }
  }

  const rows = [...byRoom.values()]
    .map((r) => ({
      ...r,
      depositTotal: round2(r.depositTotal),
      withdrawTotal: round2(r.withdrawTotal),
      net: round2(r.depositTotal - r.withdrawTotal),
    }))
    .sort((a, b) => a.classroomName.localeCompare(b.classroomName, "th"));

  const totals: DayCashTotals = rows.reduce(
    (acc, r) => ({
      depositCount: acc.depositCount + r.depositCount,
      depositTotal: round2(acc.depositTotal + r.depositTotal),
      withdrawCount: acc.withdrawCount + r.withdrawCount,
      withdrawTotal: round2(acc.withdrawTotal + r.withdrawTotal),
      net: round2(acc.net + r.net),
    }),
    { depositCount: 0, depositTotal: 0, withdrawCount: 0, withdrawTotal: 0, net: 0 }
  );

  return { start, end, iso, rows, totals };
}
