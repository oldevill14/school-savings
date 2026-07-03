/**
 * GET /api/export/classroom-report — ดาวน์โหลดรายงานสรุปรายห้องเรียนเป็น Excel (.xlsx)
 *
 *   GET /api/export/classroom-report?classroomId=<id>[&from=YYYY-MM&to=YYYY-MM]
 *
 * - ADMIN/EXECUTIVE: ทุกห้อง · TEACHER: เฉพาะห้องที่ตนเป็นครูประจำชั้น
 * - หัวตาราง/คอลัมน์ตรงกับหน้า /reports/classroom เป๊ะ
 * - ตัวเลขเป็น number จริง (format #,##0.00) · reuse buildClassroomReport (ไม่ duplicate logic)
 */
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildClassroomReport } from "@/app/(app)/reports/report-data";
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

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function statusSuffix(status: string, hasAccount: boolean): string {
  if (status === "GRADUATED") return " (จบการศึกษา)";
  if (status === "MOVED") return " (ย้ายออก)";
  if (!hasAccount) return " (ยังไม่เปิดบัญชี)";
  return "";
}

export async function GET(req: Request) {
  try {
    const session = await requireRoleApi(["ADMIN", "TEACHER", "EXECUTIVE"]);
    const { searchParams } = new URL(req.url);

    const classroomId = searchParams.get("classroomId")?.trim();
    if (!classroomId) {
      return Response.json({ error: "กรุณาระบุห้องเรียน (classroomId)" }, { status: 400 });
    }

    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { id: true, teacherId: true },
    });
    if (!classroom) {
      return Response.json({ error: "ไม่พบห้องเรียนที่ระบุ" }, { status: 404 });
    }
    // ครูประจำชั้นดาวน์โหลดได้เฉพาะห้องของตนเอง (ADMIN/EXECUTIVE ได้ทุกห้อง)
    if (session.role === "TEACHER" && classroom.teacherId !== session.userId) {
      return Response.json(
        { error: "ครูประจำชั้นดูรายงานได้เฉพาะห้องเรียนของตนเองเท่านั้น" },
        { status: 403 }
      );
    }

    const fromKey = searchParams.get("from")?.trim() || null;
    const toKey = searchParams.get("to")?.trim() || null;
    if ((fromKey && !MONTH_KEY_RE.test(fromKey)) || (toKey && !MONTH_KEY_RE.test(toKey))) {
      return Response.json(
        { error: "รูปแบบเดือนไม่ถูกต้อง ต้องเป็น YYYY-MM แบบ ค.ศ. เช่น 2026-05" },
        { status: 400 }
      );
    }

    const report = await buildClassroomReport(classroomId, { fromKey, toKey });
    if (!report) {
      return Response.json({ error: "ไม่พบห้องเรียนที่ระบุ" }, { status: 404 });
    }

    const { schoolName, schoolArea } = await schoolHeaderInfo();
    const wb = createWorkbook();
    const ws = wb.addWorksheet("รายห้องเรียน", {
      views: [{ state: "frozen", ySplit: 0 }],
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 },
    });

    ws.columns = [
      { width: 12 }, // รหัส
      { width: 32 }, // ชื่อ
      { width: 16 }, // ยอดยกมา
      { width: 16 }, // รวมฝาก
      { width: 16 }, // รวมถอน
      { width: 16 }, // คงเหลือ
    ];

    const subtitles = [
      `รายงานสรุปออมทรัพย์รายห้องเรียน — ห้อง ${report.classroom.name} ปีการศึกษา ${report.academicYear}`,
      `ช่วงข้อมูล ${report.fromLabel} – ${report.toLabel} · นักเรียน ${report.studentCount} คน` +
        (report.teacherName ? ` · ครูประจำชั้น ${report.teacherName}` : ""),
    ];
    let r = writeSheetHeader(ws, {
      schoolName,
      schoolArea,
      title: "รายงานสรุปออมทรัพย์รายห้องเรียน",
      subtitles,
      span: 6,
    });

    // แถวหัวตาราง
    const headerRow = ws.getRow(r);
    headerRow.values = ["รหัส", "ชื่อ - นามสกุล", "ยอดยกมา", "รวมฝาก", "รวมถอน", "คงเหลือ"];
    styleHeaderRow(headerRow, [3, 4, 5, 6]);
    r += 1;

    for (const row of report.rows) {
      const dataRow = ws.getRow(r);
      dataRow.values = [
        row.studentCode,
        row.fullName + statusSuffix(row.studentStatus, row.hasAccount),
        Number(row.carry),
        Number(row.deposit),
        Number(row.withdraw),
        Number(row.closing),
      ];
      for (const c of [3, 4, 5, 6]) {
        dataRow.getCell(c).numFmt = MONEY_FMT;
        dataRow.getCell(c).alignment = { horizontal: "right" };
      }
      r += 1;
    }

    // แถวรวมทั้งห้อง
    const totalRow = ws.getRow(r);
    totalRow.values = [
      `รวมทั้งห้อง (${report.studentCount} คน)`,
      "",
      Number(report.totals.carry),
      Number(report.totals.deposit),
      Number(report.totals.withdraw),
      Number(report.totals.closing),
    ];
    ws.mergeCells(r, 1, r, 2);
    for (const c of [3, 4, 5, 6]) {
      totalRow.getCell(c).numFmt = MONEY_FMT;
      totalRow.getCell(c).alignment = { horizontal: "right" };
    }
    styleTotalRow(totalRow);

    applyBodyFont(ws);

    return workbookResponse(wb, "classroom-savings-report");
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/export/classroom-report ล้มเหลว:", e);
    return Response.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
