/**
 * Utilities จัดการวันที่แบบไทย (พ.ศ.)
 */

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const THAI_MONTHS_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

type DateInput = Date | string | number;

function toDate(value: DateInput): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ปี พ.ศ. ของวันที่ (ค.ศ. + 543) */
export function toBuddhistYear(value: DateInput): number {
  const d = toDate(value);
  return d ? d.getFullYear() + 543 : 0;
}

/** วันที่แบบย่อ พ.ศ. — เช่น "2 ก.ค. 2569" (parse ไม่ได้คืน "-") */
export function formatThaiDate(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "-";
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/** วันที่แบบเต็ม พ.ศ. — เช่น "2 กรกฎาคม 2569" */
export function formatThaiDateFull(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "-";
  return `${d.getDate()} ${THAI_MONTHS_FULL[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/** วันที่ + เวลา — เช่น "2 ก.ค. 2569 14:30 น." */
export function formatThaiDateTime(value: DateInput): string {
  const d = toDate(value);
  if (!d) return "-";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatThaiDate(d)} ${hh}:${mm} น.`;
}
