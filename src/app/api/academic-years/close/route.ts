/**
 * POST /api/academic-years/close — ปิดปีการศึกษาปัจจุบัน + เปิดปีใหม่ (ADMIN เท่านั้น)
 *
 * body: { confirmYear: number }  — ผู้ใช้ต้องพิมพ์เลขปีที่กำลังใช้งานเพื่อยืนยัน
 *
 * ทำงานทั้งหมดใน prisma.$transaction เดียว:
 * 1. ตั้ง closedAt + isActive=false ให้ปีเดิม
 * 2. สร้างปีใหม่ (ปีเดิม + 1) เป็น active
 * 3. สร้างห้องเรียนชุดใหม่: ชื่อเดิมทั้งหมด (โครงสร้างเดิม/รอรับ ป.1 ใหม่)
 *    ∪ ชื่อปลายทางการเลื่อนชั้น — ครูประจำชั้นติดไปกับ "ชื่อห้องเดิม" (ครูอยู่ประจำชั้นเดิม)
 * 4. เลื่อนชั้นนักเรียน ACTIVE: ป.1->ป.2 ... ป.5->ป.6, ป.6 -> status GRADUATED
 *    (นักเรียน GRADUATED/MOVED เดิมไม่ถูกแตะ)
 * 5. สร้างบัญชีปีใหม่ให้นักเรียนที่เลื่อนชั้น: openingBalance = balance ของบัญชีปีเดิม
 *
 * ธุรกรรมและบัญชีปีเดิมไม่ถูกลบ/แก้ — ประวัติศาสตร์คงอยู่ครบ
 */
import { NextResponse } from "next/server";
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit, AuditAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** ชื่อห้องมาตรฐาน เช่น "ป.1/1" -> [ชั้น, ห้อง] */
const CLASSROOM_NAME_RE = /^ป\.([1-6])\/(\d+)$/;

function errorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("api/academic-years/close:", e);
  return NextResponse.json(
    { error: "ปิดปีการศึกษาไม่สำเร็จ ระบบยกเลิกการเปลี่ยนแปลงทั้งหมดแล้ว กรุณาลองใหม่" },
    { status: 500 }
  );
}

export async function POST(req: Request) {
  try {
    const session = await requireRoleApi(["ADMIN"]);

    const body = await req.json().catch(() => null);
    const confirmYear = Number(body?.confirmYear);
    if (!Number.isInteger(confirmYear)) {
      return NextResponse.json(
        { error: "กรุณาพิมพ์เลขปีการศึกษาเพื่อยืนยัน" },
        { status: 400 }
      );
    }

    const activeYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
    });
    if (!activeYear) {
      return NextResponse.json(
        { error: "ไม่พบปีการศึกษาที่กำลังใช้งาน" },
        { status: 400 }
      );
    }
    if (confirmYear !== activeYear.year) {
      return NextResponse.json(
        { error: `เลขปียืนยันไม่ตรง — ต้องพิมพ์ "${activeYear.year}" เพื่อปิดปีการศึกษานี้` },
        { status: 400 }
      );
    }

    const newYearNumber = activeYear.year + 1;
    const existing = await prisma.academicYear.findUnique({
      where: { year: newYearNumber },
    });
    if (existing) {
      return NextResponse.json(
        { error: `มีปีการศึกษา ${newYearNumber} ในระบบอยู่แล้ว ไม่สามารถเปิดซ้ำได้` },
        { status: 400 }
      );
    }

    const summary = await prisma.$transaction(
      async (tx) => {
        const now = new Date();

        // 1) ปิดปีเดิม
        await tx.academicYear.update({
          where: { id: activeYear.id },
          data: { isActive: false, closedAt: now },
        });

        // 2) เปิดปีใหม่ (active ตัวเดียว — ปีอื่นเพิ่งถูกปิดในข้อ 1)
        const newYear = await tx.academicYear.create({
          data: { year: newYearNumber, isActive: true, openedAt: now },
        });

        // 3) ห้องเรียนปีเดิม + นักเรียน ACTIVE + บัญชีปีเดิมของแต่ละคน
        const oldClassrooms = await tx.classroom.findMany({
          where: { academicYearId: activeYear.id },
          include: {
            students: {
              where: { status: "ACTIVE" },
              include: {
                accounts: {
                  where: { academicYearId: activeYear.id },
                  select: { balance: true },
                },
              },
            },
          },
        });

        // ชุดชื่อห้องปีใหม่ = ชื่อห้องเดิมทั้งหมด ∪ ชื่อปลายทางการเลื่อนชั้น
        const neededNames = new Set<string>();
        for (const c of oldClassrooms) {
          neededNames.add(c.name);
          const m = CLASSROOM_NAME_RE.exec(c.name);
          if (m) {
            const grade = Number(m[1]);
            if (grade < 6) neededNames.add(`ป.${grade + 1}/${m[2]}`);
          }
        }

        // ครูติดไปกับชื่อห้องเดิม (ครูประจำชั้นอยู่ชั้นเดิม รับนักเรียนรุ่นใหม่)
        const teacherByOldName = new Map(
          oldClassrooms.map((c) => [c.name, c.teacherId])
        );

        const newClassroomIdByName = new Map<string, string>();
        for (const name of [...neededNames].sort()) {
          const created = await tx.classroom.create({
            data: {
              academicYearId: newYear.id,
              name,
              teacherId: teacherByOldName.get(name) ?? null,
            },
          });
          newClassroomIdByName.set(name, created.id);
        }

        // 4-5) เลื่อนชั้น + สร้างบัญชีปีใหม่ยกยอด
        let promoted = 0;
        let graduated = 0;
        let accountsCreated = 0;

        for (const classroom of oldClassrooms) {
          const m = CLASSROOM_NAME_RE.exec(classroom.name);
          const grade = m ? Number(m[1]) : null;

          for (const student of classroom.students) {
            // ป.6 -> จบการศึกษา (คงอยู่ห้องเดิมของปีเดิมไว้เป็นประวัติ)
            if (grade === 6) {
              await tx.student.update({
                where: { id: student.id },
                data: { status: "GRADUATED" },
              });
              graduated++;
              continue;
            }

            // ป.1-ป.5 เลื่อนขึ้น 1 ชั้น / ชื่อห้องนอกรูปแบบ -> ย้ายไปห้องชื่อเดิมของปีใหม่
            const targetName = m ? `ป.${grade! + 1}/${m[2]}` : classroom.name;
            const targetId = newClassroomIdByName.get(targetName);
            if (!targetId) {
              throw new Error(`ไม่พบห้องปลายทาง "${targetName}" ของปี ${newYearNumber}`);
            }

            await tx.student.update({
              where: { id: student.id },
              data: { classroomId: targetId },
            });

            // ยกยอดปีเดิมเป็น openingBalance ปีใหม่ (1 บัญชี/คน/ปี)
            const carried = student.accounts[0]?.balance ?? 0;
            await tx.account.create({
              data: {
                studentId: student.id,
                academicYearId: newYear.id,
                openingBalance: carried,
                balance: carried,
              },
            });
            promoted++;
            accountsCreated++;
          }
        }

        return {
          closedYear: activeYear.year,
          newYear: newYearNumber,
          classroomsCreated: newClassroomIdByName.size,
          promoted,
          graduated,
          accountsCreated,
        };
      },
      { maxWait: 10_000, timeout: 60_000 }
    );

    // บันทึก audit หลังปิดปีสำเร็จ (fire-and-forget — ไม่มีทาง throw)
    await logAudit({
      userId: session.userId,
      action: AuditAction.YEAR_CLOSE,
      detail:
        `ปิดปีการศึกษา ${summary.closedYear} เปิดปี ${summary.newYear} · ` +
        `เลื่อนชั้น ${summary.promoted} คน จบการศึกษา ${summary.graduated} คน ` +
        `สร้างบัญชียกยอด ${summary.accountsCreated} บัญชี`,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return errorResponse(e);
  }
}
