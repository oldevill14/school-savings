/**
 * API อัปโหลดโลโก้โรงเรียน — ADMIN เท่านั้น
 *
 * POST (multipart/form-data, field "logo") -> saveUpload("logo", file)
 *   -> updateSchoolSetting({ logoFileName }) -> logAudit(LOGO_UPDATE)
 *
 * ต้องใช้ nodejs runtime เพราะ @/lib/files เขียนไฟล์ผ่าน fs
 * โลโก้ถูกเสิร์ฟกลับ (public) ที่ GET /api/branding/logo.png
 */
import { NextResponse } from "next/server";
import { requireRoleApi, AuthError } from "@/lib/auth";
import { saveUpload, FileValidationError } from "@/lib/files";
import { updateSchoolSetting } from "@/lib/settings";
import { logAudit, AuditAction } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await requireRoleApi(["ADMIN"]);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    const file = form.get("logo");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "กรุณาเลือกไฟล์โลโก้" }, { status: 400 });
    }

    // saveUpload validate ชนิด (png/jpg) + ขนาด (<=2MB) ให้แล้ว โยน FileValidationError ถ้าไม่ผ่าน
    const { fileName } = await saveUpload("logo", file);
    const setting = await updateSchoolSetting({ logoFileName: fileName });

    await logAudit({
      userId: session.userId,
      action: AuditAction.LOGO_UPDATE,
      detail: `อัปโหลดโลโก้ใหม่: ${fileName}`,
    });

    return NextResponse.json({
      ok: true,
      logoFileName: setting.logoFileName,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof FileValidationError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("api/settings/logo:", e);
    return NextResponse.json(
      { error: "อัปโหลดโลโก้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
