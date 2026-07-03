/**
 * interest-calc — คำนวณดอกเบี้ยรายบัญชี (ข้อ 7) — pure functions
 *
 * ไม่มี dependency ฝั่ง server/client — import ได้ทั้งจาก InterestForm (client)
 * และ /api/interest (server) เพื่อให้ตัวเลข preview กับที่บันทึกจริง "ตรงกันเสมอ"
 *
 * สูตร: ดอกเบี้ย = balance × rate% ปัดลงเป็นสตางค์ (floor ที่ทศนิยม 2 ตำแหน่ง)
 * คำนวณเป็นจำนวนเต็ม "สตางค์" เพื่อเลี่ยงความคลาดเคลื่อน floating point
 */

export type InterestAccountInput = {
  accountId: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  classroomName: string;
  /** ยอดคงเหลือปัจจุบัน (บาท) */
  balance: number;
};

export type InterestRow = InterestAccountInput & {
  /** ดอกเบี้ยที่จะได้รับ (บาท) — ปัดลงเป็นสตางค์ */
  interest: number;
};

/** ดอกเบี้ยของยอด balance ที่อัตรา ratePercent (%) — ปัดลงเป็นสตางค์ */
export function computeInterest(balance: number, ratePercent: number): number {
  if (!(balance > 0) || !(ratePercent > 0)) return 0;
  const balanceSatang = Math.round(balance * 100);
  // interest(สตางค์) = balanceSatang × rate / 100 แล้วปัดลง (+epsilon กัน 249.9999999)
  const interestSatang = Math.floor((balanceSatang * ratePercent) / 100 + 1e-6);
  return interestSatang / 100;
}

export type InterestPreview = {
  rows: InterestRow[];
  /** เฉพาะบัญชีที่ได้ดอกเบี้ย > 0 */
  payableRows: InterestRow[];
  totalInterest: number;
  payableCount: number;
};

/** สร้างตาราง preview ดอกเบี้ยจากรายการบัญชี + อัตรา */
export function buildInterestPreview(
  accounts: InterestAccountInput[],
  ratePercent: number
): InterestPreview {
  const rows: InterestRow[] = accounts.map((a) => ({
    ...a,
    interest: computeInterest(a.balance, ratePercent),
  }));
  const payableRows = rows.filter((r) => r.interest > 0);
  const totalSatang = payableRows.reduce(
    (sum, r) => sum + Math.round(r.interest * 100),
    0
  );
  return {
    rows,
    payableRows,
    totalInterest: totalSatang / 100,
    payableCount: payableRows.length,
  };
}
