/**
 * นิยามเมนูกลาง — ใช้ร่วมกันระหว่าง Sidebar และ MobileNav
 */
import {
  LayoutDashboard,
  PlusCircle,
  History,
  GraduationCap,
  BarChart3,
  School,
  CalendarDays,
  UserCog,
  PiggyBank,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/auth";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

/**
 * เมนูทั้งหมดของระบบ เรียงตามลำดับที่แสดง
 * - ADMIN เห็นทุกเมนู (ยกเว้น /my-child)
 * - TEACHER เห็น 5 เมนูแรก
 * - PARENT เห็นเฉพาะ "ยอดของลูก"
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard, roles: ["ADMIN", "TEACHER"] },
  { href: "/transactions/new", label: "บันทึกฝาก-ถอน", icon: PlusCircle, roles: ["ADMIN", "TEACHER"] },
  { href: "/transactions", label: "ประวัติธุรกรรม", icon: History, roles: ["ADMIN", "TEACHER"] },
  { href: "/students", label: "นักเรียน", icon: GraduationCap, roles: ["ADMIN", "TEACHER"] },
  { href: "/reports", label: "รายงาน", icon: BarChart3, roles: ["ADMIN", "TEACHER"] },
  { href: "/classrooms", label: "ห้องเรียน", icon: School, roles: ["ADMIN"] },
  { href: "/academic-years", label: "ปีการศึกษา", icon: CalendarDays, roles: ["ADMIN"] },
  { href: "/users", label: "ผู้ใช้", icon: UserCog, roles: ["ADMIN"] },
  { href: "/my-child", label: "ยอดของลูก", icon: PiggyBank, roles: ["PARENT"] },
];

/** กรองเมนูตาม role */
export function getNavItems(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/**
 * เช็คว่าเมนู active หรือไม่
 * กรณีพิเศษ: /transactions ไม่ active เมื่ออยู่ที่ /transactions/new
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/transactions") {
    return (
      pathname === href ||
      (pathname.startsWith("/transactions/") && !pathname.startsWith("/transactions/new"))
    );
  }
  return pathname === href || pathname.startsWith(href + "/");
}
