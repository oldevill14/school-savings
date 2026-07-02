/**
 * API จัดการนักเรียน (รายการ + สร้าง + นำเข้า CSV)
 *
 * - GET  /api/students?search=&classroomId=   — ADMIN เห็นทุกคน, TEACHER เห็นเฉพาะห้องที่ตนประจำ
 * - POST /api/students                        — ADMIN เท่านั้น
 *     body แบบสร้างรายคน:  { studentCode, firstName, lastName, classroomId }
 *     body แบบนำเข้า CSV:  { rows: [{ studentCode, firstName, lastName, classroomName, line? }] }
 *
 * นโยบาย: ไม่มี DELETE — นักเรียนไม่ถูกลบ (หลักการ "ไม่มีอะไรถูกลบ")
 * ใช้ status = GRADUATED / MOVED แทนผ่าน PATCH /api/students/[id]
 */
import { NextResponse } from "next/server";
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// ---------- helpers ----------

/** trim + ตรวจว่าเป็น string ไม่ว่าง (ยาวไม่เกิน max) — คืน null ถ้าไม่ผ่าน */
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

// ---------- GET: รายชื่อนักเรียน ----------

export async function GET(req: Request) {
  try {
    const session = await requireRoleApi(["ADMIN", "TEACHER"]);
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const classroomId = searchParams.get("classroomId")?.trim() ?? "";

    const students = await prisma.student.findMany({
      where: {
        // TEACHER เห็นเฉพาะห้องที่ตนเป็นครูประจำชั้น
        ...(session.role === "TEACHER"
          ? { classroom: { teacherId: session.userId } }
          : {}),
        ...(classroomId ? { classroomId } : {}),
        ...(search
          ? {
              OR: [
                { studentCode: { contains: search, mode: "insensitive" } },
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { classroom: { select: { id: true, name: true } } },
      orderBy: { studentCode: "asc" },
    });

    return NextResponse.json({
      students: students.map((s) => ({
        id: s.id,
        studentCode: s.studentCode,
        firstName: s.firstName,
        lastName: s.lastName,
        status: s.status,
        classroomId: s.classroom.id,
        classroomName: s.classroom.name,
      })),
    });
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    console.error("GET /api/students ล้มเหลว:", e);
    return jsonError("เกิดข้อผิดพลาดในการดึงรายชื่อนักเรียน", 500);
  }
}

// ---------- POST: สร้างนักเรียน (รายคน) / นำเข้า CSV ----------

type ImportRowInput = {
  studentCode?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  classroomName?: unknown;
  line?: unknown;
};

export async function POST(req: Request) {
  try {
    await requireRoleApi(["ADMIN"]); // เพิ่ม/นำเข้านักเรียน = ADMIN เท่านั้น

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonError("รูปแบบข้อมูลไม่ถูกต้อง", 400);

    // ---- โหมดนำเข้า CSV ----
    if (Array.isArray(body.rows)) {
      return importStudents(body.rows as ImportRowInput[]);
    }

    // ---- โหมดสร้างรายคน ----
    const studentCode = cleanString(body.studentCode, 20);
    const firstName = cleanString(body.firstName);
    const lastName = cleanString(body.lastName);
    const classroomId = cleanString(body.classroomId, 50);

    if (!studentCode) return jsonError("กรุณากรอกรหัสนักเรียน (ไม่เกิน 20 ตัวอักษร)", 400);
    if (!firstName) return jsonError("กรุณากรอกชื่อนักเรียน", 400);
    if (!lastName) return jsonError("กรุณากรอกนามสกุลนักเรียน", 400);
    if (!classroomId) return jsonError("กรุณาเลือกห้องเรียน", 400);

    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      include: { academicYear: { select: { id: true } } },
    });
    if (!classroom) return jsonError("ไม่พบห้องเรียนที่เลือก", 400);

    const duplicate = await prisma.student.findUnique({ where: { studentCode } });
    if (duplicate) {
      return jsonError(`รหัสนักเรียน ${studentCode} มีอยู่ในระบบแล้ว`, 409);
    }

    // สร้างนักเรียน + เปิดบัญชีของปีการศึกษาเดียวกับห้องเรียน (nested create = atomic)
    const student = await prisma.student.create({
      data: {
        studentCode,
        firstName,
        lastName,
        classroomId: classroom.id,
        status: "ACTIVE",
        accounts: {
          create: {
            academicYearId: classroom.academicYear.id,
            openingBalance: 0,
            balance: 0,
          },
        },
      },
      include: { classroom: { select: { name: true } } },
    });

    return NextResponse.json(
      {
        student: {
          id: student.id,
          studentCode: student.studentCode,
          firstName: student.firstName,
          lastName: student.lastName,
          status: student.status,
          classroomName: student.classroom.name,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    const res = handleAuthError(e);
    if (res) return res;
    console.error("POST /api/students ล้มเหลว:", e);
    return jsonError("เกิดข้อผิดพลาดในการบันทึกข้อมูลนักเรียน", 500);
  }
}

/** นำเข้านักเรียนจาก CSV (studentCode,firstName,lastName,classroomName) — จับคู่ห้องในปีการศึกษาที่ active */
async function importStudents(rowsInput: ImportRowInput[]) {
  if (rowsInput.length === 0) return jsonError("ไม่มีข้อมูลสำหรับนำเข้า", 400);
  if (rowsInput.length > 500) return jsonError("นำเข้าได้ครั้งละไม่เกิน 500 รายการ", 400);

  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!activeYear) {
    return jsonError("ยังไม่มีปีการศึกษาที่เปิดใช้งาน — กรุณาเปิดปีการศึกษาก่อนนำเข้านักเรียน", 400);
  }

  const classrooms = await prisma.classroom.findMany({
    where: { academicYearId: activeYear.id },
    select: { id: true, name: true },
  });
  const classroomByName = new Map(classrooms.map((c) => [c.name, c.id]));

  // ตรวจรูปแบบทุกแถวก่อน แล้วเช็ครหัสซ้ำทั้งใน DB และซ้ำกันเองในไฟล์
  type ValidRow = {
    line: number;
    studentCode: string;
    firstName: string;
    lastName: string;
    classroomId: string;
  };
  const valid: ValidRow[] = [];
  const skipped: { line: number; studentCode: string; reason: string }[] = [];
  const seenCodes = new Set<string>();

  rowsInput.forEach((raw, i) => {
    const line = typeof raw.line === "number" ? raw.line : i + 1;
    const studentCode = cleanString(raw.studentCode, 20);
    const firstName = cleanString(raw.firstName);
    const lastName = cleanString(raw.lastName);
    const classroomName = cleanString(raw.classroomName, 50);

    if (!studentCode || !firstName || !lastName || !classroomName) {
      skipped.push({
        line,
        studentCode: studentCode ?? "-",
        reason: "ข้อมูลไม่ครบ (ต้องมี studentCode, firstName, lastName, classroomName)",
      });
      return;
    }
    if (seenCodes.has(studentCode)) {
      skipped.push({ line, studentCode, reason: "รหัสนักเรียนซ้ำกันเองในไฟล์" });
      return;
    }
    const classroomIdOfRow = classroomByName.get(classroomName);
    if (!classroomIdOfRow) {
      skipped.push({
        line,
        studentCode,
        reason: `ไม่พบห้องเรียน "${classroomName}" ในปีการศึกษา ${activeYear.year}`,
      });
      return;
    }
    seenCodes.add(studentCode);
    valid.push({ line, studentCode, firstName, lastName, classroomId: classroomIdOfRow });
  });

  // รหัสที่มีอยู่แล้วใน DB
  const existing = await prisma.student.findMany({
    where: { studentCode: { in: valid.map((r) => r.studentCode) } },
    select: { studentCode: true },
  });
  const existingCodes = new Set(existing.map((s) => s.studentCode));

  let created = 0;
  for (const row of valid) {
    if (existingCodes.has(row.studentCode)) {
      skipped.push({ line: row.line, studentCode: row.studentCode, reason: "รหัสนักเรียนมีอยู่ในระบบแล้ว" });
      continue;
    }
    // nested create: นักเรียน + บัญชีปี active ในคำสั่งเดียว (atomic ต่อคน)
    await prisma.student.create({
      data: {
        studentCode: row.studentCode,
        firstName: row.firstName,
        lastName: row.lastName,
        classroomId: row.classroomId,
        status: "ACTIVE",
        accounts: {
          create: { academicYearId: activeYear.id, openingBalance: 0, balance: 0 },
        },
      },
    });
    created += 1;
  }

  return NextResponse.json({ created, skipped });
}
