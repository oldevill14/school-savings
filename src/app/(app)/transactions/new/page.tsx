/**
 * /transactions/new — บันทึกฝาก-ถอนทั้งห้องทีเดียว (ADMIN, TEACHER)
 *
 * - ADMIN เลือกได้ทุกห้องของปีการศึกษาที่เปิดอยู่
 * - TEACHER ถูกล็อกเป็นห้องที่ตนประจำชั้นเท่านั้น (เช็คซ้ำอีกชั้นใน API)
 * - ตารางกรอกหลายคนแล้ว "บันทึกทั้งหมด" ทีเดียว → POST /api/transactions/batch
 */
import { PlusCircle } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSchoolSetting } from "@/lib/settings";
import Card from "@/components/ui/Card";
import BatchDepositTable, {
  type BatchStudentRow,
} from "@/components/BatchDepositTable";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ classroomId?: string }>;
}

export default async function NewTransactionPage({ searchParams }: PageProps) {
  const session = await requireRole(["ADMIN", "TEACHER"]);
  const sp = await searchParams;
  const school = await getSchoolSetting();

  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
  });

  if (!activeYear) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card title="บันทึกฝาก-ถอน">
          <p className="text-sm text-slate-600">
            ยังไม่มีปีการศึกษาที่เปิดใช้งาน — กรุณาให้ผู้ดูแลระบบเปิดปีการศึกษาที่เมนู
            &ldquo;ปีการศึกษา&rdquo; ก่อนจึงจะบันทึกธุรกรรมได้
          </p>
        </Card>
      </div>
    );
  }

  // ADMIN: ทุกห้องของปีที่เปิดอยู่ · TEACHER: เฉพาะห้องที่ตนประจำชั้น
  const classrooms = await prisma.classroom.findMany({
    where: {
      academicYearId: activeYear.id,
      ...(session.role === "TEACHER" ? { teacherId: session.userId } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (session.role === "TEACHER" && classrooms.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card title="บันทึกฝาก-ถอน">
          <p className="text-sm text-slate-600">
            คุณยังไม่ได้รับมอบหมายเป็นครูประจำชั้นของห้องใดในปีการศึกษา {activeYear.year}{" "}
            — กรุณาติดต่อผู้ดูแลระบบ
          </p>
        </Card>
      </div>
    );
  }

  // ห้องที่เลือก: จาก query string ถ้าถูกต้อง / ถ้ามีห้องเดียวเลือกให้เลย (ครูถูกล็อก)
  const selectedClassroom =
    classrooms.find((c) => c.id === sp.classroomId) ??
    (classrooms.length === 1 ? classrooms[0] : undefined);

  let students: BatchStudentRow[] = [];
  if (selectedClassroom) {
    const found = await prisma.student.findMany({
      where: { classroomId: selectedClassroom.id, status: "ACTIVE" },
      orderBy: { studentCode: "asc" },
      include: {
        accounts: {
          where: { academicYearId: activeYear.id },
          select: { balance: true },
        },
      },
    });
    // แปลง Prisma Decimal -> number ก่อนส่งเข้า client component
    students = found.map((s) => ({
      studentId: s.id,
      studentCode: s.studentCode,
      name: `${s.firstName} ${s.lastName}`,
      balance: Number(s.accounts[0]?.balance ?? 0),
    }));
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-navy text-white">
          <PlusCircle className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl">บันทึกฝาก-ถอน</h1>
          <p className="text-sm text-slate-500">
            ปีการศึกษา {activeYear.year} · กรอกจำนวนเงินหลายคนแล้วกด
            &ldquo;บันทึกทั้งหมด&rdquo; ครั้งเดียว
          </p>
        </div>
      </header>

      <BatchDepositTable
        classrooms={classrooms}
        selectedClassroomId={selectedClassroom?.id ?? ""}
        lockClassroom={classrooms.length === 1}
        students={students}
        schoolName={school.schoolName}
        schoolArea={school.schoolArea}
        recorderName={session.name}
      />
    </div>
  );
}
