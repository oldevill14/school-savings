/**
 * /students — รายชื่อนักเรียน + จัดการ (ADMIN, TEACHER)
 *
 * - ADMIN: เห็นทุกห้องของปีการศึกษาที่ active + เพิ่ม/แก้ไข/ย้ายห้อง/นำเข้า CSV
 * - TEACHER: เห็นเฉพาะห้องที่ตนเป็นครูประจำชั้น (ดูอย่างเดียว)
 *
 * ส่วน interactive (ค้นหา/กรอง/Modal) อยู่ใน StudentsClient.tsx (client component)
 */
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Card from "@/components/ui/Card";
import StudentsClient, { type StudentRow } from "./StudentsClient";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const session = await requireRole(["ADMIN", "TEACHER", "EXECUTIVE"]);
  // จัดการได้ = ADMIN เท่านั้น · เห็นทุกห้อง = ADMIN + EXECUTIVE (read-only) · TEACHER เห็นเฉพาะห้องตน
  const canManage = session.role === "ADMIN";
  const seesAll = session.role === "ADMIN" || session.role === "EXECUTIVE";

  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
  });

  if (!activeYear) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl">นักเรียน</h1>
        <Card className="mt-4">
          <p className="text-sm text-slate-600">
            ยังไม่มีปีการศึกษาที่เปิดใช้งาน — กรุณาให้ผู้ดูแลระบบเปิดปีการศึกษาที่เมนู
            &ldquo;ปีการศึกษา&rdquo; ก่อนจัดการรายชื่อนักเรียน
          </p>
        </Card>
      </div>
    );
  }

  // ห้องเรียนของปี active — TEACHER เห็นเฉพาะห้องที่ตนประจำ (ADMIN/EXECUTIVE เห็นทุกห้อง)
  const classrooms = await prisma.classroom.findMany({
    where: {
      academicYearId: activeYear.id,
      ...(seesAll ? {} : { teacherId: session.userId }),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const students =
    classrooms.length > 0
      ? await prisma.student.findMany({
          where: { classroomId: { in: classrooms.map((c) => c.id) } },
          include: {
            classroom: { select: { id: true, name: true } },
            accounts: {
              where: { academicYearId: activeYear.id },
              select: { balance: true },
            },
          },
          orderBy: { studentCode: "asc" },
        })
      : [];

  // Prisma Decimal ข้าม boundary ไป client ไม่ได้ -> แปลงเป็น string
  const rows: StudentRow[] = students.map((s) => ({
    id: s.id,
    studentCode: s.studentCode,
    firstName: s.firstName,
    lastName: s.lastName,
    status: s.status,
    classroomId: s.classroom.id,
    classroomName: s.classroom.name,
    photoFileName: s.photoFileName,
    balance: s.accounts[0] ? s.accounts[0].balance.toString() : null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl">นักเรียน</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          ปีการศึกษา {activeYear.year} · ทั้งหมด {rows.length} คน
          {!seesAll && " (เฉพาะห้องประจำชั้นของท่าน)"}
        </p>
      </div>

      {!seesAll && classrooms.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            ท่านยังไม่ได้รับมอบหมายเป็นครูประจำชั้นในปีการศึกษา {activeYear.year} —
            กรุณาติดต่อผู้ดูแลระบบ
          </p>
        </Card>
      ) : (
        <StudentsClient students={rows} classrooms={classrooms} canManage={canManage} />
      )}
    </div>
  );
}
