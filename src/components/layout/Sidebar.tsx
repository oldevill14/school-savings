"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/auth";
import { getNavItems, isNavActive } from "./nav-items";

export interface SidebarProps {
  role: Role;
  /** ปีการศึกษาที่เปิดใช้งาน (พ.ศ.) — null ถ้ายังไม่มีปี active */
  year?: number | null;
}

/**
 * Sidebar หลัก (desktop เท่านั้น — มือถือใช้ MobileNav)
 * เมนูถูกกรองตาม role ผ่าน getNavItems
 */
export default function Sidebar({ role, year = null }: SidebarProps) {
  const pathname = usePathname();
  const items = getNavItems(role);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-navy text-white lg:flex">
      {/* หัว sidebar */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-gold/20">
          {/* โลโก้ระบบ — เปลี่ยนได้โดยแทนที่ไฟล์ public/logo.png (ดู README หัวข้อ "เปลี่ยนโลโก้") */}
          <img src="/logo.png" alt="ตราโรงเรียน" className="h-7 w-7 object-contain" />
        </span>
        <div>
          <div className="text-sm font-semibold leading-tight">โรงเรียนบ้านกะดาด</div>
          <div className="text-xs text-white/60">ระบบออมทรัพย์นักเรียน</div>
        </div>
      </div>

      {/* เมนู */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-white/10 font-semibold text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={cn("h-5 w-5 shrink-0", active && "text-gold-light")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* ท้าย sidebar */}
      <div className="border-t border-white/10 px-5 py-4 text-xs text-white/50">
        {year !== null && (
          <>
            ปีการศึกษา {year}
            <br />
          </>
        )}
        สพป.สุรินทร์ เขต 3
      </div>
    </aside>
  );
}
