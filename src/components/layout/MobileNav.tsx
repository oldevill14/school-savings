"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/auth";
import { getNavItems, isNavActive } from "./nav-items";

export interface MobileNavProps {
  role: Role;
}

/** จำนวนช่องสูงสุดของแถบเมนูล่าง */
const MAX_SLOTS = 5;

/**
 * แถบเมนูล่างสำหรับมือถือ (ซ่อนบน desktop)
 * - เมนู ≤ 5 รายการ: แสดงทั้งหมด
 * - เมนู > 5 รายการ (ADMIN): แสดง 4 รายการแรก + ปุ่ม "เพิ่มเติม"
 *   เปิด bottom sheet รวมเมนูที่เหลือ (ห้องเรียน / ปีการศึกษา / ผู้ใช้)
 */
export default function MobileNav({ role }: MobileNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const allItems = getNavItems(role);
  const hasOverflow = allItems.length > MAX_SLOTS;
  const primaryItems = hasOverflow ? allItems.slice(0, MAX_SLOTS - 1) : allItems;
  const overflowItems = hasOverflow ? allItems.slice(MAX_SLOTS - 1) : [];

  // ปิด bottom sheet ทุกครั้งที่เปลี่ยนหน้า
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const overflowActive = overflowItems.some((item) => isNavActive(pathname, item.href));

  return (
    <>
      {/* Bottom sheet เมนูเพิ่มเติม */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="เมนูเพิ่มเติม">
          {/* ฉากหลัง — แตะเพื่อปิด */}
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="ปิดเมนูเพิ่มเติม"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-white pb-16 shadow-card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-sm font-semibold text-navy">เมนูเพิ่มเติม</span>
              <button
                type="button"
                className="rounded-lg p-1 text-slate-400 hover:bg-surface hover:text-navy"
                aria-label="ปิด"
                onClick={() => setMoreOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-2 py-2">
              {overflowItems.map((item) => {
                const active = isNavActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-sm",
                      active ? "bg-surface font-semibold text-navy" : "text-slate-600 hover:bg-surface"
                    )}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMoreOpen(false)}
                  >
                    <Icon className={cn("h-5 w-5 shrink-0", active ? "text-navy" : "text-slate-400")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* แถบเมนูล่าง */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-line bg-white lg:hidden">
        {primaryItems.map((item) => {
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]",
                active ? "font-semibold text-navy" : "text-slate-500"
              )}
              aria-current={active ? "page" : undefined}
              onClick={() => setMoreOpen(false)}
            >
              <Icon className={cn("h-5 w-5", active ? "text-navy" : "text-slate-400")} />
              {item.label}
            </Link>
          );
        })}

        {hasOverflow && (
          <button
            type="button"
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]",
              moreOpen || overflowActive ? "font-semibold text-navy" : "text-slate-500"
            )}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            onClick={() => setMoreOpen((open) => !open)}
          >
            <MoreHorizontal
              className={cn("h-5 w-5", moreOpen || overflowActive ? "text-navy" : "text-slate-400")}
            />
            เพิ่มเติม
          </button>
        )}
      </nav>
    </>
  );
}
