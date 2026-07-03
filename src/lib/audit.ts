/**
 * Audit log — บันทึกการกระทำสำคัญลงตาราง AuditLog
 *
 * ใช้ได้เฉพาะฝั่ง server (แตะ prisma) — ห้าม import จาก client component
 *
 * หลักการ: logAudit เป็น "fire-and-forget" — ห้าม throw เด็ดขาด เพื่อไม่ให้การบันทึก
 * audit ล้มเหลวไปทำให้ธุรกรรมหลัก (เช่น การฝาก-ถอน) ล้มตาม
 * เรียกได้ทั้งแบบ `await logAudit(...)` หรือ `void logAudit(...)` — ไม่มีทางโยน error
 *
 * ตัวอย่าง:
 *   import { logAudit, AuditAction } from "@/lib/audit";
 *   await logAudit({ userId: session.userId, action: AuditAction.TXN_VOID, detail: `txn ${id}` });
 */
import { prisma } from "@/lib/db";

/** ค่าคงที่ของ action — ใช้ค่าจากที่นี่เสมอ (อย่าพิมพ์สตริงเอง กันสะกดเพี้ยน) */
export const AuditAction = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAIL: "LOGIN_FAIL",
  PASSWORD_CHANGE: "PASSWORD_CHANGE",
  PASSWORD_RESET: "PASSWORD_RESET",
  USER_DISABLE: "USER_DISABLE",
  USER_ENABLE: "USER_ENABLE",
  TXN_VOID: "TXN_VOID",
  YEAR_CLOSE: "YEAR_CLOSE",
  INTEREST_PAYOUT: "INTEREST_PAYOUT",
  CASH_CLOSE: "CASH_CLOSE",
  SETTINGS_UPDATE: "SETTINGS_UPDATE",
  LOGO_UPDATE: "LOGO_UPDATE",
  PHOTO_UPDATE: "PHOTO_UPDATE",
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

export type AuditEntry = {
  /** cuid ของผู้ใช้ที่ทำ action — null/undefined ได้ (เช่น LOGIN_FAIL ที่ยังไม่รู้ผู้ใช้) */
  userId?: string | null;
  /** ใช้ค่าจาก AuditAction (หรือสตริงอื่นก็ได้แต่แนะนำให้ใช้ค่าคงที่) */
  action: AuditActionType | string;
  /** รายละเอียดเพิ่มเติม (อ่านง่ายเป็นภาษาไทยได้) */
  detail?: string | null;
};

/**
 * บันทึก audit log 1 รายการ — ไม่มีทาง throw (error ถูกกลืนและ log ลง console เท่านั้น)
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        detail: entry.detail ?? null,
      },
    });
  } catch (e) {
    // fire-and-forget: ห้ามให้ audit ล้มเหลวไปกระทบธุรกรรมหลัก
    console.error("logAudit ล้มเหลว (ข้ามไป):", e);
  }
}
