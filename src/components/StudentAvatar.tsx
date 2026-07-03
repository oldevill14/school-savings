/**
 * StudentAvatar — รูปนักเรียนแบบวงกลม ใช้ซ้ำได้ทั้งตารางรายชื่อและหน้าโปรไฟล์
 *
 * - มีรูป (photoFileName)  -> เสิร์ฟผ่าน GET /api/files/students/<name> (role-guarded)
 * - ไม่มีรูป               -> อักษรตัวแรกของชื่อบนพื้น navy
 *
 * เป็น "shared component" (ไม่มี "use client" และไม่ import ของฝั่ง server) จึงใช้ได้
 * ทั้งใน Server Component (หน้า detail) และ Client Component (ตารางรายชื่อ, ตัวจัดการรูป)
 *
 * ใช้:
 *   <StudentAvatar photoFileName={s.photoFileName} name={`${s.firstName} ${s.lastName}`} size="sm" />
 *   // ใส่ version เพื่อ bust cache หลังเปลี่ยนรูป (เช่น Date.now())
 */
import { cn } from "@/lib/utils";

export type StudentAvatarSize = "sm" | "md" | "lg";

export interface StudentAvatarProps {
  /** basename ของรูป (Student.photoFileName) — null/undefined = แสดงอักษรย่อ */
  photoFileName?: string | null;
  /** ชื่อสำหรับ alt + อักษรย่อ (ใช้อักขระแรก) */
  name: string;
  size?: StudentAvatarSize;
  /** ต่อท้าย ?v= เพื่อบังคับโหลดรูปใหม่หลังเปลี่ยน (เช่น Date.now()) */
  version?: string | number;
  className?: string;
}

const SIZE_CLASSES: Record<StudentAvatarSize, string> = {
  sm: "h-9 w-9 text-sm",
  md: "h-12 w-12 text-base",
  lg: "h-28 w-28 text-4xl",
};

/** อักขระแรกของชื่อ (รองรับ surrogate pair) — คืน "?" ถ้าชื่อว่าง */
function initial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return Array.from(trimmed)[0].toUpperCase();
}

export default function StudentAvatar({
  photoFileName,
  name,
  size = "md",
  version,
  className,
}: StudentAvatarProps) {
  const base = cn(
    "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full",
    SIZE_CLASSES[size],
    className
  );

  if (photoFileName) {
    const q = version !== undefined ? `?v=${encodeURIComponent(String(version))}` : "";
    const src = `/api/files/students/${encodeURIComponent(photoFileName)}${q}`;
    return (
      <span className={cn(base, "bg-surface ring-1 ring-line")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`รูปของ ${name}`} className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span
      className={cn(base, "bg-navy font-semibold text-white")}
      role="img"
      aria-label={`ยังไม่มีรูปของ ${name}`}
      title={name}
    >
      {initial(name)}
    </span>
  );
}
