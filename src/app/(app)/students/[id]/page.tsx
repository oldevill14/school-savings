/**
 * /students/[id] — โปรไฟล์นักเรียนรายคน (ADMIN, TEACHER)
 *
 * - โปรไฟล์ + BalanceCard ยอดของปีการศึกษาที่ active
 * - ประวัติธุรกรรมล่าสุด 10 รายการ + ลิงก์ไปสมุดบัญชี
 * - TEACHER เข้าดูได้เฉพาะนักเรียนในห้องประจำชั้นของตนเอง (ตรวจฝั่ง server)
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ShieldAlert } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Card from "@/components/ui/Card";
import Badge, { type BadgeVariant } from "@/components/ui/Badge";
import BalanceCard from "@/components/BalanceCard";
import MilestoneBadges from "@/components/MilestoneBadges";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";
import { formatBaht } from "@/lib/money";
import { formatThaiDate } from "@/lib/thai-date";
import StudentPhotoManager from "./StudentPhotoManager";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "กำลังศึกษา",
  GRADUATED: "จบการศึกษา",
  MOVED: "ย้ายโรงเรียน",
};

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  ACTIVE: "green",
  GRADUATED: "gray",
  MOVED: "gray",
};

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole(["ADMIN", "TEACHER", "EXECUTIVE"]);
  const { id } = await params;

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      classroom: {
        include: { teacher: { select: { name: true } } },
      },
      accounts: {
        include: { academicYear: { select: { year: true, isActive: true } } },
        orderBy: { academicYear: { year: "desc" } },
      },
    },
  });
  if (!student) notFound();

  // TEACHER ดูได้เฉพาะนักเรียนในห้องประจำชั้นของตน
  if (session.role === "TEACHER" && student.classroom.teacherId !== session.userId) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card className="text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-withdraw" aria-hidden="true" />
          <h1 className="mt-3 text-lg">ไม่มีสิทธิ์เข้าถึง</h1>
          <p className="mt-1 text-sm text-slate-500">
            ครูประจำชั้นสามารถดูข้อมูลได้เฉพาะนักเรียนในห้องประจำชั้นของตนเองเท่านั้น
          </p>
          <Link href="/students" className="link-navy mt-4 inline-block text-sm">
            กลับไปหน้ารายชื่อนักเรียน
          </Link>
        </Card>
      </div>
    );
  }

  // บัญชีปี active (fallback: บัญชีปีล่าสุด)
  const activeAccount =
    student.accounts.find((a) => a.academicYear.isActive) ?? student.accounts[0] ?? null;

  const transactions = activeAccount
    ? await prisma.transaction.findMany({
        where: { accountId: activeAccount.id },
        orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
        take: 10,
        include: { recordedBy: { select: { name: true } } },
      })
    : [];

  // ธุรกรรมทั้งหมดของบัญชีปี active (ย่อ) สำหรับคำนวณตราสัญลักษณ์นักออม
  const milestoneTxns = activeAccount
    ? await prisma.transaction.findMany({
        where: { accountId: activeAccount.id },
        select: { type: true, status: true, txnDate: true, amount: true },
      })
    : [];

  const lastNormalTxn = transactions.find((t) => t.status === "NORMAL");
  const fullName = `${student.firstName} ${student.lastName}`;
  // จัดการรูปได้ = ADMIN หรือครูประจำชั้นของนักเรียนคนนี้ (TEACHER ที่มาถึงจุดนี้ผ่านการตรวจห้องแล้ว)
  //               EXECUTIVE = อ่านอย่างเดียว ไม่จัดการรูป
  const canManagePhoto = session.role === "ADMIN" || session.role === "TEACHER";

  return (
    <div className="space-y-4">
      {/* หัวหน้า + ปุ่ม */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/students"
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy"
          >
            <ArrowLeft className="h-4 w-4" />
            รายชื่อนักเรียน
          </Link>
          <h1 className="mt-1 text-xl">{fullName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>รหัส {student.studentCode}</span>
            <span aria-hidden="true">·</span>
            <span>{student.classroom.name}</span>
            <Badge variant={STATUS_VARIANTS[student.status] ?? "gray"}>
              {STATUS_LABELS[student.status] ?? student.status}
            </Badge>
          </div>
        </div>
        <Link
          href={`/passbook/${student.id}`}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy px-4 text-sm font-medium text-white transition-colors hover:bg-navy-light"
        >
          <BookOpen className="h-4 w-4" />
          เปิดสมุดบัญชี
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ยอดคงเหลือปี active */}
        <div className="lg:col-span-2">
          {activeAccount ? (
            <BalanceCard
              balance={activeAccount.balance.toString()}
              studentName={fullName}
              studentCode={student.studentCode}
              classroomName={student.classroom.name}
              updatedAt={lastNormalTxn?.txnDate}
              title={`ยอดเงินคงเหลือ ปีการศึกษา ${activeAccount.academicYear.year}`}
            />
          ) : (
            <Card>
              <p className="text-sm text-slate-600">
                นักเรียนคนนี้ยังไม่มีบัญชีออมทรัพย์ — บัญชีจะถูกเปิดให้อัตโนมัติเมื่อเพิ่มนักเรียน
                ในปีการศึกษาที่เปิดใช้งาน
              </p>
            </Card>
          )}
        </div>

        {/* ข้อมูลโปรไฟล์ + รูปนักเรียน */}
        <Card title="ข้อมูลนักเรียน">
          <div className="mb-4 flex flex-col items-center border-b border-line pb-4">
            <StudentPhotoManager
              studentId={student.id}
              studentName={fullName}
              initialPhotoFileName={student.photoFileName}
              canManage={canManagePhoto}
            />
          </div>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">รหัสนักเรียน</dt>
              <dd className="font-medium tabular-nums">{student.studentCode}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">ชื่อ-นามสกุล</dt>
              <dd className="font-medium">{fullName}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">ห้องเรียน</dt>
              <dd className="font-medium">{student.classroom.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">ครูประจำชั้น</dt>
              <dd className="font-medium">{student.classroom.teacher?.name ?? "-"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">สถานะ</dt>
              <dd>
                <Badge variant={STATUS_VARIANTS[student.status] ?? "gray"}>
                  {STATUS_LABELS[student.status] ?? student.status}
                </Badge>
              </dd>
            </div>
            {activeAccount && (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">ปีการศึกษา</dt>
                  <dd className="font-medium">{activeAccount.academicYear.year}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">ยอดยกมา</dt>
                  <dd className="font-medium tabular-nums">
                    {formatBaht(activeAccount.openingBalance.toString())} บาท
                  </dd>
                </div>
              </>
            )}
          </dl>
        </Card>
      </div>

      {/* ตราสัญลักษณ์นักออม */}
      {activeAccount && (
        <Card title="ตราสัญลักษณ์นักออม" description="ความสำเร็จจากการออมสม่ำเสมอของนักเรียน">
          <MilestoneBadges
            balance={Number(activeAccount.balance)}
            transactions={milestoneTxns.map((t) => ({
              type: t.type,
              status: t.status,
              txnDate: t.txnDate,
              amount: Number(t.amount),
            }))}
            showLocked
          />
        </Card>
      )}

      {/* ธุรกรรมล่าสุด */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base">ธุรกรรมล่าสุด</h2>
            {activeAccount && (
              <p className="text-sm text-slate-500">
                10 รายการล่าสุดของปีการศึกษา {activeAccount.academicYear.year} —
                ดูทั้งหมดได้ในสมุดบัญชี
              </p>
            )}
          </div>
          <Link href={`/passbook/${student.id}`} className="link-navy text-sm">
            ดูสมุดบัญชี
          </Link>
        </div>
        <Table minWidth="680px">
          <THead>
            <TR>
              <TH>วันที่</TH>
              <TH>ประเภท</TH>
              <TH align="right">จำนวนเงิน (บาท)</TH>
              <TH>หมายเหตุ</TH>
              <TH>ผู้บันทึก</TH>
            </TR>
          </THead>
          <TBody>
            {transactions.map((t) => {
              const voided = t.status === "VOIDED";
              return (
                <TR key={t.id} className={voided ? "line-through text-slate-400" : undefined}>
                  <TD className="whitespace-nowrap">{formatThaiDate(t.txnDate)}</TD>
                  <TD>
                    <span className="inline-flex items-center gap-2">
                      <Badge variant={t.type === "DEPOSIT" ? "green" : "red"}>
                        {t.type === "DEPOSIT" ? "ฝาก" : "ถอน"}
                      </Badge>
                      {voided && (
                        <Badge variant="gray" className="no-underline">
                          ยกเลิกแล้ว
                        </Badge>
                      )}
                    </span>
                  </TD>
                  <TD
                    align="right"
                    className={
                      voided
                        ? undefined
                        : t.type === "DEPOSIT"
                          ? "font-medium text-deposit"
                          : "font-medium text-withdraw"
                    }
                  >
                    {formatBaht(t.amount.toString())}
                  </TD>
                  <TD className="max-w-[16rem] truncate text-slate-500">{t.note ?? "-"}</TD>
                  <TD className="whitespace-nowrap text-slate-500">{t.recordedBy.name}</TD>
                </TR>
              );
            })}
            {transactions.length === 0 && (
              <TableEmpty colSpan={5} message="ยังไม่มีธุรกรรมในปีการศึกษานี้" />
            )}
          </TBody>
        </Table>
      </section>
    </div>
  );
}
