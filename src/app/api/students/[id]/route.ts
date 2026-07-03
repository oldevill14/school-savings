/**
 * API นักเรียนรายคน
 *
 * - GET   /api/students/[id] — ADMIN ทุกคน, TEACHER เฉพาะห้องตนเอง, PARENT เฉพาะบุตรที่ผูกไว้
 * - PATCH /api/students/[id] — ADMIN เท่านั้น: แก้ไขข้อมูล / ย้ายห้อง (classroomId) / เปลี่ยนสถานะ
 *
 * ไม่มี DELETE — นักเรียนไม่ถูกลบ ใช้ status GRADUATED / MOVED แทน
 */
import { NextResponse } from "next/server";
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const STUDENT_STATUSES = ["ACTIVE", "GRADUATED", "MOVED"] as const;
type StudentStatusValue = (typeof STUDENT_STATUSES)[number];

function cleanString(value: unknown, max = 100): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s || s.length > max) return null;
  return s;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function handleAuthError(e: unknown): NextResponse | null {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return null;
}

// ---------- GET: ข้อมูลนักเรียนรายคน ----------

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRoleApi(["ADMIN", "TEACHER", "PARENT"]);
    const { id } = await params;

    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        classroom: { select: { id: true, name: true, teacherId: true } },
        accounts: {
          include: { academicYear: { select: { year: true, isActive: true } } },
          orderBy: { academicYear: { year: "desc" } },
        },
      },
    });
    if (!student) return jsonError("ไม่พบข้อมูลนักเรียน", 404);

    // สิทธิ์: PARENT ดูได้เฉพาะบุตรที่ผูกไว้ / TEACHER เฉพาะนักเรียนในห้องตนเอง
    if (session.role === "PARENT" && !session.studentIds.includes(student.id)) {
      return jsonError("ไม่มีสิทธิ์เข้าถึงข้อมูลนักเรียนคนนี้", 403);
    }
    if (session.role === "TEACHER" && student.classroom.teacherId !== session.userId) {
      return jsonError("ไม่มีสิทธิ์เข้าถึงนักเรียนนอกห้องประจำชั้นของท่าน", 403);
    }

    return NextResponse.json({
      student: {
        id: student.id,
        studentCode: student.studentCode,
        firstName: student.firstName,
        lastName: student.lastName,
        status: student.status,
        classroomId: student.classroom.id,
        classroomName: student.classroom.name,
        // Prisma Decimal -> string ก่อนส่งออก
        accounts: student.accounts.map((a) => ({
          id: a.id,
          year: a.academicYear.year,
          isActiveYear: a.academicYear.isActive,
          openingBalance: a.openingBalance.toString(),
          balance: a.balance.toString(),
        })),
      },
    });
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    console.error("GET /api/students/[id] ล้มเหลว:", e);
    return jsonError("เกิดข้อผิดพลาดในการดึงข้อมูลนักเรียน", 500);
  }
}

// ---------- PATCH: แก้ไขข้อมูล / ย้ายห้อง / เปลี่ยนสถานะ ----------

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleApi(["ADMIN"]); // แก้ไข/ย้ายห้อง = ADMIN เท่านั้น
    const { id } = await params;

    const student = await prisma.student.findUnique({ where: { id } });
    if (!student) return jsonError("ไม่พบข้อมูลนักเรียน", 404);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonError("รูปแบบข้อมูลไม่ถูกต้อง", 400);

    const data: {
      studentCode?: string;
      firstName?: string;
      lastName?: string;
      classroomId?: string;
      status?: StudentStatusValue;
    } = {};

    if (body.studentCode !== undefined) {
      const studentCode = cleanString(body.studentCode, 20);
      if (!studentCode) return jsonError("รหัสนักเรียนไม่ถูกต้อง (ไม่เกิน 20 ตัวอักษร)", 400);
      if (studentCode !== student.studentCode) {
        const duplicate = await prisma.student.findUnique({ where: { studentCode } });
        if (duplicate) return jsonError(`รหัสนักเรียน ${studentCode} มีอยู่ในระบบแล้ว`, 409);
      }
      data.studentCode = studentCode;
    }

    if (body.firstName !== undefined) {
      const firstName = cleanString(body.firstName);
      if (!firstName) return jsonError("กรุณากรอกชื่อนักเรียน", 400);
      data.firstName = firstName;
    }

    if (body.lastName !== undefined) {
      const lastName = cleanString(body.lastName);
      if (!lastName) return jsonError("กรุณากรอกนามสกุลนักเรียน", 400);
      data.lastName = lastName;
    }

    if (body.classroomId !== undefined) {
      const classroomId = cleanString(body.classroomId, 50);
      if (!classroomId) return jsonError("กรุณาเลือกห้องเรียน", 400);
      const classroom = await prisma.classroom.findUnique({ where: { id: classroomId } });
      if (!classroom) return jsonError("ไม่พบห้องเรียนที่เลือก", 400);
      data.classroomId = classroomId;
    }

    if (body.status !== undefined) {
      const status = cleanString(body.status, 20);
      if (!status || !STUDENT_STATUSES.includes(status as StudentStatusValue)) {
        return jsonError("สถานะนักเรียนไม่ถูกต้อง", 400);
      }
      data.status = status as StudentStatusValue;
    }

    if (Object.keys(data).length === 0) {
      return jsonError("ไม่มีข้อมูลที่จะแก้ไข", 400);
    }

    const updated = await prisma.student.update({
      where: { id },
      data,
      include: { classroom: { select: { id: true, name: true } } },
    });

    return NextResponse.json({
      student: {
        id: updated.id,
        studentCode: updated.studentCode,
        firstName: updated.firstName,
        lastName: updated.lastName,
        status: updated.status,
        classroomId: updated.classroom.id,
        classroomName: updated.classroom.name,
      },
    });
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    console.error("PATCH /api/students/[id] ล้มเหลว:", e);
    return jsonError("เกิดข้อผิดพลาดในการแก้ไขข้อมูลนักเรียน", 500);
  }
}
