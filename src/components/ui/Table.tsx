import { cn } from "@/lib/utils";

/**
 * ตารางมาตรฐาน — thead น้ำเงินกรมท่า ตัวอักษรขาว, แถว tbody สลับสี
 *
 * ใช้:
 *   <Table>
 *     <THead>
 *       <TR><TH>ชื่อ</TH><TH align="right">จำนวนเงิน</TH></TR>
 *     </THead>
 *     <TBody>
 *       <TR><TD>เด็กชายกิตติศักดิ์ สายบุตร</TD><TD align="right">1,234.50</TD></TR>
 *       <TableEmpty colSpan={2} />  // ใช้เมื่อไม่มีข้อมูล
 *     </TBody>
 *   </Table>
 *
 * กติกา: คอลัมน์จำนวนเงินใช้ align="right" เสมอ (ได้ tabular-nums อัตโนมัติ)
 */

type Align = "left" | "center" | "right";

const ALIGN_CLASSES: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right tabular-nums",
};

export interface TableProps {
  className?: string;
  /** ความกว้างขั้นต่ำของตารางก่อนเกิด scroll แนวนอน (default "640px") */
  minWidth?: string;
  children: React.ReactNode;
}

export function Table({ className, minWidth = "640px", children }: TableProps) {
  return (
    <div className={cn("card-surface overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-navy text-white">{children}</thead>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return (
    <tbody className="divide-y divide-line [&>tr:nth-child(even)]:bg-slate-50/70">
      {children}
    </tbody>
  );
}

export function TR({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <tr className={className}>{children}</tr>;
}

export function TH({
  align = "left",
  className,
  children,
}: {
  align?: Align;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-4 py-3 text-sm font-semibold",
        ALIGN_CLASSES[align],
        className
      )}
    >
      {children}
    </th>
  );
}

export function TD({
  align = "left",
  className,
  children,
}: {
  align?: Align;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <td className={cn("px-4 py-2.5 align-middle", ALIGN_CLASSES[align], className)}>
      {children}
    </td>
  );
}

/** แถวสถานะว่าง — ใช้ใน TBody เมื่อไม่มีข้อมูล */
export function TableEmpty({
  colSpan,
  message = "ไม่พบข้อมูล",
}: {
  colSpan: number;
  message?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-slate-500">
        {message}
      </td>
    </tr>
  );
}
