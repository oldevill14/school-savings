/**
 * /my-child — มุมผู้ปกครอง (PARENT เท่านั้น) — mobile-first
 *
 * - BalanceCard ใหญ่เห็นยอดคงเหลือใน 1 จอแรกโดยไม่ต้อง scroll
 * - ประวัติฝาก-ถอน 20 รายการล่าสุด + ปุ่ม "ดูสมุดบัญชี" ไป /passbook/[studentId]
 * - ดึงข้อมูลจาก session.linkedStudentId เท่านั้น (ตรวจฝั่ง server) —
 *   ผู้ปกครองเห็นได้เฉพาะบัญชีของลูกตนเอง
 */
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { formatThaiDate } from "@/lib/thai-date";
import { cn } from "@/lib/utils";
import BalanceCard from "@/components/BalanceCard";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";

export const dynamic = "force-dynamic";

export default async function MyChildPage() {
  const session = await requireRole(["PARENT"]);

  // ผู้ปกครองต้องถูกผูกกับนักเรียนก่อนจึงเห็นข้อมูลได้
  if (!session.linkedStudentId) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4">
        <h1 className="text-xl">ยอดของลูก</h1>
        <Card title="ยังไม่ได้ผูกบัญชีกับนักเรียน">
          <p className="text-sm text-slate-600">
            บัญชีผู้ใช้ของท่านยังไม่ได้เชื่อมกับนักเรียนคนใด
            กรุณาติดต่อครูการเงินหรือครูประจำชั้นเพื่อผูกบัญชีกับบุตรหลานของท่าน
          </p>
        </Card>
      </div>
    );
  }

  const student = await prisma.student.findUnique({
    where: { id: session.linkedStudentId },
    include: { classroom: true },
  });

  if (!student) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4">
        <h1 className="text-xl">ยอดของลูก</h1>
        <Card title="ไม่พบข้อมูลนักเรียน">
          <p className="text-sm text-slate-600">
            ไม่พบข้อมูลนักเรียนที่ผูกกับบัญชีของท่านในระบบ
            กรุณาติดต่อครูการเงินเพื่อตรวจสอบข้อมูล
          </p>
        </Card>
      </div>
    );
  }

  // บัญชีของปีการศึกษาที่ active — ถ้าไม่มี ใช้บัญชีปีล่าสุดแทน (เช่น ช่วงคาบเกี่ยวเปลี่ยนปี)
  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
  });

  let account = activeYear
    ? await prisma.account.findUnique({
        where: {
          studentId_academicYearId: {
            studentId: student.id,
            academicYearId: activeYear.id,
          },
        },
        include: { academicYear: true },
      })
    : null;

  if (!account) {
    account = await prisma.account.findFirst({
      where: { studentId: student.id },
      orderBy: { academicYear: { year: "desc" } },
      include: { academicYear: true },
    });
  }

  const studentName = `${student.firstName} ${student.lastName}`;

  if (!account) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4">
        <h1 className="text-xl">ยอดของลูก</h1>
        <Card title="ยังไม่มีบัญชีออมทรัพย์">
          <p className="text-sm text-slate-600">
            {studentName} ({student.studentCode}) ยังไม่มีบัญชีออมทรัพย์ในระบบ
            กรุณาติดต่อครูประจำชั้นเพื่อเปิดบัญชี
          </p>
        </Card>
      </div>
    );
  }

  const transactions = await prisma.transaction.findMany({
    where: { accountId: account.id },
    orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
    take: 20,
  });

  const lastTxnDate = transactions[0]?.txnDate;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <div>
        <h1 className="text-xl">ยอดของลูก</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          ปีการศึกษา {account.academicYear.year}
        </p>
      </div>

      {/* ยอดคงเหลือ — ต้องเห็นใน 1 จอแรกบนมือถือ */}
      <BalanceCard
        studentName={studentName}
        studentCode={student.studentCode}
        classroomName={student.classroom.name}
        balance={account.balance.toString()}
        updatedAt={lastTxnDate}
      />

      <Link
        href={`/passbook/${student.id}`}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-navy-light"
      >
        <BookOpen className="h-4 w-4" />
        ดูสมุดบัญชี
      </Link>

      {/* ประวัติ 20 รายการล่าสุด */}
      <section className="space-y-3">
        <h2 className="text-base">ประวัติล่าสุด 20 รายการ</h2>
        <Table minWidth="360px">
          <THead>
            <TR>
              <TH>วันที่</TH>
              <TH>รายการ</TH>
              <TH align="right">จำนวนเงิน</TH>
            </TR>
          </THead>
          <TBody>
            {transactions.map((t) => {
              const voided = t.status === "VOIDED";
              const isDeposit = t.type === "DEPOSIT";
              return (
                <TR key={t.id}>
                  <TD
                    className={cn(
                      "whitespace-nowrap",
                      voided && "line-through text-slate-400"
                    )}
                  >
                    {formatThaiDate(t.txnDate)}
                  </TD>
                  <TD>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={isDeposit ? "green" : "red"}>
                        {isDeposit ? "ฝาก" : "ถอน"}
                      </Badge>
                      {voided && <Badge variant="gray">ยกเลิกแล้ว</Badge>}
                    </span>
                    {t.note && (
                      <span
                        className={cn(
                          "mt-1 block text-xs text-slate-400",
                          voided && "line-through"
                        )}
                      >
                        {t.note}
                      </span>
                    )}
                  </TD>
                  <TD
                    align="right"
                    className={cn(
                      "font-medium",
                      voided
                        ? "line-through text-slate-400"
                        : isDeposit
                          ? "text-deposit"
                          : "text-withdraw"
                    )}
                  >
                    {isDeposit ? "+" : "-"}
                    {formatBaht(t.amount)}
                  </TD>
                </TR>
              );
            })}
            {transactions.length === 0 && (
              <TableEmpty colSpan={3} message="ยังไม่มีรายการฝาก-ถอน" />
            )}
          </TBody>
        </Table>
      </section>
    </div>
  );
}
