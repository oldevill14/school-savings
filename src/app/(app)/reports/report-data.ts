/**
 * ชั้นข้อมูลรายงานสรุป (ใช้ร่วมกันระหว่างหน้า /reports/* และ /api/reports)
 *
 * หลักการสำคัญ: ตัวเลขทุกตัว "คำนวณจากธุรกรรมจริง" (Transaction ที่ status = NORMAL)
 * ไม่อ่านจาก Account.balance (denormalized cache) — เพื่อให้รายงานตรวจสอบย้อนหลังได้เสมอ
 *
 * ใช้ได้เฉพาะฝั่ง server (import prisma) — ห้าม import จาก client component
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const ZERO = new Prisma.Decimal(0);

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// ---------- month key utilities ("YYYY-MM" แบบ ค.ศ. ใช้ภายใน/URL — แสดงผลเป็น พ.ศ. ผ่าน monthLabel) ----------

/** คีย์เดือนของวันที่ เช่น "2026-07" */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** แปลงคีย์เดือน -> ขอบเขตวันที่ [start, next) — คืน null ถ้ารูปแบบผิด */
export function parseMonthKey(key: string): { start: Date; next: Date } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  return {
    start: new Date(year, month - 1, 1),
    next: new Date(year, month, 1),
  };
}

/** ป้ายเดือนแบบไทย พ.ศ. เช่น "2026-07" -> "ก.ค. 2569" (รูปแบบผิดคืน "-") */
export function monthLabel(key: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
  if (!m) return "-";
  return `${THAI_MONTHS_SHORT[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
}

/**
 * คีย์เดือนทั้ง 12 เดือนของปีการศึกษา (พ.ศ.) — พ.ค. ปีนั้น ถึง เม.ย. ปีถัดไป
 * เช่น 2569 -> ["2026-05", ..., "2027-04"]
 */
export function monthKeysForYear(yearBE: number): string[] {
  const startCE = yearBE - 543;
  const keys: string[] = [];
  for (let i = 0; i < 12; i++) {
    keys.push(monthKey(new Date(startCE, 4 + i, 1)));
  }
  return keys;
}

/** ช่วงเดือนเริ่มต้นของปีการศึกษา: พ.ค. -> เดือนปัจจุบัน (clamp ให้อยู่ในหน้าต่างปีนั้น) */
export function defaultRangeForYear(yearBE: number): { fromKey: string; toKey: string } {
  const keys = monthKeysForYear(yearBE);
  const nowKey = monthKey(new Date());
  let toKey: string;
  if (keys.includes(nowKey)) toKey = nowKey;
  else toKey = nowKey < keys[0] ? keys[0] : keys[keys.length - 1];
  return { fromKey: keys[0], toKey };
}

// ---------- ตัวช่วยรวมยอดจาก groupBy ----------

type GroupRow = {
  accountId: string;
  type: string; // "DEPOSIT" | "WITHDRAW"
  _sum: { amount: Prisma.Decimal | null };
};

function toSumMap(rows: GroupRow[]): Map<string, Prisma.Decimal> {
  const m = new Map<string, Prisma.Decimal>();
  for (const r of rows) m.set(`${r.accountId}:${r.type}`, r._sum.amount ?? ZERO);
  return m;
}

function sumOf(
  m: Map<string, Prisma.Decimal>,
  accountId: string,
  type: "DEPOSIT" | "WITHDRAW"
): Prisma.Decimal {
  return m.get(`${accountId}:${type}`) ?? ZERO;
}

// ---------- รายงานรายห้องเรียน ----------

export interface ClassroomReportRow {
  studentId: string;
  studentCode: string;
  fullName: string;
  studentStatus: "ACTIVE" | "GRADUATED" | "MOVED";
  hasAccount: boolean;
  /** ยอดยกมา ณ ต้นช่วง = openingBalance + ฝาก - ถอน (NORMAL) ก่อนเดือนเริ่ม */
  carry: string;
  /** รวมฝากในช่วง (NORMAL) */
  deposit: string;
  /** รวมถอนในช่วง (NORMAL) */
  withdraw: string;
  /** คงเหลือ ณ สิ้นช่วง = carry + deposit - withdraw */
  closing: string;
}

export interface ClassroomReport {
  classroom: { id: string; name: string };
  academicYear: number; // พ.ศ.
  teacherName: string | null;
  fromKey: string;
  toKey: string;
  fromLabel: string;
  toLabel: string;
  rows: ClassroomReportRow[];
  totals: { carry: string; deposit: string; withdraw: string; closing: string };
  studentCount: number;
}

/**
 * สร้างรายงานรายห้องเรียนจากธุรกรรมจริง (status NORMAL เท่านั้น)
 * - fromKey/toKey ไม่ส่งมา หรืออยู่นอกหน้าต่างปีการศึกษาของห้อง -> ใช้ค่าเริ่มต้น (พ.ค. -> เดือนปัจจุบัน)
 * - ถ้า from > to จะสลับให้อัตโนมัติ
 * - คืน null ถ้าไม่พบห้องเรียน
 *
 * หมายเหตุ: ผู้เรียกต้องเช็คสิทธิ์เอง (TEACHER ดูได้เฉพาะห้องที่ตนเป็นครูประจำชั้น)
 */
export async function buildClassroomReport(
  classroomId: string,
  opts: { fromKey?: string | null; toKey?: string | null } = {}
): Promise<ClassroomReport | null> {
  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
    include: {
      academicYear: { select: { year: true } },
      teacher: { select: { name: true } },
    },
  });
  if (!classroom) return null;

  const yearBE = classroom.academicYear.year;
  const windowKeys = monthKeysForYear(yearBE);
  const defaults = defaultRangeForYear(yearBE);

  let fromKey =
    opts.fromKey && windowKeys.includes(opts.fromKey) ? opts.fromKey : defaults.fromKey;
  let toKey = opts.toKey && windowKeys.includes(opts.toKey) ? opts.toKey : defaults.toKey;
  if (fromKey > toKey) [fromKey, toKey] = [toKey, fromKey];

  const fromDate = parseMonthKey(fromKey)!.start;
  const toExclusive = parseMonthKey(toKey)!.next;

  const students = await prisma.student.findMany({
    where: { classroomId: classroom.id },
    orderBy: { studentCode: "asc" },
    include: {
      accounts: {
        where: { academicYearId: classroom.academicYearId },
        select: { id: true, openingBalance: true },
      },
    },
  });

  const accountIds = students.flatMap((s) => s.accounts.map((a) => a.id));

  const [beforeRows, duringRows] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["accountId", "type"],
      where: {
        accountId: { in: accountIds },
        status: "NORMAL",
        txnDate: { lt: fromDate },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ["accountId", "type"],
      where: {
        accountId: { in: accountIds },
        status: "NORMAL",
        txnDate: { gte: fromDate, lt: toExclusive },
      },
      _sum: { amount: true },
    }),
  ]);

  const before = toSumMap(beforeRows);
  const during = toSumMap(duringRows);

  let totalCarry = ZERO;
  let totalDeposit = ZERO;
  let totalWithdraw = ZERO;

  const rows: ClassroomReportRow[] = students.map((s) => {
    const account = s.accounts[0] ?? null;

    let carry = ZERO;
    let deposit = ZERO;
    let withdraw = ZERO;
    if (account) {
      carry = account.openingBalance
        .plus(sumOf(before, account.id, "DEPOSIT"))
        .minus(sumOf(before, account.id, "WITHDRAW"));
      deposit = sumOf(during, account.id, "DEPOSIT");
      withdraw = sumOf(during, account.id, "WITHDRAW");
    }
    const closing = carry.plus(deposit).minus(withdraw);

    totalCarry = totalCarry.plus(carry);
    totalDeposit = totalDeposit.plus(deposit);
    totalWithdraw = totalWithdraw.plus(withdraw);

    return {
      studentId: s.id,
      studentCode: s.studentCode,
      fullName: `${s.firstName} ${s.lastName}`,
      studentStatus: s.status,
      hasAccount: account !== null,
      carry: carry.toFixed(2),
      deposit: deposit.toFixed(2),
      withdraw: withdraw.toFixed(2),
      closing: closing.toFixed(2),
    };
  });

  const totalClosing = totalCarry.plus(totalDeposit).minus(totalWithdraw);

  return {
    classroom: { id: classroom.id, name: classroom.name },
    academicYear: yearBE,
    teacherName: classroom.teacher?.name ?? null,
    fromKey,
    toKey,
    fromLabel: monthLabel(fromKey),
    toLabel: monthLabel(toKey),
    rows,
    totals: {
      carry: totalCarry.toFixed(2),
      deposit: totalDeposit.toFixed(2),
      withdraw: totalWithdraw.toFixed(2),
      closing: totalClosing.toFixed(2),
    },
    studentCount: students.length,
  };
}

// ---------- รายงานรายปีการศึกษา ----------

export interface YearlyClassroomRow {
  classroomId: string | null; // null = บัญชีที่นักเรียนไม่ได้อยู่ห้องของปีนี้แล้ว (ย้ายห้อง/ปีอื่น)
  name: string;
  teacherName: string | null;
  accountCount: number;
  opening: string;
  deposit: string;
  withdraw: string;
  /** คงเหลือรวม = opening + deposit - withdraw */
  closing: string;
}

export interface YearlyMonthRow {
  month: string; // "2026-05"
  label: string; // "พ.ค. 2569"
  deposit: string;
  withdraw: string;
  /** เปลี่ยนแปลงสุทธิ = deposit - withdraw */
  net: string;
}

export interface YearlyReport {
  year: number; // พ.ศ.
  isActive: boolean;
  classrooms: YearlyClassroomRow[];
  totals: {
    accountCount: number;
    opening: string;
    deposit: string;
    withdraw: string;
    closing: string;
    /** เปลี่ยนแปลงสุทธิทั้งปี = deposit - withdraw */
    net: string;
  };
  monthly: YearlyMonthRow[];
}

/**
 * สร้างรายงานสรุปทั้งโรงเรียนของปีการศึกษา (พ.ศ.) จากธุรกรรมจริง (status NORMAL เท่านั้น)
 * คืน null ถ้าไม่พบปีการศึกษานั้น
 */
export async function buildYearlyReport(yearBE: number): Promise<YearlyReport | null> {
  const yearRec = await prisma.academicYear.findUnique({ where: { year: yearBE } });
  if (!yearRec) return null;

  const [classrooms, accounts, sumRows, txns] = await Promise.all([
    prisma.classroom.findMany({
      where: { academicYearId: yearRec.id },
      orderBy: { name: "asc" },
      include: { teacher: { select: { name: true } } },
    }),
    prisma.account.findMany({
      where: { academicYearId: yearRec.id },
      select: {
        id: true,
        openingBalance: true,
        student: { select: { classroomId: true } },
      },
    }),
    prisma.transaction.groupBy({
      by: ["accountId", "type"],
      where: { status: "NORMAL", account: { academicYearId: yearRec.id } },
      _sum: { amount: true },
    }),
    // สำหรับสรุปรายเดือน (Prisma groupBy จัดกลุ่มตามเดือนไม่ได้ — ลดรูปใน JS)
    prisma.transaction.findMany({
      where: { status: "NORMAL", account: { academicYearId: yearRec.id } },
      select: { type: true, amount: true, txnDate: true },
    }),
  ]);

  const accountToClassroom = new Map<string, string>();
  for (const a of accounts) accountToClassroom.set(a.id, a.student.classroomId);

  // ---------- รวมยอดรายห้อง ----------
  interface Bucket {
    accountCount: number;
    opening: Prisma.Decimal;
    deposit: Prisma.Decimal;
    withdraw: Prisma.Decimal;
  }
  const newBucket = (): Bucket => ({
    accountCount: 0,
    opening: ZERO,
    deposit: ZERO,
    withdraw: ZERO,
  });

  const byClassroom = new Map<string, Bucket>();
  for (const c of classrooms) byClassroom.set(c.id, newBucket());
  // บัญชีของนักเรียนที่ classroom ปัจจุบันไม่ใช่ห้องของปีนี้ (เช่น ดูปีเก่าหลังเลื่อนชั้น)
  const orphanBucket = newBucket();

  const bucketFor = (accountId: string): Bucket => {
    const cid = accountToClassroom.get(accountId);
    return (cid && byClassroom.get(cid)) || orphanBucket;
  };

  for (const a of accounts) {
    const b = bucketFor(a.id);
    b.accountCount += 1;
    b.opening = b.opening.plus(a.openingBalance);
  }
  for (const g of sumRows) {
    const b = bucketFor(g.accountId);
    const amount = g._sum.amount ?? ZERO;
    if (g.type === "DEPOSIT") b.deposit = b.deposit.plus(amount);
    else b.withdraw = b.withdraw.plus(amount);
  }

  const toRow = (
    classroomId: string | null,
    name: string,
    teacherName: string | null,
    b: Bucket
  ): YearlyClassroomRow => ({
    classroomId,
    name,
    teacherName,
    accountCount: b.accountCount,
    opening: b.opening.toFixed(2),
    deposit: b.deposit.toFixed(2),
    withdraw: b.withdraw.toFixed(2),
    closing: b.opening.plus(b.deposit).minus(b.withdraw).toFixed(2),
  });

  const classroomRows: YearlyClassroomRow[] = classrooms.map((c) =>
    toRow(c.id, c.name, c.teacher?.name ?? null, byClassroom.get(c.id)!)
  );
  if (orphanBucket.accountCount > 0) {
    classroomRows.push(toRow(null, "ไม่ระบุห้อง (ย้ายห้อง/ปีอื่น)", null, orphanBucket));
  }

  // ---------- รวมทั้งโรงเรียน (จาก accounts + sums โดยตรง ครอบคลุมทุกบัญชี) ----------
  let totalOpening = ZERO;
  for (const a of accounts) totalOpening = totalOpening.plus(a.openingBalance);
  let totalDeposit = ZERO;
  let totalWithdraw = ZERO;
  for (const g of sumRows) {
    const amount = g._sum.amount ?? ZERO;
    if (g.type === "DEPOSIT") totalDeposit = totalDeposit.plus(amount);
    else totalWithdraw = totalWithdraw.plus(amount);
  }

  // ---------- สรุปรายเดือน ----------
  const byMonth = new Map<string, { deposit: Prisma.Decimal; withdraw: Prisma.Decimal }>();
  for (const t of txns) {
    const key = monthKey(t.txnDate);
    const slot = byMonth.get(key) ?? { deposit: ZERO, withdraw: ZERO };
    if (t.type === "DEPOSIT") slot.deposit = slot.deposit.plus(t.amount);
    else slot.withdraw = slot.withdraw.plus(t.amount);
    byMonth.set(key, slot);
  }

  const nowKey = monthKey(new Date());
  const windowKeys = monthKeysForYear(yearBE);
  const allKeys = Array.from(new Set([...windowKeys, ...byMonth.keys()])).sort();
  const monthly: YearlyMonthRow[] = allKeys
    // แสดงเดือนที่ผ่านมาแล้วของปีนั้น + เดือนใดก็ตามที่มีข้อมูล (ตัดเดือนอนาคตที่ว่างออก)
    .filter((key) => byMonth.has(key) || key <= nowKey)
    .map((key) => {
      const slot = byMonth.get(key) ?? { deposit: ZERO, withdraw: ZERO };
      return {
        month: key,
        label: monthLabel(key),
        deposit: slot.deposit.toFixed(2),
        withdraw: slot.withdraw.toFixed(2),
        net: slot.deposit.minus(slot.withdraw).toFixed(2),
      };
    });

  return {
    year: yearBE,
    isActive: yearRec.isActive,
    classrooms: classroomRows,
    totals: {
      accountCount: accounts.length,
      opening: totalOpening.toFixed(2),
      deposit: totalDeposit.toFixed(2),
      withdraw: totalWithdraw.toFixed(2),
      closing: totalOpening.plus(totalDeposit).minus(totalWithdraw).toFixed(2),
      net: totalDeposit.minus(totalWithdraw).toFixed(2),
    },
    monthly,
  };
}
