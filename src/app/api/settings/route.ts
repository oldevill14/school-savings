/**
 * API ตั้งค่าโรงเรียน (SchoolSetting) — ADMIN เท่านั้น
 *
 * GET  -> ค่าปัจจุบัน { schoolName, schoolArea, hasLogo }
 * PUT  -> แก้ชื่อโรงเรียน + เขตพื้นที่ { schoolName, schoolArea }
 *
 * โลโก้แยกไปที่ POST /api/settings/logo (multipart) เพราะต้องใช้ nodejs runtime + fs
 * middleware กัน /settings = ADMIN ให้แล้ว แต่ handler ยังเช็ค requireRoleApi ซ้ำเสมอ
 */
import { NextResponse } from "next/server";
import { requireRoleApi, AuthError } from "@/lib/auth";
import { getSchoolSetting, updateSchoolSetting } from "@/lib/settings";
import { logAudit, AuditAction } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** ความยาวสูงสุดของชื่อโรงเรียน / เขตพื้นที่ */
const MAX_NAME = 120;

function errorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("api/settings:", e);
  return NextResponse.json(
    { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
    { status: 500 }
  );
}

/** ตรวจข้อความ — ต้องเป็นสตริงไม่ว่าง และยาวไม่เกิน MAX_NAME */
function validateText(raw: unknown, label: string): { value?: string; error?: string } {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { error: `กรุณากรอก${label}` };
  }
  const value = raw.trim();
  if (value.length > MAX_NAME) {
    return { error: `${label}ยาวเกิน ${MAX_NAME} ตัวอักษร` };
  }
  return { value };
}

export async function GET() {
  try {
    await requireRoleApi(["ADMIN"]);
    const setting = await getSchoolSetting();
    return NextResponse.json({
      schoolName: setting.schoolName,
      schoolArea: setting.schoolArea,
      hasLogo: setting.logoFileName !== null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    const session = await requireRoleApi(["ADMIN"]);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, { status: 400 });
    }

    const nameCheck = validateText(body.schoolName, "ชื่อโรงเรียน");
    if (nameCheck.error) {
      return NextResponse.json({ error: nameCheck.error }, { status: 400 });
    }
    const areaCheck = validateText(body.schoolArea, "สังกัด/เขตพื้นที่");
    if (areaCheck.error) {
      return NextResponse.json({ error: areaCheck.error }, { status: 400 });
    }

    const setting = await updateSchoolSetting({
      schoolName: nameCheck.value!,
      schoolArea: areaCheck.value!,
    });

    await logAudit({
      userId: session.userId,
      action: AuditAction.SETTINGS_UPDATE,
      detail: `ชื่อโรงเรียน: ${setting.schoolName} · สังกัด: ${setting.schoolArea}`,
    });

    return NextResponse.json({
      ok: true,
      setting: {
        schoolName: setting.schoolName,
        schoolArea: setting.schoolArea,
        hasLogo: setting.logoFileName !== null,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
