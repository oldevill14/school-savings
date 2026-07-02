/**
 * API จัดการห้องเรียนของปีการศึกษาที่กำลังใช้งาน — ADMIN เท่านั้น
 *
 * GET    -> ปี active + รายการห้อง (ครูประจำชั้น, จำนวนนักเรียน ACTIVE, ยอดรวม) + รายชื่อครูสำหรับ dropdown
 * POST   -> สร้างห้องใหม่ในปี active { name, teacherId? }
 * PATCH  -> แก้ไขห้องของปี active { id, name?, teacherId? (string|null) }
 * DELETE -> ลบห้องของปี active { id } — อนุญาตเฉพาะห้องที่ไม่มีนักเรียนเลย
 */
import { NextResponse } from "next/server";
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** เครื่องหมายบัญชีผู้ใช้ที่ถูกปิดใช้งาน (ดู NOTES-admin.md — schema ยังไม่มีฟิลด์ isActive) */
const DISABLED_PREFIX = "DISABLED:";

function errorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("api/classrooms:", e);
  return NextResponse.json(
    { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
    { status: 500 }
  );
}

async function getActiveYear() {
  return prisma.academicYear.findFirst({ where: { isActive: true } });
}

/** ตรวจชื่อห้อง — ต้องไม่ว่าง ยาวไม่เกิน 30 ตัวอักษร */
function validateName(raw: unknown): { name?: string; error?: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { error: "กรุณาระบุชื่อห้องเรียน" };
  }
  const name = raw.trim();
  if (name.length > 30) return { error: "ชื่อห้องเรียนยาวเกิน 30 ตัวอักษร" };
  return { name };
}

/** ตรวจ teacherId — ถ้าระบุ ต้องเป็นผู้ใช้ role TEACHER จริง (คืน null = ไม่ผูกครู) */
async function validateTeacherId(raw: unknown): Promise<
  { teacherId: string | null } | { error: string }
> {
  if (raw === undefined || raw === null || raw === "") return { teacherId: null };
  if (typeof raw !== "string") return { error: "ครูประจำชั้นไม่ถูกต้อง" };
  const teacher = await prisma.user.findUnique({ where: { id: raw } });
  if (!teacher || teacher.role !== "TEACHER") {
    return { error: "ไม่พบครูที่เลือก หรือผู้ใช้ไม่ใช่ครูประจำชั้น" };
  }
  return { teacherId: teacher.id };
}

export async function GET() {
  try {
    await requireRoleApi(["ADMIN"]);

    const activeYear = await getActiveYear();
    if (!activeYear) {
      return NextResponse.json({ activeYear: null, classrooms: [], teachers: [] });
    }

    const [classrooms, teacherUsers] = await Promise.all([
      prisma.classroom.findMany({
        where: { academicYearId: activeYear.id },
        include: {
          teacher: { select: { id: true, name: true } },
          students: {
            select: {
              id: true,
              status: true,
              accounts: {
                where: { academicYearId: activeYear.id },
                select: { balance: true },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.user.findMany({
        where: { role: "TEACHER" },
        select: { id: true, name: true, passwordHash: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({
      activeYear: { id: activeYear.id, year: activeYear.year },
      classrooms: classrooms.map((c) => {
        const activeStudents = c.students.filter((s) => s.status === "ACTIVE");
        const totalBalance = activeStudents.reduce(
          (sum, s) =>
            sum + s.accounts.reduce((acc, a) => acc + Number(a.balance), 0),
          0
        );
        return {
          id: c.id,
          name: c.name,
          teacher: c.teacher ? { id: c.teacher.id, name: c.teacher.name } : null,
          studentCount: activeStudents.length,
          // จำนวนนักเรียนทุกสถานะ — ใช้ตัดสินว่าลบห้องได้หรือไม่
          totalStudentCount: c.students.length,
          totalBalance,
        };
      }),
      teachers: teacherUsers
        .filter((t) => !t.passwordHash.startsWith(DISABLED_PREFIX))
        .map((t) => ({ id: t.id, name: t.name })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireRoleApi(["ADMIN"]);

    const activeYear = await getActiveYear();
    if (!activeYear) {
      return NextResponse.json(
        { error: "ยังไม่มีปีการศึกษาที่กำลังใช้งาน" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    const nameCheck = validateName(body?.name);
    if (nameCheck.error) {
      return NextResponse.json({ error: nameCheck.error }, { status: 400 });
    }
    const teacherCheck = await validateTeacherId(body?.teacherId);
    if ("error" in teacherCheck) {
      return NextResponse.json({ error: teacherCheck.error }, { status: 400 });
    }

    const duplicate = await prisma.classroom.findUnique({
      where: {
        academicYearId_name: { academicYearId: activeYear.id, name: nameCheck.name! },
      },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: `มีห้องเรียน "${nameCheck.name}" ในปีการศึกษา ${activeYear.year} อยู่แล้ว` },
        { status: 409 }
      );
    }

    const classroom = await prisma.classroom.create({
      data: {
        academicYearId: activeYear.id,
        name: nameCheck.name!,
        teacherId: teacherCheck.teacherId,
      },
    });

    return NextResponse.json({ ok: true, classroom: { id: classroom.id, name: classroom.name } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireRoleApi(["ADMIN"]);

    const activeYear = await getActiveYear();
    if (!activeYear) {
      return NextResponse.json(
        { error: "ยังไม่มีปีการศึกษาที่กำลังใช้งาน" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    if (typeof body?.id !== "string") {
      return NextResponse.json({ error: "ไม่พบรหัสห้องเรียน" }, { status: 400 });
    }

    const classroom = await prisma.classroom.findUnique({ where: { id: body.id } });
    if (!classroom || classroom.academicYearId !== activeYear.id) {
      return NextResponse.json(
        { error: "แก้ไขได้เฉพาะห้องเรียนของปีการศึกษาที่กำลังใช้งาน" },
        { status: 400 }
      );
    }

    const nameCheck = validateName(body?.name ?? classroom.name);
    if (nameCheck.error) {
      return NextResponse.json({ error: nameCheck.error }, { status: 400 });
    }
    const teacherCheck = await validateTeacherId(body?.teacherId);
    if ("error" in teacherCheck) {
      return NextResponse.json({ error: teacherCheck.error }, { status: 400 });
    }

    if (nameCheck.name !== classroom.name) {
      const duplicate = await prisma.classroom.findUnique({
        where: {
          academicYearId_name: { academicYearId: activeYear.id, name: nameCheck.name! },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `มีห้องเรียน "${nameCheck.name}" ในปีการศึกษา ${activeYear.year} อยู่แล้ว` },
          { status: 409 }
        );
      }
    }

    await prisma.classroom.update({
      where: { id: classroom.id },
      data: { name: nameCheck.name!, teacherId: teacherCheck.teacherId },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireRoleApi(["ADMIN"]);

    const activeYear = await getActiveYear();
    if (!activeYear) {
      return NextResponse.json(
        { error: "ยังไม่มีปีการศึกษาที่กำลังใช้งาน" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    if (typeof body?.id !== "string") {
      return NextResponse.json({ error: "ไม่พบรหัสห้องเรียน" }, { status: 400 });
    }

    const classroom = await prisma.classroom.findUnique({
      where: { id: body.id },
      include: { _count: { select: { students: true } } },
    });
    if (!classroom || classroom.academicYearId !== activeYear.id) {
      return NextResponse.json(
        { error: "ลบได้เฉพาะห้องเรียนของปีการศึกษาที่กำลังใช้งาน" },
        { status: 400 }
      );
    }
    if (classroom._count.students > 0) {
      return NextResponse.json(
        { error: "ห้องนี้ยังมีนักเรียนอยู่ ไม่สามารถลบได้ (ย้ายนักเรียนออกก่อน)" },
        { status: 400 }
      );
    }

    await prisma.classroom.delete({ where: { id: classroom.id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
