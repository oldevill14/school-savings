/**
 * แจ้งเตือนผู้ปกครองผ่าน LINE (Messaging API)
 *
 * ใช้ได้เฉพาะฝั่ง server — ห้าม import จาก client component (แตะ prisma + env)
 *
 * พฤติกรรม:
 * - ไม่ตั้ง env `LINE_CHANNEL_ACCESS_TOKEN` = no-op เงียบๆ (ฟีเจอร์ปิด)
 * - ถ้าตั้งแล้ว: หา User ที่เป็น Guardian ของ studentIds และมี lineUserId
 *   แล้ว push ข้อความสรุปฝาก-ถอน/ยอดคงเหลือใหม่ ผ่าน LINE multicast
 *
 * หลักการเดียวกับ audit: fire-and-forget — ห้าม throw ให้ธุรกรรมหลักล้ม
 * เรียกแบบ `void notifyGuardiansOfTransaction(...)` หลัง commit ธุรกรรมสำเร็จ
 * มี timeout สั้น (กัน network ค้างลากธุรกรรม/response ช้า)
 */
import { prisma } from "@/lib/db";
import { formatThaiDate } from "@/lib/thai-date";

/** สรุปธุรกรรมสำหรับส่งข้อความแจ้งเตือน (ค่าเงินเป็น string ที่ format แล้ว เช่น "1,234.50") */
export type TransactionNotifySummary = {
  type: "DEPOSIT" | "WITHDRAW";
  /** จำนวนเงินของรายการ (format แล้ว) */
  amount: string;
  /** ยอดคงเหลือหลังทำรายการ (format แล้ว) */
  balanceAfter: string;
  /** วันที่ทำรายการ */
  txnDate: Date | string;
  /** ชื่อนักเรียน (ถ้ามี) — ใช้ขึ้นต้นข้อความ */
  studentName?: string;
};

/** ปลายทาง LINE Messaging API — ส่งข้อความหาผู้ใช้หลายคนพร้อมกัน */
const LINE_MULTICAST_URL = "https://api.line.me/v2/bot/message/multicast";
/** timeout สั้นสำหรับเรียก LINE (ms) — ยิงแบบ fire-and-forget จึงไม่รอนาน */
const LINE_TIMEOUT_MS = 4000;

/** ประกอบข้อความไทยสรุปธุรกรรม 1 รายการ */
function buildTransactionMessage(summary: TransactionNotifySummary): string {
  const isDeposit = summary.type === "DEPOSIT";
  const icon = isDeposit ? "💰" : "💸";
  const action = isDeposit ? "ฝากเงิน" : "ถอนเงิน";

  const lines = [
    `${icon} แจ้งเตือนบัญชีออมทรัพย์`,
    summary.studentName ? `นักเรียน: ${summary.studentName}` : null,
    `รายการ: ${action} ${summary.amount} บาท`,
    `ยอดคงเหลือ: ${summary.balanceAfter} บาท`,
    `วันที่: ${formatThaiDate(summary.txnDate)}`,
  ].filter((l): l is string => l !== null);

  return lines.join("\n");
}

/**
 * แจ้งเตือนผู้ปกครองของนักเรียน (ตาม studentIds) ว่ามีธุรกรรมเกิดขึ้น
 *
 * @param studentIds cuid ของนักเรียนที่เกี่ยวข้อง (ผู้ปกครองหาได้จากตาราง Guardian)
 * @param summary    สรุปธุรกรรมสำหรับข้อความ
 */
export async function notifyGuardiansOfTransaction(
  studentIds: string[],
  summary: TransactionNotifySummary
): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return; // ยังไม่ตั้ง token = ปิดฟีเจอร์แจ้งเตือน (no-op)
  if (!studentIds || studentIds.length === 0) return;

  try {
    // หา lineUserId ของผู้ปกครองทุกคนที่ผูกกับนักเรียนเหล่านี้ (เฉพาะที่ผูก LINE แล้ว)
    const guardians = await prisma.guardian.findMany({
      where: {
        studentId: { in: studentIds },
        user: { lineUserId: { not: null } },
      },
      select: { user: { select: { lineUserId: true } } },
    });

    // unique (นักเรียนหลายคนอาจมีผู้ปกครองคนเดียวกัน)
    const to = Array.from(
      new Set(
        guardians
          .map((g) => g.user.lineUserId)
          .filter((id): id is string => !!id)
      )
    );
    if (to.length === 0) return;

    const text = buildTransactionMessage(summary);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LINE_TIMEOUT_MS);
    try {
      await fetch(LINE_MULTICAST_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    // fire-and-forget: การแจ้งเตือนล้มเหลวห้ามกระทบธุรกรรมหลัก
    console.error("notifyGuardiansOfTransaction ล้มเหลว (ข้ามไป):", e);
  }
}
