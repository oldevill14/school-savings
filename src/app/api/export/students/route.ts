/**
 * GET /api/export/students — ดาวน์โหลดรายชื่อนักเรียน (ปีที่เปิดใช้งาน) เป็น Excel (.xlsx)
 *
 * คอลัมน์: รหัสนักเรียน | ชื่อ - นามสกุล | ห้องเรียน | สถานะ | ยอดคงเหลือ
 * - ADMIN/EXECUTIVE: ทุกห้อง · TEACHER: เฉพาะห้องที่ตนเป็นครูประจำชั้น
 * - ยอดคงเหลือ = Account.balance ของปีที่เปิดใช้งาน (ยอดปัจจุบัน)
 */
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "กำลังศึกษา",
  GRADUATED: "จบการศึกษา",
  MOVED: "ย้ายออก",
};

export async function GET() {
  try {
    const session = await requireRoleApi(["ADMIN", "TEACHER", "EXECUTIVE"]);

    const activeYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
      orderBy: { year: "desc" },
    });
    if (!activeYear) {
      return Response.json(
        { error: "ยังไม่มีปีการศึกษาที่เปิดใช้งาน" },
        { status: 404 }
      );
    }

    const students = await prisma.student.findMany({
      where: {
        classroom: {
          academicYearId: activeYear.id,
          ...(session.role === "TEACHER" ? { teacherId: session.userId } : {}),
        },
      },
      select: {
        studentCode: true,
        firstName: true,
        lastName: true,
        status: true,
        classroom: { select: { name: true } },
        accounts: {
          where: { academicYearId: activeYear.id },
          select: { balance: true },
        },
      },
    });

    // เรียงตามห้อง แล้วรหัสนักเรียน
    students.sort((a, b) => {
      const byRoom = (a.classroom?.name ?? "").localeCompare(b.classroom?.name ?? "", "th");
      if (byRoom !== 0) return byRoom;
      return a.studentCode.localeCompare(b.studentCode, "th", { numeric: true });
    });

    const { schoolName, schoolArea } = await schoolHeaderInfo();
    const wb = createWorkbook();
    const ws = wb.addWorksheet("รายชื่อนักเรียน", {
      pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 },
    });
    ws.columns = [{ width: 14 }, { width: 32 }, { width: 16 }, { width: 14 }, { width: 18 }];

    let r = writeSheetHeader(ws, {
      schoolName,
      schoolArea,
      title: `รายชื่อนักเรียนและยอดเงินออมทรัพย์ ปีการศึกษา ${activeYear.year}`,
      subtitles: [`นักเรียนทั้งหมด ${students.length} คน`],
      span: 5,
    });

    const headerRow = ws.getRow(r);
    headerRow.values = ["รหัสนักเรียน", "ชื่อ - นามสกุล", "ห้องเรียน", "สถานะ", "ยอดคงเหลือ"];
    styleHeaderRow(headerRow, [5]);
    r += 1;

    let total = 0;
    for (const s of students) {
      const balance = s.accounts[0] ? Number(s.accounts[0].balance) : 0;
      total += balance;
      const dr = ws.getRow(r);
      dr.values = [
        s.studentCode,
        `${s.firstName} ${s.lastName}`,
        s.classroom?.name ?? "-",
        STATUS_LABEL[s.status] ?? s.status,
        s.accounts[0] ? balance : "ยังไม่เปิดบัญชี",
      ];
      if (s.accounts[0]) {
        dr.getCell(5).numFmt = MONEY_FMT;
      }
      dr.getCell(5).alignment = { horizontal: "right" };
      r += 1;
    }

    const totalRow = ws.getRow(r);
    totalRow.values = [`รวม ${students.length} คน`, "", "", "", total];
    ws.mergeCells(r, 1, r, 4);
    totalRow.getCell(5).numFmt = MONEY_FMT;
    totalRow.getCell(5).alignment = { horizontal: "right" };
    styleTotalRow(totalRow);

    applyBodyFont(ws);

    return workbookResponse(wb, "students-list");
  } catch (e) {
    if (e instanceof AuthError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/export/students ล้มเหลว:", e);
    return Response.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
