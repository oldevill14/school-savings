/**
 * รวม class names — กรองค่า falsy ออก
 *
 * ใช้: cn("px-4", isActive && "bg-navy", className)
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
