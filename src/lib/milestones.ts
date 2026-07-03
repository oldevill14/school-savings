/**
 * การวิเคราะห์การออมรายคน — ตราสัญลักษณ์นักออม (milestones) + ชุดข้อมูลกราฟยอดสะสมรายเดือน
 *
 * โมดูลนี้ "บริสุทธิ์" (pure) — ไม่ import prisma / next / lucide / client-only ใดๆ
 * จึงเรียกได้ทั้งจาก Server Component และ Client Component
 * (SavingsTrendChart ฝั่ง client ใช้เฉพาะ type SavingsTrendPoint — type ถูก erase ตอน build)
 *
 * คำนวณด้วยหน่วย "สตางค์" (integer) เพื่อเลี่ยง floating point เหมือนหน้า /passbook
 * (Prisma Decimal ให้แปลงเป็น number ก่อนส่งเข้ามา — ดู MilestoneTxn.amount)
 */

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/** ธุรกรรมรูปแบบย่อ (serializable) ที่ใช้คำนวณ — map มาจาก Prisma Transaction */
export type MilestoneTxn = {
  type: "DEPOSIT" | "WITHDRAW";
  status: "NORMAL" | "VOIDED";
  /** วันที่ทำรายการ — Date หรือ ISO string */
  txnDate: string | Date;
  /** จำนวนเงิน (บาท) — number หรือ string (แปลงจาก Prisma Decimal มาก่อน) */
  amount: number | string;
};

export type MilestoneKind = "balance" | "streak";

export interface Milestone {
  /** คีย์ไม่ซ้ำ เช่น "balance-1000", "streak-4" */
  key: string;
  kind: MilestoneKind;
  /** เกณฑ์ — บาท (balance) หรือ จำนวนสัปดาห์ (streak) */
  threshold: number;
  label: string;
  description: string;
  achieved: boolean;
}

export interface MilestoneSummary {
  /** ตราทั้งหมด (ทั้งที่ปลดล็อกแล้วและยัง) เรียงตามลำดับ */
  milestones: Milestone[];
  /** เฉพาะตราที่ปลดล็อกแล้ว */
  achieved: Milestone[];
  achievedCount: number;
  /** ยอดสะสมสูงสุดที่เคยแตะ (บาท) — ใช้ตัดสินตรา balance (ปลดล็อกแล้วไม่หลุด) */
  peakBalance: number;
  /** ยอดคงเหลือปัจจุบัน (บาท) */
  currentBalance: number;
  /** สัปดาห์ที่ฝากต่อเนื่องยาวที่สุด */
  longestStreakWeeks: number;
  /** เป้าหมายยอดถัดไปที่ยังไม่ถึง (บาท) — null ถ้าครบทุกขั้น */
  nextBalanceTarget: number | null;
}

/** เกณฑ์ยอดสะสม (บาท) และจำนวนสัปดาห์ต่อเนื่อง */
export const BALANCE_TIERS = [100, 500, 1000, 5000] as const;
export const STREAK_TIERS = [4, 8, 12] as const;

const BALANCE_LABELS: Record<number, string> = {
  100: "นักออมหน้าใหม่",
  500: "ออมสม่ำเสมอ",
  1000: "นักออมพันบาท",
  5000: "สุดยอดนักออม",
};

function toSatang(v: number | string): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

/** ดัชนีสัปดาห์แบบเริ่มวันจันทร์ นับจาก epoch (deterministic, ใช้เวลา UTC) */
function mondayWeekIndex(d: Date): number {
  const MS_PER_DAY = 86_400_000;
  const dayNum = Math.floor(d.getTime() / MS_PER_DAY); // จำนวนวันนับจาก 1970-01-01 (พฤหัส)
  // +3 เลื่อนให้สัปดาห์เริ่มวันจันทร์ (พฤหัส -> ตกในสัปดาห์ของวันจันทร์ก่อนหน้า)
  return Math.floor((dayNum + 3) / 7);
}

function fmtInt(n: number): string {
  return n.toLocaleString("th-TH");
}

/**
 * คำนวณตราสัญลักษณ์นักออมจากธุรกรรมของบัญชี 1 ใบ
 *
 * - ตรา balance ตัดสินจาก "ยอดสะสมสูงสุดที่เคยแตะ" (peak) — ปลดล็อกแล้วไม่หลุดแม้ถอนออก
 * - ตรา streak ตัดสินจากจำนวนสัปดาห์ที่มีการฝากติดต่อกันยาวที่สุด (สถานะปกติเท่านั้น)
 *
 * ยอดยกมา (opening) คำนวณย้อนจาก balance ปัจจุบัน - ผลรวมสุทธิของธุรกรรมปกติ
 * จึงไม่ต้องรับ openingBalance แยก และยังตรงกับค่า denormalized เสมอ
 */
export function computeMilestones(input: {
  balance: number;
  transactions: MilestoneTxn[];
}): MilestoneSummary {
  const currentBalanceSatang = toSatang(input.balance);
  const normal = input.transactions.filter((t) => t.status === "NORMAL");

  // opening = current - net(deposit - withdraw)
  let netSatang = 0;
  for (const t of normal) {
    netSatang += (t.type === "DEPOSIT" ? 1 : -1) * toSatang(t.amount);
  }
  const openingSatang = currentBalanceSatang - netSatang;

  // ยอดสะสมสูงสุด (peak running balance) — ไล่ตามเวลา
  const sorted = [...normal].sort(
    (a, b) => toDate(a.txnDate).getTime() - toDate(b.txnDate).getTime()
  );
  let running = openingSatang;
  let peak = openingSatang;
  for (const t of sorted) {
    running += (t.type === "DEPOSIT" ? 1 : -1) * toSatang(t.amount);
    if (running > peak) peak = running;
  }

  // สัปดาห์ที่ฝากต่อเนื่องยาวที่สุด
  const weekSet = new Set<number>();
  for (const t of normal) {
    if (t.type === "DEPOSIT") weekSet.add(mondayWeekIndex(toDate(t.txnDate)));
  }
  const weeks = [...weekSet].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const w of weeks) {
    run = prev !== null && w === prev + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = w;
  }

  const milestones: Milestone[] = [];
  for (const tier of BALANCE_TIERS) {
    milestones.push({
      key: `balance-${tier}`,
      kind: "balance",
      threshold: tier,
      label: BALANCE_LABELS[tier] ?? `ยอดออม ${fmtInt(tier)} บาท`,
      description: `มียอดเงินออมสะสมถึง ${fmtInt(tier)} บาท`,
      achieved: peak >= tier * 100,
    });
  }
  for (const tier of STREAK_TIERS) {
    milestones.push({
      key: `streak-${tier}`,
      kind: "streak",
      threshold: tier,
      label: `ออมต่อเนื่อง ${tier} สัปดาห์`,
      description: `ฝากเงินติดต่อกันอย่างน้อย ${tier} สัปดาห์`,
      achieved: longest >= tier,
    });
  }

  const achieved = milestones.filter((m) => m.achieved);
  const nextTarget = BALANCE_TIERS.find((tier) => peak < tier * 100) ?? null;

  return {
    milestones,
    achieved,
    achievedCount: achieved.length,
    peakBalance: peak / 100,
    currentBalance: currentBalanceSatang / 100,
    longestStreakWeeks: longest,
    nextBalanceTarget: nextTarget,
  };
}

// ---------- กราฟยอดสะสมรายเดือน ----------

/** จุดข้อมูล 1 เดือนของกราฟยอดสะสม */
export interface SavingsTrendPoint {
  /** คีย์ไม่ซ้ำ เช่น "2569-6" (พ.ศ.-เดือน 0..11) */
  key: string;
  /** ป้ายแกน X เช่น "ก.ค. 69" */
  label: string;
  /** ยอดคงเหลือ ณ สิ้นเดือน (บาท, เฉพาะธุรกรรมปกติ) */
  balance: number;
}

/**
 * สร้างชุดข้อมูลกราฟ "ยอดสะสมรายเดือน" — ยอดคงเหลือสะสม ณ สิ้นเดือน ไล่จากเดือนแรก
 * ที่มีธุรกรรมถึงเดือนล่าสุด (เดือนที่ไม่มีรายการจะยกยอดเดือนก่อนมาแสดงต่อ)
 *
 * คืน [] ถ้าไม่มีธุรกรรมปกติ (หน้าเรียกควรซ่อนกราฟเมื่อจุดข้อมูล < 2)
 */
export function buildSavingsTrend(
  openingBalance: number,
  transactions: MilestoneTxn[]
): SavingsTrendPoint[] {
  const normal = transactions
    .filter((t) => t.status === "NORMAL")
    .map((t) => ({
      d: toDate(t.txnDate),
      sat: (t.type === "DEPOSIT" ? 1 : -1) * toSatang(t.amount),
    }))
    .sort((a, b) => a.d.getTime() - b.d.getTime());
  if (normal.length === 0) return [];

  let running = toSatang(openingBalance);
  const points: SavingsTrendPoint[] = [];

  const first = normal[0].d;
  const last = normal[normal.length - 1].d;
  let cursor = new Date(first.getFullYear(), first.getMonth(), 1);
  const end = new Date(last.getFullYear(), last.getMonth(), 1);

  let i = 0;
  let guard = 0; // กันช่วงเวลาผิดปกติ (สูงสุด ~20 ปี)
  while (cursor.getTime() <= end.getTime() && guard < 240) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    while (
      i < normal.length &&
      normal[i].d.getFullYear() === y &&
      normal[i].d.getMonth() === m
    ) {
      running += normal[i].sat;
      i++;
    }
    const buddhistYear = y + 543;
    points.push({
      key: `${buddhistYear}-${m}`,
      label: `${THAI_MONTHS_SHORT[m]} ${String(buddhistYear % 100).padStart(2, "0")}`,
      balance: running / 100,
    });
    cursor = new Date(y, m + 1, 1);
    guard++;
  }
  return points;
}
