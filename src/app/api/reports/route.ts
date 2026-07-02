/**
 * GET /api/reports — ข้อมูลรายงานสรุปแบบ JSON (ADMIN, TEACHER)
 *
 * แบบใช้งาน:
 *   GET /api/reports?type=classroom&classroomId=<id>[&from=YYYY-MM&to=YYYY-MM]
 *     - from/to เป็นเดือนแบบ ค.ศ. (เช่น 2026-05) — ไม่ส่งมาใช้ค่าเริ่มต้น
 *       (พ.ค. ของปีการศึกษานั้น ถึงเดือนปัจจุบัน) / อยู่นอกปีการศึกษาจะถูก clamp
 *     - TEACHER เรียกได้เฉพาะห้องที่ตนเป็นครูประจำชั้น
 *   GET /api/reports?type=yearly[&year=2569]
 *     - year เป็น พ.ศ. — ไม่ส่งมาใช้ปีการศึกษาที่เปิดใช้งาน
 *
 * ตัวเลขทุกตัวคำนวณจาก Transaction ที่ status = NORMAL (ไม่ใช้ Account.balance)
 * จำนวนเงินคืนเป็น string ทศนิยม 2 ตำแหน่ง เช่น "1234.50"
 */
import { NextResponse } from "next/server";
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  buildClassroomReport,
  buildYearlyReport,
} from "@/app/(app)/reports/report-data";

export const dynamic = "force-dynamic";

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(req: Request) {
  try {
    const session = await requireRoleApi(["ADMIN", "TEACHER"]);
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    // ---------- รายงานรายห้องเรียน ----------
    if (type === "classroom") {
      const classroomId = searchParams.get("classroomId")?.trim();
      if (!classroomId) {
        return NextResponse.json(
          { error: "กรุณาระบุห้องเรียน (classroomId)" },
          { status: 400 }
        );
      }

      const classroom = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: { id: true, teacherId: true },
      });
      if (!classroom) {
        return NextResponse.json({ error: "ไม่พบห้องเรียนที่ระบุ" }, { status: 404 });
      }
      // ครูประจำชั้นดูได้เฉพาะห้องของตนเอง (ADMIN ดูได้ทุกห้อง)
      if (session.role === "TEACHER" && classroom.teacherId !== session.userId) {
        return NextResponse.json(
          { error: "ครูประจำชั้นดูรายงานได้เฉพาะห้องเรียนของตนเองเท่านั้น" },
          { status: 403 }
        );
      }

      const fromKey = searchParams.get("from")?.trim() || null;
      const toKey = searchParams.get("to")?.trim() || null;
      if ((fromKey && !MONTH_KEY_RE.test(fromKey)) || (toKey && !MONTH_KEY_RE.test(toKey))) {
        return NextResponse.json(
          { error: "รูปแบบเดือนไม่ถูกต้อง ต้องเป็น YYYY-MM แบบ ค.ศ. เช่น 2026-05" },
          { status: 400 }
        );
      }

      const report = await buildClassroomReport(classroomId, { fromKey, toKey });
      if (!report) {
        return NextResponse.json({ error: "ไม่พบห้องเรียนที่ระบุ" }, { status: 404 });
      }
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        type: "classroom",
        report,
      });
    }

    // ---------- รายงานรายปีการศึกษา ----------
    if (type === "yearly") {
      const yearParam = searchParams.get("year")?.trim();
      let yearBE: number;
      if (!yearParam) {
        const active = await prisma.academicYear.findFirst({
          where: { isActive: true },
          orderBy: { year: "desc" },
          select: { year: true },
        });
        if (!active) {
          return NextResponse.json(
            { error: "ยังไม่มีปีการศึกษาที่เปิดใช้งาน กรุณาระบุปี (year)" },
            { status: 404 }
          );
        }
        yearBE = active.year;
      } else {
        yearBE = Number(yearParam);
        if (!Number.isInteger(yearBE) || yearBE < 2500 || yearBE > 2700) {
          return NextResponse.json(
            { error: "ปีการศึกษาไม่ถูกต้อง ต้องเป็นปี พ.ศ. เช่น 2569" },
            { status: 400 }
          );
        }
      }

      const report = await buildYearlyReport(yearBE);
      if (!report) {
        return NextResponse.json(
          { error: `ไม่พบปีการศึกษา ${yearBE} ในระบบ` },
          { status: 404 }
        );
      }
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        type: "yearly",
        report,
      });
    }

    return NextResponse.json(
      { error: "กรุณาระบุ type เป็น classroom หรือ yearly" },
      { status: 400 }
    );
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/reports ล้มเหลว:", e);
    return NextResponse.json(
      { error: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
