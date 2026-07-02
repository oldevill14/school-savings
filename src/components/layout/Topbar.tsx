import { LogOut, UserRound } from "lucide-react";
import type { Role } from "@/lib/auth";

export interface TopbarProps {
  name: string;
  role: Role;
  /** ปีการศึกษาที่เปิดใช้งาน (พ.ศ.) — null ถ้ายังไม่มีปี active */
  year?: number | null;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "ผู้ดูแลระบบ",
  TEACHER: "ครูประจำชั้น",
  PARENT: "ผู้ปกครอง",
};

/**
 * แถบบนสุด — ชื่อผู้ใช้ + role + ปุ่มออกจากระบบ
 *
 * ปุ่มออกจากระบบเป็น HTML form POST -> /api/auth/logout (ไม่ต้องใช้ JS)
 * ทีม auth ต้องทำ route ดังกล่าวให้ destroySession แล้ว redirect 303 ไป /login
 */
export default function Topbar({ name, role, year = null }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-white px-4 lg:px-6">
      {/* ชื่อระบบ (มือถือ) / บรรทัดบริบท (desktop) */}
      <div className="font-semibold text-navy lg:hidden">ออมทรัพย์ รร.บ้านกะดาด</div>
      <div className="hidden text-sm text-slate-500 lg:block">
        ระบบออมทรัพย์นักเรียน{year !== null ? ` ปีการศึกษา ${year}` : ""}
      </div>

      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy/10">
          <UserRound className="h-5 w-5 text-navy" />
        </span>
        <div className="text-right">
          <div className="text-sm font-semibold leading-tight text-slate-900">{name}</div>
          <div className="text-xs text-slate-500">{ROLE_LABELS[role]}</div>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-withdraw"
            title="ออกจากระบบ"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </button>
        </form>
      </div>
    </header>
  );
}
