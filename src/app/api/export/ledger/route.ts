/**
 * GET /api/export/ledger — ดาวน์โหลดทะเบียนคุมเงินออมทรัพย์นักเรียนเป็น Excel (.xlsx)
 *
 *   GET /api/export/ledger?scope=ALL|<classroomId>[&from=YYYY-MM&to=YYYY-MM]
 *
 * - ADMIN/EXECUTIVE: ทั้งโรงเรียน (ALL) หรือรายห้อง · TEACHER: เฉพาะห้องของตน (ห้าม ALL)
 * - ทะเบียนแนวราชการรายบัญชี: วันที่ | รายการ | รับ | จ่าย | คงเหลือ | ผู้บันทึก + ยอดยกมา/ยกไป
 * - reuse buildLedgerReport (ไม่ duplicate logic)
 */
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildLedgerReport } from "@/app/(app)/reports/report-data";
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

export async function GET(req: Request) {
  try {
    const session = await requireRoleApi(["ADMIN", "TEACHER", "EXECUTIVE"]);
    const { searchParams } = new URL(req.url);

    const scope = searchParams.get("scope")?.trim();
    if (!scope) {
      return Response.json(
        { error: "กรุณาระบุขอบเขต (scope=ALL หรือรหัสห้องเรียน)" },
        { status: 400 }
      );
    }

    // ---------- ตรวจสิทธิ์ตาม scope ----------
    if (scope === "ALL") {
      if (session.role === "TEACHER") {
        return Response.json(
          { error: "ครูประจำชั้นดูได้เฉพาะห้องเรียนของตนเอง (ไม่รวมทั้งโรงเรียน)" },
          { status: 403 }
        );
      }
    } else {
      const classroom = await prisma.classroom.findUnique({
        where: { id: scope },
        select: { id: true, teacherId: true },
      });
      if (!classroom) {
        return Response.json({ error: "ไม่พบห้องเรียนที่ระบุ" }, { status: 404 });
      }
      if (session.role === "TEACHER" && classroom.teacherId !== session.userId) {
        return Response.json(
          { error: "ครูประจำชั้นดูทะเบียนได้เฉพาะห้องเรียนของตนเองเท่านั้น" },
          { status: 403 }
        );
      }
    }

    const fromKey = searchParams.get("from")?.trim() || null;
    const toKey = searchParams.get("to")?.trim() || null;
    if ((fromKey && !MONTH_KEY_RE.test(fromKey)) || (toKey && !MONTH_KEY_RE.test(toKey))) {
      return Response.json(
        { error: "รูปแบบเดือนไม่ถูกต้อง ต้องเป็น YYYY-MM แบบ ค.ศ. เช่น 2026-05" },
        { status: 400 }
      );
    }

    const report = await buildLedgerReport(scope, { fromKey, toKey });
    if (!report) {
      return Response.json(
        { error: "ไม่พบข้อมูล — ยังไม่มีปีการศึกษาที่เปิดใช้งาน หรือไม่พบห้องเรียน" },
        { status: 404 }
      );
    }

    const { schoolName, schoolArea } = await schoolHeaderInfo();
    const wb = createWorkbook();
    const ws = wb.addWorksheet("ทะเบียนคุมเงิน", {
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      },
    });
    ws.columns = [
      { width: 14 }, // วันที่
      { width: 34 }, // รายการ
      { width: 15 }, // รับ
      { width: 15 }, // จ่าย
      { width: 16 }, // คงเหลือ
      { width: 20 }, // ผู้บันทึก
    ];

    let r = writeSheetHeader(ws, {
      schoolName,
      schoolArea,
      title: "ทะเบียนคุมเงินออมทรัพย์นักเรียน",
      subtitles: [
        `${report.scopeLabel} · ปีการศึกษา ${report.academicYear} · ช่วง ${report.fromLabel} – ${report.toLabel}`,
      ],
      span: 6,
    });

    const MONEY_COLS = [3, 4, 5];
    const writeTableHeader = () => {
      const hr = ws.getRow(r);
      hr.values = ["วันที่", "รายการ", "รับ (ฝาก)", "จ่าย (ถอน)", "คงเหลือ", "ผู้บันทึก"];
      styleHeaderRow(hr, MONEY_COLS);
      r += 1;
    };

    for (const acc of report.accounts) {
      // หัวบัญชี
      ws.mergeCells(r, 1, r, 6);
      const titleCell = ws.getCell(r, 1);
      titleCell.value = `บัญชีเลขที่ ${acc.studentCode} — ${acc.fullName}  (ห้อง ${acc.classroomName})`;
      titleCell.font = { name: "TH Sarabun New", size: 14, bold: true };
      titleCell.alignment = { horizontal: "left" };
      r += 1;

      writeTableHeader();

      // ยอดยกมา
      const carryRow = ws.getRow(r);
      carryRow.values = ["", "ยอดยกมา", "", "", Number(acc.carry), ""];
      carryRow.getCell(5).numFmt = MONEY_FMT;
      carryRow.getCell(5).alignment = { horizontal: "right" };
      carryRow.getCell(2).font = { name: "TH Sarabun New", size: 13, italic: true };
      r += 1;

      for (const e of acc.entries) {
        const dr = ws.getRow(r);
        dr.values = [
          e.dateLabel,
          e.description,
          e.isDeposit ? Number(e.deposit) : null,
          e.isDeposit ? null : Number(e.withdraw),
          Number(e.balance),
          e.recordedBy,
        ];
        for (const c of MONEY_COLS) {
          dr.getCell(c).numFmt = MONEY_FMT;
          dr.getCell(c).alignment = { horizontal: "right" };
        }
        r += 1;
      }

      // ยอดยกไป
      const closeRow = ws.getRow(r);
      closeRow.values = [
        "",
        "ยอดยกไป",
        Number(acc.totalDeposit),
        Number(acc.totalWithdraw),
        Number(acc.closing),
        "",
      ];
      for (const c of MONEY_COLS) {
        closeRow.getCell(c).numFmt = MONEY_FMT;
        closeRow.getCell(c).alignment = { horizontal: "right" };
      }
      styleTotalRow(closeRow);
      r += 2; // เว้นบรรทัดก่อนบัญชีถัดไป
    }

    if (report.accounts.length === 0) {
      ws.mergeCells(r, 1, r, 6);
      ws.getCell(r, 1).value = "ไม่มีบัญชีนักเรียนในขอบเขตที่เลือก";
      ws.getCell(r, 1).alignment = { horizontal: "center" };
      r += 2;
    }

    // แถวรวมทั้งหมด
    const grand = ws.getRow(r);
    grand.values = [
      "",
      `รวมทุกบัญชี (${report.accounts.length} บัญชี)`,
      Number(report.totals.deposit),
      Number(report.totals.withdraw),
      Number(report.totals.closing),
      "",
    ];
    for (const c of MONEY_COLS) {
      grand.getCell(c).numFmt = MONEY_FMT;
      grand.getCell(c).alignment = { horizontal: "right" };
    }
    styleTotalRow(grand);
    r += 3;

    // ช่องเซ็น ผู้จัดทำ / ผู้ตรวจ
    ws.getCell(r, 2).value = "ลงชื่อ..............................ผู้จัดทำ";
    ws.getCell(r, 5).value = "ลงชื่อ..............................ผู้ตรวจ";
    r += 1;
    ws.getCell(r, 2).value = "(..............................)";
    ws.getCell(r, 5).value = "(..............................)";

    applyBodyFont(ws);

    return workbookResponse(wb, "savings-ledger");
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/export/ledger ล้มเหลว:", e);
    return Response.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
