/**
 * POST /api/interest — จ่ายดอกเบี้ยประจำปีให้ทุกบัญชีของปีที่เปิดอยู่ (ADMIN เท่านั้น)
 *
 * body: { rate: number; confirmYear: number; force?: boolean }
 *   - rate: อัตราดอกเบี้ยต่อปี (%) > 0
 *   - confirmYear: ผู้ใช้พิมพ์เลขปีการศึกษาที่เปิดอยู่เพื่อยืนยัน (กันกดพลาด)
 *   - force: ยืนยันจ่ายซ้ำ (กรณีปีนั้นเคยจ่ายดอกเบี้ยแล้ว)
 *
 * ทำงานทั้งหมดใน prisma.$transaction เดียว:
 *   สำหรับทุกบัญชีที่ดอกเบี้ย > 0 → สร้าง Transaction type=DEPOSIT category=INTEREST
 *   + update balance (increment) — รักษา invariant บัญชีเสมอ
 * จากนั้น logAudit INTEREST_PAYOUT + แจ้งเตือนผู้ปกครอง (fire-and-forget)
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit, AuditAction } from "@/lib/audit";
import { notifyGuardiansOfTransaction } from "@/lib/notify";
import { formatBaht } from "@/lib/money";
import { computeInterest } from "@/app/(app)/interest/interest-calc";

export const dynamic = "force-dynamic";

/** parse อัตราดอกเบี้ย (%) — > 0, <= 100, ทศนิยมไม่เกิน 2 ตำแหน่ง */
function parseRate(value: unknown): number | null {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/[,\s%]/g, ""))
        : NaN;
  if (!Number.isFinite(raw) || raw <= 0 || raw > 100) return null;
  if (Math.abs(Math.round(raw * 100) - raw * 100) > 1e-6) return null;
  return Math.round(raw * 100) / 100;
}

/**
 * โยนเมื่อ re-check "ภายใน" transaction พบว่าปีนี้จ่ายดอกเบี้ยไปแล้ว (โดยไม่ force)
 * ใช้กัน TOCTOU จ่ายซ้ำ — แปลงเป็น response 409 alreadyPaid ใน catch (รูปแบบเดียวกับ pre-check)
 */
class InterestAlreadyPaidError extends Error {
  constructor(
    readonly year: number,
    readonly priorCount: number
  ) {
    super("INTEREST_ALREADY_PAID");
    this.name = "InterestAlreadyPaidError";
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireRoleApi(["ADMIN"]);

    const body: unknown = await req.json().catch(() => null);
    const obj =
      typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

    const rate = parseRate(obj.rate);
    if (rate === null) {
      return NextResponse.json(
        { error: "อัตราดอกเบี้ยไม่ถูกต้อง — ต้องมากกว่า 0 ไม่เกิน 100 ทศนิยมไม่เกิน 2 ตำแหน่ง" },
        { status: 400 }
      );
    }

    const confirmYear = Number(obj.confirmYear);
    const force = obj.force === true;

    const activeYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
    });
    if (!activeYear) {
      return NextResponse.json(
        { error: "ยังไม่มีปีการศึกษาที่เปิดใช้งาน — เปิดปีการศึกษาก่อนจึงจะจ่ายดอกเบี้ยได้" },
        { status: 400 }
      );
    }
    if (!Number.isInteger(confirmYear) || confirmYear !== activeYear.year) {
      return NextResponse.json(
        { error: `เลขปียืนยันไม่ตรง — ต้องพิมพ์ "${activeYear.year}" เพื่อยืนยันการจ่ายดอกเบี้ย` },
        { status: 400 }
      );
    }

    // guard: ปีนี้เคยจ่ายดอกเบี้ยแล้วหรือยัง
    const priorInterest = await prisma.transaction.count({
      where: {
        category: "INTEREST",
        status: "NORMAL",
        account: { academicYearId: activeYear.id },
      },
    });
    if (priorInterest > 0 && !force) {
      return NextResponse.json(
        {
          error:
            `ปีการศึกษา ${activeYear.year} เคยจ่ายดอกเบี้ยไปแล้ว ${priorInterest.toLocaleString(
              "th-TH"
            )} รายการ — ` +
            "หากต้องการจ่ายเพิ่มอีกรอบ กรุณายืนยันการจ่ายซ้ำ",
          alreadyPaid: true,
          priorCount: priorInterest,
        },
        { status: 409 }
      );
    }

    // ทุกบัญชีของปีที่เปิดอยู่ + ยอดคงเหลือ
    const accounts = await prisma.account.findMany({
      where: { academicYearId: activeYear.id },
      select: {
        id: true,
        balance: true,
        student: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // คำนวณดอกเบี้ยรายบัญชี — เก็บเฉพาะที่ > 0
    const payable = accounts
      .map((a) => ({
        accountId: a.id,
        studentId: a.student.id,
        studentName: `${a.student.firstName} ${a.student.lastName}`,
        interest: computeInterest(Number(a.balance), rate),
      }))
      .filter((p) => p.interest > 0);

    if (payable.length === 0) {
      return NextResponse.json(
        {
          error:
            "ไม่มีบัญชีที่ได้รับดอกเบี้ย (ยอดคงเหลือเป็น 0 หรืออัตราดอกเบี้ยน้อยจนปัดลงเหลือ 0 สตางค์)",
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const note = `ดอกเบี้ยประจำปี ${activeYear.year} อัตรา ${rate}%`;

    const results: { studentId: string; studentName: string; interest: number; balanceAfter: number }[] =
      [];

    await prisma.$transaction(
      async (tx) => {
        // ล็อกปีการศึกษา (กันถูกปิดระหว่างจ่ายดอกเบี้ย)
        const yearLock = await tx.academicYear.updateMany({
          where: { id: activeYear.id, isActive: true },
          data: { isActive: true },
        });
        if (yearLock.count === 0) {
          throw new Error("ปีการศึกษาถูกปิดระหว่างดำเนินการ");
        }

        // re-check ภายใน transaction (กัน TOCTOU จ่ายซ้ำ): yearLock updateMany ข้างบน
        // serialize request บนแถว AcademicYear เดียวกันแล้ว — request ที่สองจะบล็อกจนกว่า
        // request แรก commit จากนั้น count นี้จะเห็นชุด INTEREST ที่ commit ไปแล้ว → throw abort
        // (pre-check นอก transaction ที่บรรทัด ~74 นับตอน priorInterest=0 ทั้งคู่ กัน race ไม่ได้)
        if (!force) {
          const priorInterestInTx = await tx.transaction.count({
            where: {
              category: "INTEREST",
              status: "NORMAL",
              account: { academicYearId: activeYear.id },
            },
          });
          if (priorInterestInTx > 0) {
            throw new InterestAlreadyPaidError(activeYear.year, priorInterestInTx);
          }
        }

        for (const p of payable) {
          const amount = new Prisma.Decimal(p.interest.toFixed(2));
          const after = await tx.account.update({
            where: { id: p.accountId },
            data: { balance: { increment: amount } },
            select: { balance: true },
          });
          await tx.transaction.create({
            data: {
              accountId: p.accountId,
              type: "DEPOSIT",
              category: "INTEREST",
              amount,
              txnDate: now,
              recordedById: session.userId,
              note,
              status: "NORMAL",
            },
          });
          results.push({
            studentId: p.studentId,
            studentName: p.studentName,
            interest: p.interest,
            balanceAfter: Number(after.balance),
          });
        }
      },
      { maxWait: 15_000, timeout: 120_000 }
    );

    const totalInterest =
      Math.round(results.reduce((s, r) => s + Math.round(r.interest * 100), 0)) / 100;

    await logAudit({
      userId: session.userId,
      action: AuditAction.INTEREST_PAYOUT,
      detail:
        `จ่ายดอกเบี้ยประจำปี ${activeYear.year} อัตรา ${rate}% — ` +
        `${results.length.toLocaleString("th-TH")} บัญชี รวม ${formatBaht(totalInterest)} บาท` +
        (force && priorInterest > 0 ? " (จ่ายซ้ำ)" : ""),
    });

    // แจ้งเตือนผู้ปกครอง (fire-and-forget) — no-op ถ้าไม่ตั้ง LINE token
    for (const r of results) {
      void notifyGuardiansOfTransaction([r.studentId], {
        type: "DEPOSIT",
        amount: formatBaht(r.interest),
        balanceAfter: formatBaht(r.balanceAfter),
        txnDate: now,
        studentName: r.studentName,
      });
    }

    return NextResponse.json({
      ok: true,
      summary: {
        year: activeYear.year,
        rate,
        count: results.length,
        totalInterest,
      },
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    // race ถูกจับได้ "ภายใน" transaction (มี request อื่นจ่ายดอกเบี้ยปีนี้ไปก่อนแล้ว)
    // ตอบรูปแบบเดียวกับ pre-check นอก transaction เพื่อให้ฝั่ง UI จัดการเหมือนกัน
    if (e instanceof InterestAlreadyPaidError) {
      return NextResponse.json(
        {
          error:
            `ปีการศึกษา ${e.year} เคยจ่ายดอกเบี้ยไปแล้ว ${e.priorCount.toLocaleString(
              "th-TH"
            )} รายการ — ` +
            "หากต้องการจ่ายเพิ่มอีกรอบ กรุณายืนยันการจ่ายซ้ำ",
          alreadyPaid: true,
          priorCount: e.priorCount,
        },
        { status: 409 }
      );
    }
    console.error("[/api/interest]", e);
    return NextResponse.json(
      { error: "จ่ายดอกเบี้ยไม่สำเร็จ ระบบยกเลิกการเปลี่ยนแปลงทั้งหมดแล้ว กรุณาลองใหม่" },
      { status: 500 }
    );
  }
}
