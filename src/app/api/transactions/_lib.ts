/**
 * Logic กลางของธุรกรรมฝาก-ถอน — ใช้ร่วมกันระหว่าง
 * POST /api/transactions (รายคน) และ POST /api/transactions/batch (ทั้งห้อง)
 * รวมถึงการยกเลิกรายการ (VOID) โดย admin
 *
 * ไฟล์นี้ไม่ใช่ route (ขึ้นต้นด้วย _ และไม่ใช่ route.ts) — Next.js จะไม่ route ให้
 * เหตุที่แยกไฟล์: route.ts ห้าม export อย่างอื่นนอกจาก HTTP method handlers
 *
 * หลักการบัญชีที่ต้องรักษาเสมอ (ดู CONTRACTS.md ข้อ 2):
 *   balance = openingBalance + SUM(DEPOSIT, NORMAL) - SUM(WITHDRAW, NORMAL)
 * - เขียนธุรกรรม + อัปเดต balance ใน prisma.$transaction() เดียวเสมอ
 * - ห้าม balance ติดลบ — ใช้ updateMany แบบมีเงื่อนไข (balance >= amount)
 *   เพื่อกัน race condition ระหว่าง request พร้อมกัน
 * - ธุรกรรมห้ามลบ — ยกเลิกด้วย status=VOIDED + คืนยอดเท่านั้น
 */
import { Prisma, type Student } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import type { SessionPayload } from "@/lib/auth";

/** จำนวนเงินสูงสุดต่อรายการ (กันกรอกผิด + กัน overflow ของ Decimal(12,2)) */
export const MAX_AMOUNT = 1_000_000;
/** จำนวนรายการสูงสุดต่อชุด (batch) */
export const MAX_BATCH_SIZE = 100;
/** ความยาวหมายเหตุสูงสุด */
export const MAX_NOTE_LENGTH = 200;

/** error ทางธุรกิจ — มี .status สำหรับแปลงเป็น HTTP response (default 400) */
export class TxnError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "TxnError";
    this.status = status;
  }
}

export type TxnItem = {
  studentId: string;
  /** จำนวนเงินบาท > 0 ทศนิยมไม่เกิน 2 ตำแหน่ง */
  amount: number;
  type: "DEPOSIT" | "WITHDRAW";
  note?: string | null;
};

function fullName(s: Pick<Student, "firstName" | "lastName">): string {
  return `${s.firstName} ${s.lastName}`;
}

/** แปลงค่า amount ดิบ (number/string) เป็นจำนวนเงินที่ถูกต้อง — คืน null ถ้าไม่ผ่าน */
function toValidAmount(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value.replace(/,/g, ""))
        : NaN;
  if (!Number.isFinite(n) || n > MAX_AMOUNT) return null;
  // ทศนิยมไม่เกิน 2 ตำแหน่ง (เผื่อคลาดเคลื่อน floating point เล็กน้อย)
  if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return null;
  // ปัดเป็นสตางค์ "ก่อน" แล้วค่อยตัดสิน — ค่าจิ๋วอย่าง 1e-9 เคยรอดเช็ค n > 0
  // แล้วถูกปัดเป็น 0 กลายเป็นธุรกรรม 0.00 บาทถาวร (ขัด contract ที่ amount > 0 เสมอ)
  const rounded = Math.round(n * 100) / 100;
  if (rounded <= 0) return null;
  return rounded;
}

/**
 * ตรวจ + แปลงรายการดิบจาก request body เป็น TxnItem
 * โยน TxnError ข้อความไทย (ระบุ "แถวที่ N" เมื่อเป็น batch)
 */
export function parseTxnItem(raw: unknown, index?: number): TxnItem {
  const rowLabel = index === undefined ? "" : ` (แถวที่ ${index + 1})`;
  if (typeof raw !== "object" || raw === null) {
    throw new TxnError(`รูปแบบข้อมูลรายการไม่ถูกต้อง${rowLabel}`);
  }
  const obj = raw as Record<string, unknown>;

  const studentId = obj.studentId;
  if (typeof studentId !== "string" || studentId.trim() === "") {
    throw new TxnError(`ไม่ได้ระบุนักเรียน${rowLabel}`);
  }

  const type = obj.type;
  if (type !== "DEPOSIT" && type !== "WITHDRAW") {
    throw new TxnError(`ประเภทธุรกรรมต้องเป็น "ฝาก" หรือ "ถอน" เท่านั้น${rowLabel}`);
  }

  const amount = toValidAmount(obj.amount);
  if (amount === null) {
    throw new TxnError(
      `จำนวนเงินไม่ถูกต้อง${rowLabel} — ต้องมากกว่า 0 ไม่เกิน ${formatBaht(MAX_AMOUNT)} บาท และทศนิยมไม่เกิน 2 ตำแหน่ง`
    );
  }

  let note: string | null = null;
  if (typeof obj.note === "string" && obj.note.trim() !== "") {
    note = obj.note.trim().slice(0, MAX_NOTE_LENGTH);
  }

  return { studentId: studentId.trim(), amount, type, note };
}

/**
 * บันทึกธุรกรรมหลายรายการเป็นชุดเดียว (atomic)
 * - ตรวจสิทธิ์ TEACHER: บันทึกได้เฉพาะนักเรียนในห้องที่ตนประจำชั้น (ปีที่เปิดอยู่)
 * - ทุกรายการอยู่ใน prisma.$transaction เดียว — แถวใดไม่ผ่าน rollback ทั้งชุด
 * - ถอนเกินยอด → โยน TxnError ระบุชื่อนักเรียน + ยอดคงเหลือ
 */
export async function recordTransactions(
  session: SessionPayload,
  items: TxnItem[]
): Promise<{ count: number }> {
  if (items.length === 0) {
    throw new TxnError("ไม่มีรายการธุรกรรมให้บันทึก");
  }
  if (items.length > MAX_BATCH_SIZE) {
    throw new TxnError(`บันทึกได้ครั้งละไม่เกิน ${MAX_BATCH_SIZE} รายการ`);
  }

  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
  });
  if (!activeYear) {
    throw new TxnError(
      "ยังไม่มีปีการศึกษาที่เปิดใช้งาน — กรุณาให้ผู้ดูแลระบบเปิดปีการศึกษาก่อนบันทึกธุรกรรม"
    );
  }

  // โหลดนักเรียนทั้งหมดที่อ้างถึง แล้วตรวจความถูกต้อง
  const studentIds = [...new Set(items.map((i) => i.studentId))];
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
  });
  const studentById = new Map(students.map((s) => [s.id, s]));

  for (const id of studentIds) {
    const student = studentById.get(id);
    if (!student) {
      throw new TxnError(
        "ไม่พบข้อมูลนักเรียนบางรายการ — กรุณารีเฟรชหน้าแล้วลองใหม่อีกครั้ง"
      );
    }
    if (student.status !== "ACTIVE") {
      throw new TxnError(
        `${fullName(student)} ไม่ได้อยู่ในสถานะกำลังศึกษา จึงบันทึกธุรกรรมไม่ได้`
      );
    }
  }

  // TEACHER: จำกัดเฉพาะนักเรียนในห้องที่ตนประจำชั้น (ปีการศึกษาที่เปิดอยู่)
  if (session.role === "TEACHER") {
    const myClassrooms = await prisma.classroom.findMany({
      where: { teacherId: session.userId, academicYearId: activeYear.id },
      select: { id: true },
    });
    if (myClassrooms.length === 0) {
      throw new TxnError(
        "คุณยังไม่ได้เป็นครูประจำชั้นของห้องใดในปีการศึกษาที่เปิดอยู่ จึงบันทึกธุรกรรมไม่ได้",
        403
      );
    }
    const myClassroomIds = new Set(myClassrooms.map((c) => c.id));
    for (const student of students) {
      if (!myClassroomIds.has(student.classroomId)) {
        throw new TxnError(
          `บันทึกได้เฉพาะนักเรียนในห้องที่คุณประจำชั้นเท่านั้น — ${fullName(student)} ไม่ได้อยู่ในห้องของคุณ`,
          403
        );
      }
    }
  }

  const now = new Date();

  // ทุกรายการอยู่ใน transaction เดียว — ล้มแถวเดียว rollback ทั้งชุด
  // timeout 20s เผื่อ batch ใหญ่ (นักเรียนทั้งห้อง ~40 คน = ~120 query)
  await prisma.$transaction(async (tx) => {
    // Re-verify + row-lock ปีการศึกษา "ข้างใน" transaction — activeYear ถูกอ่านไว้
    // ข้างนอกก่อนหน้านี้ อาจถูกปิดไประหว่างทางโดย /api/academic-years/close
    // (route นั้นอัปเดตแถวปีเป็น statement แรกใน tx ของมัน การ update แถวเดียวกัน
    // ที่นี่จึง serialize กันโดยอัตโนมัติ) ถ้าไม่กัน ธุรกรรมชุดนี้จะไปแก้ balance
    // บัญชีปีเก่า "หลัง" ยอดถูก snapshot ยกไปเป็น openingBalance ปีใหม่แล้ว
    const yearLock = await tx.academicYear.updateMany({
      where: { id: activeYear.id, isActive: true },
      data: { isActive: true },
    });
    if (yearLock.count === 0) {
      throw new TxnError(
        "ปีการศึกษาถูกปิดระหว่างบันทึก ระบบยกเลิกทั้งชุดแล้ว กรุณารีเฟรชหน้าแล้วลองใหม่"
      );
    }

    for (const item of items) {
      const student = studentById.get(item.studentId)!;

      // 1 บัญชี/นักเรียน/ปีการศึกษา — ถ้ายังไม่มีให้เปิดบัญชียอด 0
      // ใช้ upsert (ไม่ใช่ find-then-create) กันสอง request พร้อมกันชน
      // @@unique([studentId, academicYearId]) แล้ว batch ล้มทั้งชุดด้วย P2002
      const account = await tx.account.upsert({
        where: {
          studentId_academicYearId: {
            studentId: item.studentId,
            academicYearId: activeYear.id,
          },
        },
        create: {
          studentId: item.studentId,
          academicYearId: activeYear.id,
          openingBalance: new Prisma.Decimal(0),
          balance: new Prisma.Decimal(0),
        },
        update: {},
      });

      const amount = new Prisma.Decimal(item.amount.toFixed(2));

      if (item.type === "WITHDRAW") {
        // อัปเดตแบบมีเงื่อนไข balance >= amount — atomic กันยอดติดลบแม้มี request ซ้อน
        const updated = await tx.account.updateMany({
          where: { id: account.id, balance: { gte: amount } },
          data: { balance: { decrement: amount } },
        });
        if (updated.count === 0) {
          const fresh = await tx.account.findUnique({
            where: { id: account.id },
            select: { balance: true },
          });
          throw new TxnError(
            `ถอนเงินของ ${fullName(student)} ไม่ได้ — ยอดคงเหลือ ${formatBaht(fresh?.balance ?? 0)} บาท ` +
              `ไม่พอสำหรับถอน ${formatBaht(amount)} บาท (ระบบยกเลิกทั้งชุด ยังไม่มีรายการใดถูกบันทึก)`
          );
        }
      } else {
        await tx.account.update({
          where: { id: account.id },
          data: { balance: { increment: amount } },
        });
      }

      await tx.transaction.create({
        data: {
          accountId: account.id,
          type: item.type,
          amount,
          txnDate: now,
          recordedById: session.userId,
          note: item.note ?? null,
          status: "NORMAL",
        },
      });
    }
  }, { maxWait: 5000, timeout: 20000 });

  return { count: items.length };
}

/**
 * ยกเลิกรายการธุรกรรม (ADMIN เท่านั้น — ผู้เรียกต้องเช็ค role มาก่อน)
 * - ห้ามลบ — ตั้ง status=VOIDED + voidedById + voidedAt แล้วคืนยอดใน $transaction เดียว
 * - ยกเลิก "ฝาก" ต้องมียอดพอให้หักคืน (กัน balance ติดลบกรณีเงินถูกถอนไปแล้ว)
 * - ยกเลิกได้เฉพาะรายการของปีการศึกษาที่ active — ปีที่ปิดแล้ว balance ถูกยกยอด
 *   เป็น openingBalance ของบัญชีปีใหม่ไปแล้ว การแก้ยอดปีเก่าย้อนหลังจะทำให้
 *   ledger ขัดกันข้ามปี (ยอดยกมาของปีใหม่ไม่ตรงกับยอดปิดของปีเก่า)
 */
export async function voidTransaction(
  session: SessionPayload,
  transactionId: string
): Promise<void> {
  const txn = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { account: { include: { student: true, academicYear: true } } },
  });
  if (!txn) {
    throw new TxnError("ไม่พบรายการธุรกรรมนี้", 404);
  }
  if (txn.status === "VOIDED") {
    throw new TxnError("รายการนี้ถูกยกเลิกไปแล้ว");
  }
  if (
    txn.account.academicYear.isActive !== true ||
    txn.account.academicYear.closedAt !== null
  ) {
    throw new TxnError(
      "ยกเลิกได้เฉพาะรายการของปีการศึกษาที่กำลังใช้งาน — " +
        `รายการนี้อยู่ในปีการศึกษา ${txn.account.academicYear.year} ที่ปิดแล้ว ` +
        "และยอดคงเหลือถูกยกไปเป็นยอดยกมาของปีใหม่แล้ว"
    );
  }

  await prisma.$transaction(async (tx) => {
    // เงื่อนไข status=NORMAL กันการกดยกเลิกซ้ำพร้อมกัน (atomic)
    const marked = await tx.transaction.updateMany({
      where: { id: transactionId, status: "NORMAL" },
      data: {
        status: "VOIDED",
        voidedById: session.userId,
        voidedAt: new Date(),
      },
    });
    if (marked.count === 0) {
      throw new TxnError("รายการนี้ถูกยกเลิกไปแล้ว");
    }

    if (txn.type === "DEPOSIT") {
      // ยกเลิกฝาก = หักยอดคืน — ต้องมียอดพอ ไม่งั้น rollback
      const reversed = await tx.account.updateMany({
        where: { id: txn.accountId, balance: { gte: txn.amount } },
        data: { balance: { decrement: txn.amount } },
      });
      if (reversed.count === 0) {
        throw new TxnError(
          `ยกเลิกรายการฝากของ ${fullName(txn.account.student)} ไม่ได้ — ` +
            `ยอดคงเหลือปัจจุบันน้อยกว่า ${formatBaht(txn.amount)} บาท (เงินส่วนนี้ถูกถอนออกไปแล้ว)`
        );
      }
    } else {
      // ยกเลิกถอน = คืนยอดกลับเข้าบัญชี
      await tx.account.update({
        where: { id: txn.accountId },
        data: { balance: { increment: txn.amount } },
      });
    }
  });
}
