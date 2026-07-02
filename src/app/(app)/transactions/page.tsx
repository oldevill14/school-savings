/**
 * /transactions — ประวัติธุรกรรม + ตัวกรอง + แบ่งหน้า (ADMIN, TEACHER)
 *
 * - TEACHER เห็นเฉพาะธุรกรรมของนักเรียนในห้องที่ตนประจำชั้น (เช็คฝั่ง server)
 * - ตัวกรอง: ห้องเรียน / วันที่จาก-ถึง / ประเภท (form GET — ไม่ต้องใช้ JS)
 * - ฝากเขียว ถอนแดง · รายการ VOIDED ขีดฆ่า + ป้าย "ยกเลิกแล้ว"
 * - ADMIN ยกเลิกรายการได้ (VoidTransactionButton → PATCH /api/transactions)
 */
import Link from "next/link";
import type { Prisma, TransactionType } from "@prisma/client";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  History,
  Search,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBaht, formatBahtText } from "@/lib/money";
import { formatThaiDate, formatThaiDateTime } from "@/lib/thai-date";
import { cn } from "@/lib/utils";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import StatCard from "@/components/StatCard";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";
import VoidTransactionButton from "./VoidTransactionButton";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<{
    classroomId?: string;
    from?: string;
    to?: string;
    type?: string;
    page?: string;
  }>;
}

/** แปลงพารามิเตอร์วันที่ "YYYY-MM-DD" (ค่าไม่ถูกต้อง -> null) */
function parseDateParam(value: string | undefined, endOfDay = false): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** สร้าง query string จากตัวกรอง (ตัดค่าว่างทิ้ง) */
function buildQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) q.set(key, value);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export default async function TransactionsPage({ searchParams }: PageProps) {
  const session = await requireRole(["ADMIN", "TEACHER"]);
  const sp = await searchParams;

  // ---------- ห้องเรียนที่มีสิทธิ์เห็น ----------
  // TEACHER: เฉพาะห้องที่ตนประจำชั้น · ADMIN: ทุกห้อง
  const classrooms = await prisma.classroom.findMany({
    where: session.role === "TEACHER" ? { teacherId: session.userId } : {},
    include: { academicYear: { select: { year: true } } },
    orderBy: [{ academicYear: { year: "desc" } }, { name: "asc" }],
  });
  const classroomOptions = classrooms.map((c) => ({
    value: c.id,
    label: `${c.name} (ปี ${c.academicYear.year})`,
  }));
  const allowedClassroomIds = classrooms.map((c) => c.id);

  // ---------- ตัวกรอง ----------
  const selectedClassroomId = allowedClassroomIds.includes(sp.classroomId ?? "")
    ? sp.classroomId
    : undefined;

  // ขอบเขตห้อง: teacher ถูกจำกัดที่ห้องตัวเองเสมอ แม้ไม่ได้เลือกตัวกรอง
  const scopeClassroomIds: string[] | undefined =
    session.role === "TEACHER"
      ? selectedClassroomId
        ? [selectedClassroomId]
        : allowedClassroomIds
      : selectedClassroomId
        ? [selectedClassroomId]
        : undefined;

  const fromDate = parseDateParam(sp.from);
  const toDate = parseDateParam(sp.to, true);
  const typeFilter: TransactionType | undefined =
    sp.type === "DEPOSIT" || sp.type === "WITHDRAW" ? sp.type : undefined;

  const where: Prisma.TransactionWhereInput = {
    ...(scopeClassroomIds
      ? { account: { student: { classroomId: { in: scopeClassroomIds } } } }
      : {}),
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(fromDate || toDate
      ? {
          txnDate: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  // ---------- นับรวม + สรุปยอด (เฉพาะรายการปกติ) + ดึงหน้าปัจจุบัน ----------
  const [total, depositAgg, withdrawAgg] = await Promise.all([
    prisma.transaction.count({ where }),
    typeFilter === "WITHDRAW"
      ? Promise.resolve(null)
      : prisma.transaction.aggregate({
          where: { ...where, type: "DEPOSIT", status: "NORMAL" },
          _sum: { amount: true },
        }),
    typeFilter === "DEPOSIT"
      ? Promise.resolve(null)
      : prisma.transaction.aggregate({
          where: { ...where, type: "WITHDRAW", status: "NORMAL" },
          _sum: { amount: true },
        }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requestedPage = Number.parseInt(sp.page ?? "1", 10);
  const page = Math.min(
    Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1),
    totalPages
  );

  const transactions = await prisma.transaction.findMany({
    where,
    include: {
      account: {
        include: {
          student: { include: { classroom: { select: { name: true } } } },
          // ใช้ตัดสินว่าแสดงปุ่มยกเลิกหรือไม่ — ปีที่ปิดแล้วยอดถูกยกไปปีใหม่ ห้าม void
          academicYear: { select: { isActive: true } },
        },
      },
      recordedBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
    },
    orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const depositTotal = Number(depositAgg?._sum.amount ?? 0);
  const withdrawTotal = Number(withdrawAgg?._sum.amount ?? 0);

  const filterParams = {
    classroomId: selectedClassroomId,
    from: fromDate ? sp.from : undefined,
    to: toDate ? sp.to : undefined,
    type: typeFilter,
  };
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, total);
  const colSpan = session.role === "ADMIN" ? 9 : 8;

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-navy text-white">
          <History className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl">ประวัติธุรกรรม</h1>
          <p className="text-sm text-slate-500">
            {session.role === "TEACHER"
              ? "ธุรกรรมของนักเรียนในห้องที่คุณประจำชั้น"
              : "ธุรกรรมฝาก-ถอนทั้งโรงเรียน"}{" "}
            · รายการที่ยกเลิกจะแสดงแบบขีดฆ่า (ไม่มีการลบข้อมูล)
          </p>
        </div>
      </header>

      {/* สรุปตามตัวกรอง */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="ฝากรวม (ตามตัวกรอง)"
          value={formatBahtText(depositTotal)}
          icon={ArrowDownToLine}
          tone="green"
          hint="เฉพาะรายการปกติ"
        />
        <StatCard
          title="ถอนรวม (ตามตัวกรอง)"
          value={formatBahtText(withdrawTotal)}
          icon={ArrowUpFromLine}
          tone="red"
          hint="เฉพาะรายการปกติ"
        />
        <StatCard
          title="จำนวนรายการ"
          value={`${total.toLocaleString("th-TH")} รายการ`}
          icon={History}
          tone="navy"
          hint={`หน้า ${page} จาก ${totalPages}`}
        />
      </div>

      {/* ตัวกรอง — form GET ธรรมดา ทำงานได้โดยไม่ต้องใช้ JS */}
      <Card padded>
        <form
          method="get"
          action="/transactions"
          className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <Select
            name="classroomId"
            label="ห้องเรียน"
            placeholder={session.role === "TEACHER" ? "ทุกห้องของฉัน" : "ทุกห้อง"}
            options={classroomOptions}
            defaultValue={selectedClassroomId ?? ""}
          />
          <Input
            name="from"
            type="date"
            label="จากวันที่"
            defaultValue={fromDate ? sp.from : ""}
          />
          <Input
            name="to"
            type="date"
            label="ถึงวันที่"
            defaultValue={toDate ? sp.to : ""}
          />
          <Select
            name="type"
            label="ประเภท"
            placeholder="ทั้งหมด"
            options={[
              { value: "DEPOSIT", label: "ฝาก" },
              { value: "WITHDRAW", label: "ถอน" },
            ]}
            defaultValue={typeFilter ?? ""}
          />
          <div className="flex items-center gap-2">
            <Button type="submit">
              <Search className="h-4 w-4" />
              กรอง
            </Button>
            <Link href="/transactions" className="link-navy text-sm">
              ล้างตัวกรอง
            </Link>
          </div>
        </form>
      </Card>

      {/* ตารางประวัติ */}
      <Table minWidth="1080px">
        <THead>
          <TR>
            <TH>วันที่</TH>
            <TH>นักเรียน</TH>
            <TH>ห้อง</TH>
            <TH>ประเภท</TH>
            <TH align="right">จำนวนเงิน (บาท)</TH>
            <TH>ผู้บันทึก</TH>
            <TH>หมายเหตุ</TH>
            <TH>สถานะ</TH>
            {session.role === "ADMIN" && <TH align="center">จัดการ</TH>}
          </TR>
        </THead>
        <TBody>
          {transactions.map((t) => {
            const student = t.account.student;
            const isVoided = t.status === "VOIDED";
            const voidedText = cn(isVoided && "line-through text-slate-400");
            const isDeposit = t.type === "DEPOSIT";
            return (
              <TR key={t.id}>
                <TD className={voidedText}>
                  <span className="whitespace-nowrap">{formatThaiDateTime(t.txnDate)}</span>
                </TD>
                <TD className={voidedText}>
                  <div className={cn("font-medium", !isVoided && "text-slate-900")}>
                    {student.firstName} {student.lastName}
                  </div>
                  <div className={cn("text-xs", isVoided ? "text-slate-400" : "text-slate-500")}>
                    รหัส {student.studentCode}
                  </div>
                </TD>
                <TD className={voidedText}>{student.classroom.name}</TD>
                <TD>
                  <Badge variant={isVoided ? "gray" : isDeposit ? "green" : "red"}>
                    {isDeposit ? "ฝาก" : "ถอน"}
                  </Badge>
                </TD>
                <TD
                  align="right"
                  className={cn(
                    "font-medium",
                    isVoided
                      ? "line-through text-slate-400"
                      : isDeposit
                        ? "text-deposit"
                        : "text-withdraw"
                  )}
                >
                  {isDeposit ? "+" : "-"}
                  {formatBaht(t.amount)}
                </TD>
                <TD className={isVoided ? voidedText : "text-slate-600"}>
                  {t.recordedBy.name}
                </TD>
                <TD className={cn("max-w-[16rem]", isVoided ? voidedText : "text-slate-600")}>
                  {t.note ?? "-"}
                </TD>
                <TD>
                  {isVoided ? (
                    <div className="space-y-0.5">
                      <Badge variant="gray">ยกเลิกแล้ว</Badge>
                      <div className="text-xs text-slate-400">
                        โดย {t.voidedBy?.name ?? "-"}
                        {t.voidedAt ? ` · ${formatThaiDate(t.voidedAt)}` : ""}
                      </div>
                    </div>
                  ) : (
                    <Badge variant="green">ปกติ</Badge>
                  )}
                </TD>
                {session.role === "ADMIN" && (
                  <TD align="center">
                    {/* ปุ่มยกเลิกเฉพาะรายการปกติของปีการศึกษาที่ active —
                        ปีที่ปิดแล้วยอดถูกยกไปปีใหม่ void ไม่ได้ (server บังคับซ้ำอีกชั้น) */}
                    {!isVoided && t.account.academicYear.isActive && (
                      <VoidTransactionButton
                        transactionId={t.id}
                        description={`${isDeposit ? "ฝาก" : "ถอน"} ${formatBaht(t.amount)} บาท — ${student.firstName} ${student.lastName} (${formatThaiDate(t.txnDate)})`}
                      />
                    )}
                  </TD>
                )}
              </TR>
            );
          })}
          {transactions.length === 0 && (
            <TableEmpty colSpan={colSpan} message="ไม่พบธุรกรรมตามเงื่อนไขที่เลือก" />
          )}
        </TBody>
      </Table>

      {/* แบ่งหน้า */}
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-slate-500">
          แสดง {showingFrom.toLocaleString("th-TH")}–{showingTo.toLocaleString("th-TH")}{" "}
          จาก {total.toLocaleString("th-TH")} รายการ
        </p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={`/transactions${buildQuery({ ...filterParams, page: String(page - 1) })}`}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-white px-3 text-sm text-navy hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
              ก่อนหน้า
            </Link>
          ) : (
            <span className="inline-flex h-9 cursor-not-allowed items-center gap-1 rounded-lg border border-line bg-white px-3 text-sm text-slate-300">
              <ChevronLeft className="h-4 w-4" />
              ก่อนหน้า
            </span>
          )}
          <span className="text-sm text-slate-600">
            หน้า {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/transactions${buildQuery({ ...filterParams, page: String(page + 1) })}`}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-white px-3 text-sm text-navy hover:bg-slate-50"
            >
              ถัดไป
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="inline-flex h-9 cursor-not-allowed items-center gap-1 rounded-lg border border-line bg-white px-3 text-sm text-slate-300">
              ถัดไป
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
