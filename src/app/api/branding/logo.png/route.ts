/**
 * GET /api/branding/logo.png — เสิร์ฟโลโก้โรงเรียน (PUBLIC — หน้า login ใช้)
 *
 * ลำดับการเลือกไฟล์:
 *   1) โลโก้ที่อัปโหลดล่าสุด (SchoolSetting.logoFileName ผ่าน readUpload("logo", ...))
 *   2) fallback: public/logo.png (ไฟล์ default ที่ติดมากับระบบ)
 *   3) ถ้าอ่านไฟล์ default ไม่ได้ -> redirect ไปไฟล์ static /logo.png (กันพลาดสุดทาง)
 *
 * ทำไม path มี ".png": middleware (matcher) กันทุก /api/* ที่ไม่ใช่ /api/auth ให้เป็น
 * 401 เมื่อยังไม่ล็อกอิน — แต่ path ที่ "มีจุด" ถูกยกเว้นจาก matcher (ถือเป็นไฟล์ static)
 * จึงตั้งชื่อ segment เป็น logo.png เพื่อให้เข้าถึงได้โดยไม่ต้องแตะ middleware
 * (รายละเอียด/ข้อเสนอปรับ middleware อยู่ใน NOTES2-B1.md)
 *
 * Cache: no-cache + ETag (อิงชื่อไฟล์ที่สุ่มใหม่ทุกครั้งที่อัปโหลด) —
 * เบราว์เซอร์ revalidate ทุกครั้ง เห็นโลโก้ใหม่ทันทีหลังเปลี่ยน แต่ได้ 304 ถ้าไม่เปลี่ยน
 */
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getSchoolSetting } from "@/lib/settings";
import { readUpload } from "@/lib/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function imageResponse(
  data: Buffer,
  contentType: "image/png" | "image/jpeg",
  etag: string,
  req: Request
): NextResponse {
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "no-cache, must-revalidate");
  headers.set("ETag", etag);

  // ถ้า client มี copy เดิม (ETag ตรง) -> 304 ไม่ต้องส่ง body ซ้ำ
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  headers.set("Content-Length", String(data.length));
  return new NextResponse(new Uint8Array(data), { status: 200, headers });
}

export async function GET(req: Request) {
  // 1) โลโก้ที่อัปโหลด
  const setting = await getSchoolSetting();
  if (setting.logoFileName) {
    try {
      const { data, contentType } = await readUpload("logo", setting.logoFileName);
      return imageResponse(data, contentType, `"logo-${setting.logoFileName}"`, req);
    } catch (e) {
      // ไฟล์หาย/อ่านไม่ได้ -> ตกไป fallback ด้านล่าง
      console.error("branding/logo: อ่านโลโก้อัปโหลดไม่ได้ ใช้ default แทน:", e);
    }
  }

  // 2) fallback: public/logo.png (runtime cwd = /app ใน standalone, มี public/ ที่ COPY มา)
  try {
    const data = await fs.readFile(path.join(process.cwd(), "public", "logo.png"));
    return imageResponse(data, "image/png", '"logo-default"', req);
  } catch (e) {
    console.error("branding/logo: อ่าน public/logo.png ไม่ได้:", e);
  }

  // 3) สุดทาง: ให้ static handler ของ Next เสิร์ฟ /logo.png เอง
  return NextResponse.redirect(new URL("/logo.png", req.url), 307);
}
