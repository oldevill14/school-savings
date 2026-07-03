/**
 * API จัดการผู้ใช้ — ADMIN เท่านั้น
 *
 * GET  -> รายการผู้ใช้ทั้งหมด + รายชื่อนักเรียน ACTIVE (สำหรับผูกผู้ปกครอง) + me (userId ของผู้เรียก)
 * POST -> สร้างผู้ใช้ใหม่ { username, name, role, linkedStudentId? } — สุ่มรหัสผ่าน 8 ตัว คืนครั้งเดียว
 *
 * หมายเหตุ (รอบขยายฟีเจอร์): ผู้ปกครองผูกนักเรียนผ่านตาราง Guardian แล้ว (แทน User.linkedStudentId)
 * ฟอร์มปัจจุบันยังผูกได้ทีละคน (สร้าง Guardian 1 แถว) — ทีม family (B3) ต่อยอดเป็นหลายคนได้
 * โดยยิง POST /api/users/... หรือ endpoint ผูกเพิ่มในภายหลัง; response ยังคง field `linkedStudent`
 * (คนแรก) ไว้เพื่อ backward-compat + เพิ่ม `linkedStudents` (array) สำหรับ UI ใหม่
 *
 * หมายเหตุ "ปิดใช้งาน": schema ไม่มีฟิลด์ isActive — ใช้วิธีเติม prefix "DISABLED:" หน้า
 * passwordHash (bcrypt.compare กับค่าที่มี prefix จะไม่ผ่านเสมอ = ล็อกอินไม่ได้ และถอด prefix
 * กลับคืนได้ = เปิดใช้งานใหม่โดยไม่ลบข้อมูล) — ดูรายละเอียด/ข้อจำกัดใน NOTES-admin.md
 */
import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { requireRoleApi, hashPassword, AuthError, type Role } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const DISABLED_PREFIX = "DISABLED:";
const VALID_ROLES: Role[] = ["ADMIN", "TEACHER", "PARENT", "EXECUTIVE"];
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

/** สุ่มรหัสผ่าน 8 ตัว — ตัดตัวอักษรที่อ่านสับสน (0/O, 1/l/I) ออก
 *  (ประกาศซ้ำใน users/[id]/route.ts ด้วย — route file ห้าม export อะไรนอกจาก handler) */
const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function generatePassword(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PASSWORD_CHARS[randomInt(PASSWORD_CHARS.length)];
  }
  return out;
}

function errorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("api/users:", e);
  return NextResponse.json(
    { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
    { status: 500 }
  );
}

export async function GET() {
  try {
    const session = await requireRoleApi(["ADMIN"]);

    const [users, students] = await Promise.all([
      prisma.user.findMany({
        orderBy: [{ role: "asc" }, { username: "asc" }],
        include: {
          guardians: {
            include: {
              student: {
                select: { id: true, studentCode: true, firstName: true, lastName: true },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      prisma.student.findMany({
        where: { status: "ACTIVE" },
        include: { classroom: { select: { name: true } } },
        orderBy: { studentCode: "asc" },
      }),
    ]);

    return NextResponse.json({
      me: session.userId,
      users: users.map((u) => {
        const linkedStudents = u.guardians.map((g) => ({
          id: g.student.id,
          studentCode: g.student.studentCode,
          name: `${g.student.firstName} ${g.student.lastName}`,
        }));
        return {
          id: u.id,
          username: u.username,
          name: u.name,
          role: u.role,
          active: !u.passwordHash.startsWith(DISABLED_PREFIX),
          // backward-compat: บุตรคนแรก (UI เดิมอ่าน field นี้)
          linkedStudent: linkedStudents[0] ?? null,
          // ใหม่: รายชื่อบุตรทั้งหมด (UI ใหม่รองรับหลายคน)
          linkedStudents,
          createdAt: u.createdAt.toISOString(),
        };
      }),
      students: students.map((s) => ({
        id: s.id,
        studentCode: s.studentCode,
        name: `${s.firstName} ${s.lastName}`,
        classroomName: s.classroom.name,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireRoleApi(["ADMIN"]);

    const body = await req.json().catch(() => null);
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const role = body?.role as Role;
    // รองรับผูกนักเรียนหลายคน: linkedStudentIds[] (ใหม่) หรือ linkedStudentId (เดิม, backward-compat)
    const rawIds: unknown = Array.isArray(body?.linkedStudentIds)
      ? body.linkedStudentIds
      : body?.linkedStudentId != null
        ? [body.linkedStudentId]
        : [];
    const linkedStudentIds = [
      ...new Set(
        (rawIds as unknown[]).filter(
          (x): x is string => typeof x === "string" && x !== ""
        )
      ),
    ];

    if (!USERNAME_RE.test(username)) {
      return NextResponse.json(
        { error: "ชื่อผู้ใช้ต้องเป็นอักษรอังกฤษ/ตัวเลข/_ . - ยาว 3-32 ตัวอักษร" },
        { status: 400 }
      );
    }
    if (name.length === 0 || name.length > 100) {
      return NextResponse.json(
        { error: "กรุณาระบุชื่อ-นามสกุล (ไม่เกิน 100 ตัวอักษร)" },
        { status: 400 }
      );
    }
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "บทบาทไม่ถูกต้อง" }, { status: 400 });
    }

    if (role === "PARENT") {
      if (linkedStudentIds.length === 0) {
        return NextResponse.json(
          { error: "ผู้ปกครองต้องเลือกนักเรียนที่ผูกบัญชีอย่างน้อย 1 คน" },
          { status: 400 }
        );
      }
      const found = await prisma.student.findMany({
        where: { id: { in: linkedStudentIds } },
        select: { id: true },
      });
      if (found.length !== linkedStudentIds.length) {
        return NextResponse.json(
          { error: "มีนักเรียนที่เลือกไม่ถูกต้องหรือไม่พบในระบบ" },
          { status: 400 }
        );
      }
    } else if (linkedStudentIds.length > 0) {
      return NextResponse.json(
        { error: "เฉพาะผู้ปกครองเท่านั้นที่ผูกนักเรียนได้" },
        { status: 400 }
      );
    }

    const duplicate = await prisma.user.findUnique({ where: { username } });
    if (duplicate) {
      return NextResponse.json(
        { error: `มีชื่อผู้ใช้ "${username}" อยู่แล้ว` },
        { status: 409 }
      );
    }

    const password = generatePassword(8);
    const passwordHash = await hashPassword(password);
    // สร้าง user (บังคับเปลี่ยนรหัสผ่านครั้งแรกที่ล็อกอิน) + ผูก Guardian ทุกคนในทรานแซกชันเดียว
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { username, passwordHash, role, name, mustChangePassword: true },
      });
      if (role === "PARENT" && linkedStudentIds.length > 0) {
        await tx.guardian.createMany({
          data: linkedStudentIds.map((studentId) => ({
            userId: created.id,
            studentId,
          })),
        });
      }
      return created;
    });

    // password ส่งกลับครั้งเดียว — ไม่ถูกเก็บที่ไหนนอกจาก hash
    return NextResponse.json({
      ok: true,
      user: { id: user.id, username: user.username, name: user.name, role: user.role },
      password,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
