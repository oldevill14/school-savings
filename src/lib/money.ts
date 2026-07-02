/**
 * Utilities จัดการจำนวนเงิน (บาท)
 *
 * หมายเหตุ: Prisma Decimal ส่งข้าม boundary server -> client ไม่ได้
 * ให้แปลงเป็น string/number ก่อน — formatBaht รับได้ทั้ง number, string
 * และ object ที่มี toString() (เช่น Prisma.Decimal)
 */

type MoneyInput = number | string | { toString(): string };

/**
 * แปลงจำนวนเงินเป็นข้อความ "1,234.50" (ทศนิยม 2 ตำแหน่ง มี comma คั่นหลักพัน)
 * ค่าที่ parse ไม่ได้จะคืน "0.00"
 */
export function formatBaht(value: MoneyInput): string {
  const n = typeof value === "number" ? value : Number(value.toString());
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** เหมือน formatBaht แต่ต่อท้าย " บาท" — เช่น "1,234.50 บาท" */
export function formatBahtText(value: MoneyInput): string {
  return `${formatBaht(value)} บาท`;
}

/**
 * แปลง input จากผู้ใช้เป็นจำนวนเงิน (number)
 * - รับ "1,234.50", "1234.5", "50 บาท", " 20 " ฯลฯ
 * - คืน null ถ้าไม่ใช่ตัวเลขบวก หรือทศนิยมเกิน 2 ตำแหน่ง (จำนวนเงินต้อง > 0)
 */
export function parseBaht(input: string): number | null {
  const cleaned = input
    .replace(/[,\s฿]/g, "")
    .replace(/บาท$/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
