/**
 * API รูปนักเรียน — POST อัปโหลด/เปลี่ยนรูป · DELETE ลบรูป
 *
 * สิทธิ์: ADMIN ทุกคน · TEACHER เฉพาะนักเรียนในห้องประจำชั้นของตน
 *
 * - POST (multipart/form-data, field "photo")
 *     -> saveUpload("students", file)  (validate png/jpg + <=2MB ให้แล้ว)
 *     -> update Student.photoFileName + logAudit(PHOTO_UPDATE)
 * - DELETE
 *     -> set Student.photoFileName = null (ไฟล์บนดิสก์ยังอยู่ ตามหลัก "ไม่มีอะไรถูกลบ")
 *     -> logAudit(PHOTO_UPDATE)
 *
 * หมายเหตุ: เปลี่ยนรูปจะเก็บไฟล์ใหม่ (ชื่อสุ่ม) แล้วชี้ pointer ไปไฟล์ใหม่ —
 * ไฟล์เก่าคงอยู่บนดิสก์ (ไม่ลบ) สอดคล้องหลักการรักษาประวัติศาสตร์
 *
 * ต้องใช้ nodejs runtime เพราะ @/lib/files เขียนไฟล์ผ่าน fs
 */
import { NextResponse } from "next/server";
import { requireRoleApi, AuthError, type SessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveUpload, FileValidationError } from "@/lib/files";
import { logAudit, AuditAction } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

type ManageableStudent = {
  id: string;
  studentCode: string;
  photoFileName: string | null;
};

/** โหลดนักเรียน + เช็คสิทธิ์จัดการรูป (ADMIN ทุกคน / TEACHER เฉพาะห้องประจำชั้นของตน) */
async function loadManageableStudent(
  session: SessionPayload,
  id: string
): Promise<{ ok: true; student: ManageableStudent } | { ok: false; response: NextResponse }> {
  const student = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      studentCode: true,
      photoFileName: true,
      classroom: { select: { teacherId: true } },
    },
  });
  if (!student) {
    return { ok: false, response: jsonError("ไม่พบข้อมูลนักเรียน", 404) };
  }
  if (session.role === "TEACHER" && student.classroom.teacherId !== session.userId) {
    return {
      ok: false,
      response: jsonError("ไม่มีสิทธิ์จัดการรูปของนักเรียนนอกห้องประจำชั้นของท่าน", 403),
    };
  }
  return {
    ok: true,
    student: {
      id: student.id,
      studentCode: student.studentCode,
      photoFileName: student.photoFileName,
    },
  };
}

// ---------- POST: อัปโหลด/เปลี่ยนรูป ----------

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRoleApi(["ADMIN", "TEACHER"]);
    const { id } = await params;

    const loaded = await loadManageableStudent(session, id);
    if (!loaded.ok) return loaded.response;

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return jsonError("รูปแบบข้อมูลไม่ถูกต้อง", 400);
    }

    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      return jsonError("กรุณาเลือกไฟล์รูปนักเรียน", 400);
    }

    // saveUpload validate ชนิด (png/jpg) + ขนาด (<=2MB) ให้แล้ว โยน FileValidationError ถ้าไม่ผ่าน
    const { fileName } = await saveUpload("students", file);
    await prisma.student.update({
      where: { id: loaded.student.id },
      data: { photoFileName: fileName },
    });

    await logAudit({
      userId: session.userId,
      action: AuditAction.PHOTO_UPDATE,
      detail: `อัปโหลดรูปนักเรียน ${loaded.student.studentCode}: ${fileName}`,
    });

    return NextResponse.json({ ok: true, photoFileName: fileName });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    if (e instanceof FileValidationError) return jsonError(e.message, e.status);
    console.error("POST /api/students/[id]/photo ล้มเหลว:", e);
    return jsonError("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", 500);
  }
}

// ---------- DELETE: ลบรูป (ล้าง pointer เท่านั้น) ----------

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRoleApi(["ADMIN", "TEACHER"]);
    const { id } = await params;

    const loaded = await loadManageableStudent(session, id);
    if (!loaded.ok) return loaded.response;

    if (!loaded.student.photoFileName) {
      return jsonError("นักเรียนคนนี้ยังไม่มีรูป", 400);
    }

    await prisma.student.update({
      where: { id: loaded.student.id },
      data: { photoFileName: null },
    });

    await logAudit({
      userId: session.userId,
      action: AuditAction.PHOTO_UPDATE,
      detail: `ลบรูปนักเรียน ${loaded.student.studentCode}`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    console.error("DELETE /api/students/[id]/photo ล้มเหลว:", e);
    return jsonError("ลบรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", 500);
  }
}
