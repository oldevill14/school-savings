/**
 * หน้า /login — อยู่นอก route group (app) จึงไม่มี Sidebar/Topbar
 * middleware ยกเว้น path นี้แล้ว — แต่ถ้า login อยู่แล้วให้เด้งไปหน้าหลักของ role
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSchoolSetting } from "@/lib/settings";
import LoginCard from "@/components/LoginCard";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ",
};

// อ่าน cookie (getSession) + searchParams — ต้อง render แบบ dynamic เสมอ
export const dynamic = "force-dynamic";

/** กรอง ?next= ให้เหลือเฉพาะ path ภายในที่ปลอดภัย (กัน open redirect) */
function sanitizeNextPath(next: string | undefined): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/")) return null; // ต้องเป็น path ภายในเท่านั้น
  if (next.startsWith("//") || next.startsWith("/\\")) return null; // กัน protocol-relative
  if (next === "/login" || next.startsWith("/login/")) return null;
  if (next.startsWith("/api")) return null;
  return next;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (session) {
    redirect(session.role === "PARENT" ? "/my-child" : "/dashboard");
  }

  const { next } = await searchParams;
  const nextPath = sanitizeNextPath(next);

  // ปีการศึกษาที่ active + ตั้งค่าโรงเรียน — แสดงบนหน้า login
  // (ห้าม hardcode: ปิดปี/เปิดปีใหม่ได้ และชื่อ/สังกัดเปลี่ยนได้ที่ /settings)
  const [activeYear, setting] = await Promise.all([
    prisma.academicYear.findFirst({ where: { isActive: true }, select: { year: true } }),
    getSchoolSetting(),
  ]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4 sm:p-6 lg:p-8">
      <LoginCard
        nextPath={nextPath}
        year={activeYear?.year ?? null}
        schoolName={setting.schoolName}
        schoolArea={setting.schoolArea}
      />
    </main>
  );
}
