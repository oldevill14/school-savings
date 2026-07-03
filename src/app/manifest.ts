/**
 * PWA manifest (dynamic) — Next.js เสิร์ฟที่ /manifest.webmanifest อัตโนมัติ
 * และแทรก <link rel="manifest"> ให้เองโดยไม่ต้องแก้ root layout
 *
 * name/short_name อ่านจาก getSchoolSetting() (server-only) เพื่อให้สะท้อนชื่อโรงเรียน
 * ที่แอดมินตั้งไว้ — force-dynamic เพื่อไม่ให้ค่าค้างที่ build time
 * (มี try/catch fallback เป็น default กัน build ล้มตอนยังต่อ DB ไม่ได้)
 *
 * icons: public/icon-192.png, public/icon-512.png (สร้างจาก logo.png)
 * apple-touch-icon จัดการผ่านไฟล์ convention src/app/apple-icon.png (Next แทรก link ให้เอง)
 */
import type { MetadataRoute } from "next";
import { getSchoolSetting, DEFAULT_SCHOOL_SETTING } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let schoolName = DEFAULT_SCHOOL_SETTING.schoolName;
  try {
    const setting = await getSchoolSetting();
    schoolName = setting.schoolName || DEFAULT_SCHOOL_SETTING.schoolName;
  } catch {
    // ยังต่อ DB ไม่ได้ (เช่น ตอน build) — ใช้ชื่อ default
  }

  return {
    name: `${schoolName} — ระบบออมทรัพย์`,
    short_name: "ออมทรัพย์",
    description: `ระบบออมทรัพย์นักเรียน ${schoolName}`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F5F7FA",
    theme_color: "#1E3A5F",
    lang: "th",
    dir: "ltr",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
