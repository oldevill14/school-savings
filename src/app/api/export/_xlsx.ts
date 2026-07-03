/**
 * ตัวช่วยสร้างไฟล์ Excel (.xlsx) ด้วย exceljs — ใช้ร่วมกันภายใน api/export/*
 *
 * ใช้ได้เฉพาะฝั่ง server บน Node runtime (exceljs ต้องการ Buffer/stream)
 * ทุก route ที่ import ไฟล์นี้ต้องประกาศ:
 *   export const runtime = "nodejs";
 *   export const dynamic = "force-dynamic";
 */
import ExcelJS from "exceljs";
import { getSchoolSetting } from "@/lib/settings";

/** number format มาตรฐานสำหรับคอลัมน์เงิน — 1,234.50 */
export const MONEY_FMT = "#,##0.00";

/** สีธีม (navy / gold) แบบ ARGB สำหรับ exceljs */
const NAVY = "FF1E3A5F";
const GOLD_SOFT = "FFF6EAC8"; // โทน gold/10 อ่อนสำหรับแถวรวม
const WHITE = "FFFFFFFF";

/** สร้าง workbook เปล่าพร้อม metadata */
export function createWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ระบบออมทรัพย์โรงเรียน";
  wb.created = new Date();
  return wb;
}

/** วันที่แบบ YYYYMMDD (ค.ศ.) สำหรับต่อท้ายชื่อไฟล์ */
export function dateStamp(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * จัดสไตล์แถวหัวตาราง (thead) — พื้นน้ำเงินกรมท่า ตัวอักษรขาว หนา
 * @param moneyCols ดัชนีคอลัมน์ (1-based) ที่เป็นเงิน -> จัดชิดขวา
 */
export function styleHeaderRow(row: ExcelJS.Row, moneyCols: number[] = []): void {
  row.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: WHITE }, name: "TH Sarabun New", size: 14 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = {
      vertical: "middle",
      horizontal: moneyCols.includes(col) ? "right" : "left",
      wrapText: true,
    };
    cell.border = { bottom: { style: "thin", color: { argb: NAVY } } };
  });
}

/** จัดสไตล์แถวรวม (พื้นทอง อ่อน หนา) — moneyCols จัดชิดขวา */
export function styleTotalRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true, name: "TH Sarabun New", size: 14 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD_SOFT } };
    cell.border = { top: { style: "medium", color: { argb: NAVY } } };
  });
}

/** ใส่ font ไทยให้ทั้งชีต (ค่า default) — เรียกหลังเติมข้อมูลครบ */
export function applyBodyFont(ws: ExcelJS.Worksheet): void {
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      if (!cell.font?.name) {
        cell.font = { name: "TH Sarabun New", size: 14 };
      }
    });
  });
}

/** แถวหัวกระดาษ (ชื่อโรงเรียน/เขต/ชื่อรายงาน) — คืน worksheet ที่สร้างแล้ว */
export interface SheetHeaderOpts {
  schoolName: string;
  schoolArea: string;
  title: string;
  /** บรรทัดบริบทเพิ่มเติม เช่น "ห้อง ป.1/1 ปีการศึกษา 2569" */
  subtitles?: string[];
  /** จำนวนคอลัมน์ที่จะ merge หัวกระดาษ */
  span: number;
}

/** เติมหัวกระดาษไทยลงในชีต แล้วคืนเลขแถวถัดไปที่ว่าง (1-based) */
export function writeSheetHeader(
  ws: ExcelJS.Worksheet,
  opts: SheetHeaderOpts
): number {
  const lines: { text: string; size: number; bold: boolean }[] = [
    { text: opts.schoolName, size: 18, bold: true },
    { text: opts.schoolArea, size: 14, bold: false },
    { text: opts.title, size: 16, bold: true },
    ...(opts.subtitles ?? []).map((t) => ({ text: t, size: 13, bold: false })),
  ];
  let r = 1;
  for (const line of lines) {
    ws.mergeCells(r, 1, r, opts.span);
    const cell = ws.getCell(r, 1);
    cell.value = line.text;
    cell.font = { name: "TH Sarabun New", size: line.size, bold: line.bold };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    r += 1;
  }
  r += 1; // เว้นบรรทัด
  return r;
}

/**
 * แปลง workbook เป็น HTTP Response ดาวน์โหลด (.xlsx) — ชื่อไฟล์ ASCII + วันที่
 * @param baseName ชื่อฐานภาษาอังกฤษ เช่น "classroom-savings-report"
 */
export async function workbookResponse(
  wb: ExcelJS.Workbook,
  baseName: string
): Promise<Response> {
  const buffer = await wb.xlsx.writeBuffer();
  const fileName = `${baseName}-${dateStamp()}.xlsx`;
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** อ่านชื่อโรงเรียน/เขตจากตั้งค่ากลาง (ใช้แทน hardcode) */
export async function schoolHeaderInfo(): Promise<{
  schoolName: string;
  schoolArea: string;
}> {
  const s = await getSchoolSetting();
  return { schoolName: s.schoolName, schoolArea: s.schoolArea };
}
