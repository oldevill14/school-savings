import type { Metadata } from "next";
import { Sarabun } from "next/font/google";
import { getSchoolSetting, DEFAULT_SCHOOL_SETTING } from "@/lib/settings";
import "./globals.css";

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sarabun",
  display: "swap",
});

// อ่านชื่อโรงเรียน/สังกัดจากตั้งค่า (เปลี่ยนได้ที่ /settings) — ห้าม hardcode ชื่อโรงเรียน
// metadata อยู่ใน <head> ของทุกหน้า จึงกัน error ไว้ด้วย DEFAULT (DB ล่มไม่ควรทำทั้งหน้าพัง)
export async function generateMetadata(): Promise<Metadata> {
  let setting = DEFAULT_SCHOOL_SETTING;
  try {
    setting = await getSchoolSetting();
  } catch (e) {
    console.error("generateMetadata: อ่านตั้งค่าโรงเรียนไม่ได้ ใช้ค่าเริ่มต้น:", e);
  }
  const { schoolName, schoolArea } = setting;
  const siteTitle = `ระบบออมทรัพย์${schoolName}`;
  return {
    title: {
      default: siteTitle,
      template: `%s | ${siteTitle}`,
    },
    description: `ระบบออมทรัพย์นักเรียน ${schoolName} ${schoolArea}`,
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={sarabun.variable}>
      <body className="font-sarabun bg-surface text-slate-800 antialiased">
        {children}
      </body>
    </html>
  );
}
