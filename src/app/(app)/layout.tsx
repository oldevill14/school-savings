import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

  // ปีการศึกษาที่ active — ส่งให้ Sidebar/Topbar (ห้าม hardcode เพราะปิดปี/เปิดปีใหม่ได้)
  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { year: true },
  });
  const year = activeYear?.year ?? null;

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar role={session.role} year={year} />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <Topbar name={session.name} role={session.role} year={year} />
        <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
      </div>
      <MobileNav role={session.role} />
    </div>
  );
}
