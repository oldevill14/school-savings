"use client";

/**
 * ตารางสมุดบัญชีเงินฝากสไตล์สมุดธนาคาร + ปุ่มพิมพ์ (window.print)
 *
 * ใช้ในหน้า /passbook/[studentId] — ฝั่ง server คำนวณ running balance
 * (จาก transactions จริง ไม่ใช่ค่า denormalized) แล้วส่ง rows ที่ serialize แล้วเข้ามา
 *
 * กติกาแสดงผล:
 * - ฝาก = เขียว (text-deposit), ถอน = แดง (text-withdraw), คงเหลือ = ตัวหนา
 * - รายการ VOIDED = ขีดฆ่า + Badge "ยกเลิกแล้ว" และไม่กระทบยอดคงเหลือ (คงเหลือแสดง "—")
 */
import { Printer } from "lucide-react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";
import { formatBaht } from "@/lib/money";
import { formatThaiDate } from "@/lib/thai-date";
import { cn } from "@/lib/utils";

export type PassbookRowType = "OPENING" | "DEPOSIT" | "WITHDRAW";

export interface PassbookRow {
  id: string;
  /** วันที่รายการ (ISO string) — แสดงเป็น พ.ศ. ด้วย formatThaiDate */
  date: string | null;
  /** ข้อความรายการ เช่น "ยอดยกมา", "ฝากเงิน", "ถอนเงิน — ค่าอุปกรณ์การเรียน" */
  description: string;
  type: PassbookRowType;
  /** จำนวนเงินฝาก (string ทศนิยม 2 ตำแหน่ง) — null ถ้าไม่ใช่รายการฝาก */
  deposit: string | null;
  /** จำนวนเงินถอน (string ทศนิยม 2 ตำแหน่ง) — null ถ้าไม่ใช่รายการถอน */
  withdraw: string | null;
  /** ยอดคงเหลือหลังรายการนี้ — null สำหรับรายการ VOIDED (ไม่กระทบยอด) */
  balance: string | null;
  /** ชื่อผู้บันทึกรายการ */
  recordedBy: string;
  voided: boolean;
}

export interface PassbookTableProps {
  rows: PassbookRow[];
  className?: string;
}

export default function PassbookTable({ rows, className }: PassbookTableProps) {
  return (
    <Table className={className} minWidth="680px">
      <THead>
        <TR>
          <TH>วันที่</TH>
          <TH>รายการ</TH>
          <TH align="right">ฝาก (บาท)</TH>
          <TH align="right">ถอน (บาท)</TH>
          <TH align="right">คงเหลือ (บาท)</TH>
          <TH>ผู้บันทึก</TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR
            key={row.id}
            className={row.voided ? "line-through text-slate-400" : undefined}
          >
            <TD className="whitespace-nowrap">
              {row.date ? formatThaiDate(row.date) : "-"}
            </TD>
            <TD>
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className={cn(row.type === "OPENING" && "font-medium text-slate-600")}>
                  {row.description}
                </span>
                {row.voided && (
                  <Badge variant="gray" className="no-underline">
                    ยกเลิกแล้ว
                  </Badge>
                )}
              </span>
            </TD>
            <TD
              align="right"
              className={cn(!row.voided && row.deposit && "font-medium text-deposit")}
            >
              {row.deposit !== null ? formatBaht(row.deposit) : ""}
            </TD>
            <TD
              align="right"
              className={cn(!row.voided && row.withdraw && "font-medium text-withdraw")}
            >
              {row.withdraw !== null ? formatBaht(row.withdraw) : ""}
            </TD>
            <TD align="right" className={cn(!row.voided && "font-semibold text-slate-900")}>
              {row.balance !== null ? formatBaht(row.balance) : "—"}
            </TD>
            <TD className="whitespace-nowrap text-slate-500">{row.recordedBy}</TD>
          </TR>
        ))}
        {rows.length === 0 && (
          <TableEmpty colSpan={6} message="ยังไม่มีรายการในปีการศึกษานี้" />
        )}
      </TBody>
    </Table>
  );
}

/** ปุ่มพิมพ์สมุดบัญชี — ต้องเป็น client component เพราะเรียก window.print() */
export function PassbookPrintButton({ className }: { className?: string }) {
  return (
    <Button variant="secondary" className={className} onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      พิมพ์สมุดบัญชี
    </Button>
  );
}
