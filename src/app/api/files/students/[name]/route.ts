/**
 * GET /api/files/students/[name] — เสิร์ฟรูปนักเรียนแบบ role-guarded
 *
 * สิทธิ์:
 * - ADMIN / TEACHER / EXECUTIVE : ดูรูปนักเรียนได้ทุกคน
 * - PARENT                      : ดูได้เฉพาะรูปของบุตรที่ผูกไว้ (session.studentIds)
 *   -> ต้อง lookup ว่ารูปเป็นของนักเรียนคนไหน แล้วเทียบกับ studentIds
 *
 * ความปลอดภัย:
 * - กัน path traversal ผ่าน readUpload("students", name) (whitelist basename + ตรวจ resolved path)
 * - middleware ปล่อยผ่าน path นี้ (ชื่อไฟล์มี "." = ถูกยกเว้นจาก matcher) จึงต้องเช็คสิทธิ์
 *   เองครบผ่าน requireRoleApi (ไม่มีด่าน middleware มาช่วย)
 *
 * ต้องใช้ nodejs runtime เพราะ @/lib/files อ่านไฟล์ผ่าน fs
 */
import { NextResponse } from "next/server";
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readUpload, FileValidationError } from "@/lib/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const session = await requireRoleApi(["ADMIN", "TEACHER", "PARENT", "EXECUTIVE"]);
    const { name } = await params;

    // PARENT: รูปต้องเป็นของบุตรที่ผูกไว้เท่านั้น
    if (session.role === "PARENT") {
      const owner = await prisma.student.findFirst({
        where: { photoFileName: name },
        select: { id: true },
      });
      if (!owner || !session.studentIds.includes(owner.id)) {
        return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงรูปนี้" }, { status: 403 });
      }
    }

    const { data, contentType } = await readUpload("students", name);

    // ETag อิงชื่อไฟล์ (สุ่มใหม่ทุกครั้งที่อัปโหลด) — เปลี่ยนรูป = ETag เปลี่ยน เห็นทันที
    const etag = `"student-${name}"`;
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "private, no-cache, must-revalidate");
    headers.set("ETag", etag);

    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers });
    }
    headers.set("Content-Length", String(data.length));
    return new NextResponse(new Uint8Array(data), { status: 200, headers });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof FileValidationError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    // ไฟล์หาย/ถูกลบออกจากดิสก์ -> 404 (เช่นเปลี่ยนรูปแล้วแคชเก่ายังชี้ไฟล์เดิม)
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
      return NextResponse.json({ error: "ไม่พบไฟล์รูป" }, { status: 404 });
    }
    console.error("GET /api/files/students/[name] ล้มเหลว:", e);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดในการโหลดรูป" }, { status: 500 });
  }
}
