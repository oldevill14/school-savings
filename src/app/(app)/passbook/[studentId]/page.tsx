/**
 * /passbook/[studentId] — สมุดบัญชีเงินฝากรายคน (สไตล์สมุดธนาคาร)
 *
 * สิทธิ์ (ตรวจฝั่ง server):
 * - ADMIN / TEACHER: เปิดดูได้ทุกคน (ใช้ประกอบการบันทึก/ตรวจสอบ)
 * - PARENT: เปิดได้เฉพาะ studentId ที่อยู่ใน session.studentIds ของตนเอง (บุตรที่ผูกไว้) — คนอื่น 403
 *
 * ยอดคงเหลือในตาราง = running balance คำนวณสดจาก transactions (เฉพาะ status NORMAL)
 * เริ่มจาก openingBalance — ตรวจสอบย้อนหลังได้เสมอ ไม่พึ่งค่า denormalized เพียงอย่างเดียว
 *
 * print CSS อยู่ใน <style> ของหน้านี้เอง (@media print) — ไม่แตะ globals.css
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ScrollText, ShieldAlert } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSchoolSetting } from "@/lib/settings";
import Card from "@/components/ui/Card";
import BalanceCard from "@/components/BalanceCard";
import PassbookTable, {
  PassbookPrintButton,
  type PassbookRow,
} from "@/components/PassbookTable";
import SavingsTrendChart from "@/components/charts/SavingsTrendChart";
import { buildSavingsTrend, type MilestoneTxn } from "@/lib/milestones";
import { formatBaht } from "@/lib/money";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Prisma Decimal -> จำนวนสตางค์ (int) เพื่อเลี่ยง floating point ตอนคำนวณ running balance */
function toSatang(value: { toString(): string }): number {
  return Math.round(Number(value.toString()) * 100);
}

/** จำนวนสตางค์ -> string ทศนิยม 2 ตำแหน่ง เช่น "1234.50" */
function fromSatang(satang: number): string {
  return (satang / 100).toFixed(2);
}

export default async function PassbookPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await requireRole(["ADMIN", "TEACHER", "PARENT", "EXECUTIVE"]);
  const { studentId } = await params;
  const sp = await searchParams;

  // ---------- สิทธิ์สำคัญ: PARENT เปิดได้เฉพาะสมุดของบุตรที่ผูกไว้เท่านั้น ----------
  if (session.role === "PARENT" && !session.studentIds.includes(studentId)) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card className="text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-withdraw" aria-hidden="true" />
          <h1 className="mt-3 text-lg">403 — ไม่มีสิทธิ์เข้าถึง</h1>
          <p className="mt-1 text-sm text-slate-500">
            ผู้ปกครองสามารถเปิดดูสมุดบัญชีได้เฉพาะของบุตรหลานที่ผูกกับบัญชีผู้ใช้ของท่านเท่านั้น
          </p>
          <Link href="/my-child" className="link-navy mt-4 inline-block text-sm">
            กลับไปหน้ายอดของลูก
          </Link>
        </Card>
      </div>
    );
  }

  const school = await getSchoolSetting();

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      classroom: { select: { name: true } },
      accounts: {
        include: {
          academicYear: { select: { year: true, isActive: true, openedAt: true } },
        },
        orderBy: { academicYear: { year: "desc" } },
      },
    },
  });
  if (!student) notFound();

  const fullName = `${student.firstName} ${student.lastName}`;
  // EXECUTIVE เข้า /students/[id] ไม่ได้ (หน้านั้นสงวนให้ ADMIN/TEACHER) จึงย้อนไปหน้ารายชื่อแทน
  const backHref =
    session.role === "PARENT"
      ? "/my-child"
      : session.role === "EXECUTIVE"
        ? "/students"
        : `/students/${student.id}`;
  const backLabel =
    session.role === "PARENT"
      ? "ยอดของลูก"
      : session.role === "EXECUTIVE"
        ? "รายชื่อนักเรียน"
        : "โปรไฟล์นักเรียน";

  // ---------- เลือกปีการศึกษา (?year=2569) — default ปี active, ถัดมาปีล่าสุด ----------
  const yearParam = Number(sp.year);
  const account =
    student.accounts.find((a) => a.academicYear.year === yearParam) ??
    student.accounts.find((a) => a.academicYear.isActive) ??
    student.accounts[0] ??
    null;

  if (!account) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card className="text-center">
          <h1 className="text-lg">สมุดบัญชี — {fullName}</h1>
          <p className="mt-2 text-sm text-slate-500">
            นักเรียนคนนี้ยังไม่มีบัญชีออมทรัพย์ในระบบ
          </p>
          <Link href={backHref} className="link-navy mt-4 inline-block text-sm">
            กลับไปหน้า{backLabel}
          </Link>
        </Card>
      </div>
    );
  }

  // ---------- ธุรกรรมทั้งปี เรียงเก่า -> ใหม่ เพื่อคำนวณ running balance ----------
  const transactions = await prisma.transaction.findMany({
    where: { accountId: account.id },
    orderBy: [{ txnDate: "asc" }, { createdAt: "asc" }],
    include: { recordedBy: { select: { name: true } } },
  });

  let running = toSatang(account.openingBalance);
  let depositTotal = 0;
  let withdrawTotal = 0;

  const rows: PassbookRow[] = [
    {
      id: "opening-balance",
      date: account.academicYear.openedAt.toISOString(),
      description: "ยอดยกมา",
      type: "OPENING",
      deposit: null,
      withdraw: null,
      balance: fromSatang(running),
      recordedBy: "—",
      voided: false,
    },
  ];

  for (const t of transactions) {
    const voided = t.status === "VOIDED";
    const amount = toSatang(t.amount);
    if (!voided) {
      if (t.type === "DEPOSIT") {
        running += amount;
        depositTotal += amount;
      } else {
        running -= amount;
        withdrawTotal += amount;
      }
    }
    rows.push({
      id: t.id,
      date: t.txnDate.toISOString(),
      description:
        (t.type === "DEPOSIT" ? "ฝากเงิน" : "ถอนเงิน") + (t.note ? ` — ${t.note}` : ""),
      type: t.type,
      deposit: t.type === "DEPOSIT" ? fromSatang(amount) : null,
      withdraw: t.type === "WITHDRAW" ? fromSatang(amount) : null,
      balance: voided ? null : fromSatang(running),
      recordedBy: t.recordedBy.name,
      voided,
    });
  }

  const lastNormalTxn = [...transactions]
    .reverse()
    .find((t) => t.status === "NORMAL");
  const normalCount = transactions.filter((t) => t.status === "NORMAL").length;

  // กราฟยอดสะสมรายเดือน (ธุรกรรมปกติ) — สร้างฝั่ง server ส่งเข้ากราฟ client
  const trendData: MilestoneTxn[] = transactions.map((t) => ({
    type: t.type,
    status: t.status,
    txnDate: t.txnDate,
    amount: Number(t.amount),
  }));
  const trend = buildSavingsTrend(Number(account.openingBalance), trendData);

  return (
    <div className="space-y-4">
      {/* print CSS เฉพาะหน้านี้ — ซ่อน sidebar/topbar/mobile nav/ปุ่ม แล้วจัดหน้าให้อ่านชัดบน A4 */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body { background: #ffffff !important; }
          aside, header.sticky, nav.fixed, .print-hide { display: none !important; }
          main { padding: 0 !important; }
          .lg\\:pl-64 { padding-left: 0 !important; }
          .passbook-sheet { border: none !important; box-shadow: none !important; padding: 0 !important; }
          .passbook-sheet .card-surface { box-shadow: none !important; }
          .passbook-sheet table { font-size: 12px; }
          .passbook-sheet th, .passbook-sheet td { padding: 6px 8px !important; }
          .passbook-sheet tr { break-inside: avoid; }
        }
      `}</style>

      {/* แถบเครื่องมือ (ไม่พิมพ์) */}
      <div className="print-hide flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
          <h1 className="mt-1 text-xl">สมุดบัญชีเงินฝาก</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/passbook/${student.id}/certificate?year=${account.academicYear.year}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-navy transition-colors hover:bg-slate-50"
          >
            <ScrollText className="h-4 w-4" />
            เกียรติบัตร
          </Link>
          <PassbookPrintButton />
        </div>
      </div>

      {/* เลือกปีการศึกษา (ไม่พิมพ์) */}
      {student.accounts.length > 1 && (
        <div className="print-hide flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">ปีการศึกษา:</span>
          {student.accounts.map((a) => (
            <Link
              key={a.id}
              href={`/passbook/${student.id}?year=${a.academicYear.year}`}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                a.id === account.id
                  ? "border-navy bg-navy font-medium text-white"
                  : "border-line bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {a.academicYear.year}
              {a.academicYear.isActive && " (ปีปัจจุบัน)"}
            </Link>
          ))}
        </div>
      )}

      {/* การ์ดยอดคงเหลือ (ไม่พิมพ์ — บนกระดาษใช้ตารางสมุดบัญชีเป็นหลัก) */}
      <div className="print-hide">
        <BalanceCard
          title={`ยอดเงินคงเหลือ ปีการศึกษา ${account.academicYear.year}`}
          balance={account.balance.toString()}
          studentName={fullName}
          studentCode={student.studentCode}
          classroomName={student.classroom.name}
          updatedAt={lastNormalTxn?.txnDate}
        />
      </div>

      {/* กราฟยอดสะสมรายเดือน (ไม่พิมพ์) — แสดงเมื่อมีข้อมูลอย่างน้อย 2 เดือน */}
      {trend.length >= 2 && (
        <div className="print-hide">
          <Card title="กราฟการออม (ยอดสะสมรายเดือน)">
            <SavingsTrendChart data={trend} />
          </Card>
        </div>
      )}

      {/* ---------- ตัวสมุดบัญชี (ส่วนที่พิมพ์) ---------- */}
      <div className="passbook-sheet card-surface p-5 lg:p-6">
        {/* หัวสมุด: ตราโรงเรียน + ชื่อระบบ */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-navy pb-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-gold bg-navy"
              aria-hidden="true"
            >
              {/* ตราโรงเรียน — โลโก้ที่อัปโหลดจาก /settings (fallback: public/logo.png) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/api/branding/logo.png"
                alt="ตราโรงเรียน"
                className="h-9 w-9 object-contain"
              />
            </span>
            <div>
              <div className="text-lg font-bold leading-tight text-navy">
                {school.schoolName}
              </div>
              <div className="text-sm text-slate-600">{school.schoolArea}</div>
              <div className="text-sm font-semibold text-gold-dark">
                ระบบออมทรัพย์นักเรียน — สมุดบัญชีเงินฝาก
              </div>
            </div>
          </div>
          <dl className="text-sm">
            <div className="flex justify-between gap-6">
              <dt className="text-slate-500">เลขที่บัญชี</dt>
              <dd className="font-semibold tabular-nums text-navy">{student.studentCode}</dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt className="text-slate-500">ปีการศึกษา</dt>
              <dd className="font-semibold text-navy">{account.academicYear.year}</dd>
            </div>
          </dl>
        </div>

        {/* ข้อมูลเจ้าของบัญชี */}
        <div className="mt-4 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <span className="text-slate-500">ชื่อบัญชี:</span>
            <span className="font-medium">{fullName}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-slate-500">ห้องเรียน:</span>
            <span className="font-medium">{student.classroom.name}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-slate-500">ยอดยกมา:</span>
            <span className="font-medium tabular-nums">
              {formatBaht(account.openingBalance.toString())} บาท
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-slate-500">จำนวนรายการ:</span>
            <span className="font-medium tabular-nums">{normalCount} รายการ</span>
          </div>
        </div>

        {/* ตารางรายการ */}
        <PassbookTable rows={rows} className="mt-4" />

        {/* สรุปท้ายสมุด */}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-line pt-3 text-sm">
          <span>
            รวมฝาก{" "}
            <span className="font-semibold tabular-nums text-deposit">
              {formatBaht(fromSatang(depositTotal))}
            </span>{" "}
            บาท
          </span>
          <span>
            รวมถอน{" "}
            <span className="font-semibold tabular-nums text-withdraw">
              {formatBaht(fromSatang(withdrawTotal))}
            </span>{" "}
            บาท
          </span>
          <span>
            ยอดคงเหลือ{" "}
            <span className="font-bold tabular-nums text-navy">
              {formatBaht(fromSatang(running))}
            </span>{" "}
            บาท
          </span>
        </div>
      </div>
    </div>
  );
}
