"use client";

/**
 * TransactionSlip — พิมพ์สลิปรายการฝาก-ถอน (ข้อ 6)
 *
 * ใช้หลังบันทึกธุรกรรมสำเร็จในหน้า /transactions/new:
 * BatchDepositTable เปิด Modal สรุปรายการที่เพิ่งบันทึก แล้ววางปุ่มนี้ให้ผู้ใช้พิมพ์สลิป
 *
 * การพิมพ์: สร้าง iframe ซ่อน + เขียน HTML สลิป (self-contained inline style) แล้ว print
 * — แยกจาก layout ของแอปโดยสมบูรณ์ (ไม่ต้องสู้กับ sidebar/topbar) และไม่โดน popup blocker
 *
 * หนึ่งสลิปต่อนักเรียนหนึ่งคน (แต่ละใบขึ้นหน้าใหม่) — ชื่อโรงเรียนจาก getSchoolSetting
 * (ส่งเข้ามาทาง prop จาก Server Component), วันที่เป็น พ.ศ., จำนวนเงินผ่าน formatBaht
 */
import { Printer } from "lucide-react";
import Button from "@/components/ui/Button";
import { formatBaht } from "@/lib/money";
import { formatThaiDateTime } from "@/lib/thai-date";

export type SlipItem = {
  studentCode: string;
  studentName: string;
  type: "DEPOSIT" | "WITHDRAW";
  /** จำนวนเงินของรายการ (บาท) */
  amount: number;
  /** ยอดคงเหลือหลังทำรายการ (บาท) */
  balanceAfter: number;
};

export type SlipHeader = {
  schoolName: string;
  schoolArea?: string;
  /** ชื่อผู้บันทึกรายการ (session.name) */
  recorderName: string;
  /** ชื่อห้องเรียนของนักเรียนในชุดนี้ */
  classroomName?: string;
  /** เวลาที่ทำรายการ */
  txnDate: Date | string;
};

/** escape ข้อความก่อนฝังใน HTML (กันชื่อที่มี < & ") */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** สร้าง HTML ของสลิปทั้งหมด (หนึ่งใบต่อนักเรียน) */
export function buildSlipsHtml(header: SlipHeader, items: SlipItem[]): string {
  const dateText = esc(formatThaiDateTime(header.txnDate));
  const schoolName = esc(header.schoolName);
  const schoolArea = header.schoolArea ? esc(header.schoolArea) : "";
  const recorder = esc(header.recorderName);
  const classroom = header.classroomName ? esc(header.classroomName) : "";

  const slips = items
    .map((item) => {
      const isDeposit = item.type === "DEPOSIT";
      const typeLabel = isDeposit ? "ฝากเงิน" : "ถอนเงิน";
      const typeColor = isDeposit ? "#16a34a" : "#dc2626";
      const sign = isDeposit ? "+" : "-";
      return `
      <div class="slip">
        <div class="slip-head">
          <div class="school">${schoolName}</div>
          ${schoolArea ? `<div class="area">${schoolArea}</div>` : ""}
          <div class="title">สลิปรายการออมทรัพย์นักเรียน</div>
        </div>
        <table class="kv">
          <tr><td class="k">วันที่</td><td class="v">${dateText}</td></tr>
          <tr><td class="k">นักเรียน</td><td class="v">${esc(item.studentName)} (รหัส ${esc(
            item.studentCode
          )})</td></tr>
          ${classroom ? `<tr><td class="k">ห้องเรียน</td><td class="v">${classroom}</td></tr>` : ""}
          <tr><td class="k">รายการ</td><td class="v" style="color:${typeColor};font-weight:700;">${typeLabel}</td></tr>
          <tr><td class="k">จำนวนเงิน</td><td class="v amount" style="color:${typeColor};font-weight:700;">${sign}${formatBaht(
            item.amount
          )} บาท</td></tr>
          <tr><td class="k">ยอดคงเหลือใหม่</td><td class="v amount" style="font-weight:700;">${formatBaht(
            item.balanceAfter
          )} บาท</td></tr>
          <tr><td class="k">ผู้บันทึก</td><td class="v">${recorder}</td></tr>
        </table>
        <div class="sign">
          <div class="sign-line">ลงชื่อผู้รับ/ผู้ปกครอง</div>
          <div class="sign-line">ลงชื่อเจ้าหน้าที่</div>
        </div>
      </div>`;
    })
    .join("");

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<title>สลิปรายการออมทรัพย์</title>
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: "Sarabun", "TH Sarabun New", "Noto Sans Thai", sans-serif;
    color: #0f172a;
    background: #fff;
  }
  .slip {
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    padding: 16px 20px 20px;
    border: 1px dashed #94a3b8;
    break-inside: avoid;
    page-break-inside: avoid;
    break-after: page;
    page-break-after: always;
  }
  .slip:last-child { break-after: auto; page-break-after: auto; }
  .slip-head { text-align: center; border-bottom: 1.5px solid #1e3a5f; padding-bottom: 8px; margin-bottom: 10px; }
  .school { font-size: 17px; font-weight: 700; color: #1e3a5f; }
  .area { font-size: 12px; color: #475569; margin-top: 2px; }
  .title { font-size: 14px; font-weight: 600; margin-top: 6px; }
  table.kv { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.kv td { padding: 5px 2px; vertical-align: top; border-bottom: 1px dotted #e2e8f0; }
  td.k { color: #64748b; white-space: nowrap; width: 38%; }
  td.v { color: #0f172a; }
  td.v.amount { text-align: right; font-variant-numeric: tabular-nums; }
  .sign { display: flex; justify-content: space-between; gap: 16px; margin-top: 28px; }
  .sign-line { flex: 1; text-align: center; font-size: 11px; color: #475569; border-top: 1px solid #94a3b8; padding-top: 4px; }
  @page { size: A5; margin: 10mm; }
</style>
</head>
<body>
${slips}
</body>
</html>`;
}

/** พิมพ์สลิปผ่าน iframe ซ่อน (แยกจาก layout ของแอป) */
export function printSlips(header: SlipHeader, items: SlipItem[]): void {
  if (items.length === 0) return;
  const html = buildSlipsHtml(header, items);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.onafterprint = () => setTimeout(cleanup, 500);
    // เผื่อเบราว์เซอร์ที่ไม่ยิง onafterprint — เก็บกวาดภายหลัง
    setTimeout(cleanup, 60000);
    win.focus();
    win.print();
  };

  document.body.appendChild(iframe);
  iframe.srcdoc = html;
}

export interface SlipPrintButtonProps {
  header: SlipHeader;
  items: SlipItem[];
  disabled?: boolean;
  className?: string;
}

/** ปุ่ม "พิมพ์สลิป" — วางใน Modal สรุปรายการที่เพิ่งบันทึก */
export default function SlipPrintButton({
  header,
  items,
  disabled,
  className,
}: SlipPrintButtonProps) {
  return (
    <Button
      variant="secondary"
      className={className}
      disabled={disabled || items.length === 0}
      onClick={() => printSlips(header, items)}
    >
      <Printer className="h-4 w-4" />
      พิมพ์สลิป
    </Button>
  );
}
