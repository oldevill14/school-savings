import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSchoolSetting } from "@/lib/settings";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import MobileNav from "@/components/layout/MobileNav";

/**
 * Layout ของโซนหลังบ้าน (ทุกหน้าใน route group "(app)")
 * — Server Component: อ่าน session แล้วประกอบ Sidebar + Topbar + MobileNav
 *
 * ทีม feature: วางหน้าไว้ใต้ src/app/(app)/... เพื่อให้ได้ layout นี้อัตโนมัติ
 * (ยกเว้น /login ที่อยู่นอก group)
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  if (!session) redirect("/login");

  // ปีการศึกษาที่ active + ตั้งค่าโรงเรียน — ส่งให้ Sidebar/Topbar
  // (ห้าม hardcode: ปิดปี/เปิดปีใหม่ได้ และชื่อ/สังกัด/โลโก้เปลี่ยนได้ที่ /settings)
  const [activeYear, setting] = await Promise.all([
    prisma.academicYear.findFirst({ where: { isActive: true }, select: { year: true } }),
    getSchoolSetting(),
  ]);
  const year = activeYear?.year ?? null;

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar
        role={session.role}
        year={year}
        schoolName={setting.schoolName}
        schoolArea={setting.schoolArea}
      />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <Topbar
          name={session.name}
          role={session.role}
          year={year}
          schoolName={setting.schoolName}
        />
        <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
      </div>
      <MobileNav role={session.role} />
    </div>
  );
}
