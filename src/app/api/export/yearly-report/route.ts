/**
 * GET /api/export/yearly-report — ดาวน์โหลดรายงานสรุปรายปีการศึกษาเป็น Excel (.xlsx)
 *
 *   GET /api/export/yearly-report[?year=2569]
 *
 * - ADMIN/TEACHER/EXECUTIVE เข้าถึงได้ (เหมือนหน้า /reports/yearly)
 * - 2 ชีต: สรุปรายห้องเรียน + สรุปรายเดือน · reuse buildYearlyReport (ไม่ duplicate logic)
 * - มีบรรทัด "ดอกเบี้ยรวมทั้งปี" ถ้ามีการจ่ายดอกเบี้ย
 */
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildYearlyReport } from "@/app/(app)/reports/report-data";
import {
  createWorkbook,
  workbookResponse,
  writeSheetHeader,
  styleHeaderRow,
  styleTotalRow,
  applyBodyFont,
  schoolHeaderInfo,
  MONEY_FMT,
} from "../_xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRoleApi(["ADMIN", "TEACHER", "EXECUTIVE"]);
    const { searchParams } = new URL(req.url);

    const yearParam = searchParams.get("year")?.trim();
    let yearBE: number;
    if (!yearParam) {
      const active = await prisma.academicYear.findFirst({
        where: { isActive: true },
        orderBy: { year: "desc" },
        select: { year: true },
      });
      if (!active) {
        return Response.json(
          { error: "ยังไม่มีปีการศึกษาที่เปิดใช้งาน กรุณาระบุปี (year)" },
          { status: 404 }
        );
      }
      yearBE = active.year;
    } else {
      yearBE = Number(yearParam);
      if (!Number.isInteger(yearBE) || yearBE < 2500 || yearBE > 2700) {
        return Response.json(
          { error: "ปีการศึกษาไม่ถูกต้อง ต้องเป็นปี พ.ศ. เช่น 2569" },
          { status: 400 }
        );
      }
    }

    const report = await buildYearlyReport(yearBE);
    if (!report) {
      return Response.json({ error: `ไม่พบปีการศึกษา ${yearBE} ในระบบ` }, { status: 404 });
    }

    const { schoolName, schoolArea } = await schoolHeaderInfo();
    const wb = createWorkbook();

    // ---------- ชีต 1: สรุปรายห้องเรียน ----------
    const wsRoom = wb.addWorksheet("สรุปรายห้อง", {
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 },
    });
    wsRoom.columns = [{ width: 30 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 18 }];

    let r = writeSheetHeader(wsRoom, {
      schoolName,
      schoolArea,
      title: `รายงานสรุปออมทรัพย์ประจำปีการศึกษา ${report.year}`,
      subtitles: [`บัญชีทั้งหมด ${report.totals.accountCount} บัญชี`],
      span: 5,
    });

    const headRoom = wsRoom.getRow(r);
    headRoom.values = ["ห้อง", "จำนวนบัญชี", "รวมฝาก", "รวมถอน", "คงเหลือรวม"];
    styleHeaderRow(headRoom, [2, 3, 4, 5]);
    r += 1;

    for (const row of report.classrooms) {
      const dr = wsRoom.getRow(r);
      dr.values = [
        row.teacherName ? `${row.name} (ครูประจำชั้น ${row.teacherName})` : row.name,
        row.accountCount,
        Number(row.deposit),
        Number(row.withdraw),
        Number(row.closing),
      ];
      dr.getCell(2).alignment = { horizontal: "right" };
      for (const c of [3, 4, 5]) {
        dr.getCell(c).numFmt = MONEY_FMT;
        dr.getCell(c).alignment = { horizontal: "right" };
      }
      r += 1;
    }

    const totalRoom = wsRoom.getRow(r);
    totalRoom.values = [
      "รวมทั้งโรงเรียน",
      report.totals.accountCount,
      Number(report.totals.deposit),
      Number(report.totals.withdraw),
      Number(report.totals.closing),
    ];
    totalRoom.getCell(2).alignment = { horizontal: "right" };
    for (const c of [3, 4, 5]) {
      totalRoom.getCell(c).numFmt = MONEY_FMT;
      totalRoom.getCell(c).alignment = { horizontal: "right" };
    }
    styleTotalRow(totalRoom);
    r += 2;

    // บรรทัดสรุปเสริม (ยอดยกมาต้นปี + ดอกเบี้ยถ้ามี)
    const infoLines: [string, string][] = [
      ["ยอดยกมาต้นปี", report.totals.opening],
    ];
    if (Number(report.totals.interest) > 0) {
      infoLines.push(["ดอกเบี้ยรวมทั้งปี (รวมอยู่ในยอดฝาก)", report.totals.interest]);
    }
    for (const [label, value] of infoLines) {
      const ir = wsRoom.getRow(r);
      ir.getCell(1).value = label;
      ir.getCell(1).font = { name: "TH Sarabun New", size: 14, bold: true };
      ir.getCell(4).value = Number(value);
      ir.getCell(4).numFmt = MONEY_FMT;
      ir.getCell(4).alignment = { horizontal: "right" };
      ir.getCell(5).value = "บาท";
      r += 1;
    }

    applyBodyFont(wsRoom);

    // ---------- ชีต 2: สรุปรายเดือน ----------
    const wsMonth = wb.addWorksheet("สรุปรายเดือน", {
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 },
    });
    wsMonth.columns = [{ width: 18 }, { width: 16 }, { width: 16 }, { width: 18 }];

    let r2 = writeSheetHeader(wsMonth, {
      schoolName,
      schoolArea,
      title: `สรุปยอดฝาก-ถอนรายเดือน ปีการศึกษา ${report.year}`,
      span: 4,
    });

    const headMonth = wsMonth.getRow(r2);
    headMonth.values = ["เดือน", "รวมฝาก", "รวมถอน", "เปลี่ยนแปลงสุทธิ"];
    styleHeaderRow(headMonth, [2, 3, 4]);
    r2 += 1;

    for (const row of report.monthly) {
      const dr = wsMonth.getRow(r2);
      dr.values = [row.label, Number(row.deposit), Number(row.withdraw), Number(row.net)];
      for (const c of [2, 3, 4]) {
        dr.getCell(c).numFmt = MONEY_FMT;
        dr.getCell(c).alignment = { horizontal: "right" };
      }
      r2 += 1;
    }

    const totalMonth = wsMonth.getRow(r2);
    totalMonth.values = [
      "รวมทั้งปี",
      Number(report.totals.deposit),
      Number(report.totals.withdraw),
      Number(report.totals.net),
    ];
    for (const c of [2, 3, 4]) {
      totalMonth.getCell(c).numFmt = MONEY_FMT;
      totalMonth.getCell(c).alignment = { horizontal: "right" };
    }
    styleTotalRow(totalMonth);

    applyBodyFont(wsMonth);

    return workbookResponse(wb, "yearly-savings-report");
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/export/yearly-report ล้มเหลว:", e);
    return Response.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
