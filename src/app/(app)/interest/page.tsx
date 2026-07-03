/**
 * /interest — จ่ายดอกเบี้ยประจำปี (ข้อ 7) — ADMIN เท่านั้น
 *
 * middleware กัน route นี้ให้เฉพาะ ADMIN แล้ว — ยังเช็ค role ซ้ำที่นี่
 * แสดงปีที่เปิดอยู่ + จำนวนบัญชี/ยอดรวม แล้วส่งบัญชีทั้งหมดให้ InterestForm (client)
 * คำนวณ preview; การจ่ายจริงทำใน POST /api/interest (คำนวณซ้ำฝั่ง server)
 */
import { Percent, PiggyBank, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import Card from "@/components/ui/Card";
import StatCard from "@/components/StatCard";
import InterestForm from "./InterestForm";
import type { InterestAccountInput } from "./interest-calc";

export const dynamic = "force-dynamic";

export default async function InterestPage() {
  await requireRole(["ADMIN"]);

  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
  });

  if (!activeYear) {
    return (
      <div className="space-y-4">
        <header className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-card bg-navy text-white">
            <Percent className="h-5 w-5" />
          </span>
          <h1 className="text-xl">จ่ายดอกเบี้ยประจำปี</h1>
        </header>
        <Card title="ยังไม่มีปีการศึกษาที่เปิดใช้งาน">
          <p className="text-sm text-slate-600">
            กรุณาเปิดปีการศึกษาที่เมนู &ldquo;ปีการศึกษา&rdquo; ก่อนจึงจะจ่ายดอกเบี้ยได้
          </p>
        </Card>
      </div>
    );
  }

  const accountsRaw = await prisma.account.findMany({
    where: { academicYearId: activeYear.id },
    select: {
      id: true,
      studentId: true,
      balance: true,
      student: {
        select: {
          studentCode: true,
          firstName: true,
          lastName: true,
          classroom: { select: { name: true } },
        },
      },
    },
  });

  const accounts: InterestAccountInput[] = accountsRaw
    .map((a) => ({
      accountId: a.id,
      studentId: a.studentId,
      studentCode: a.student.studentCode,
      studentName: `${a.student.firstName} ${a.student.lastName}`,
      classroomName: a.student.classroom.name,
      balance: Number(a.balance),
    }))
    .sort((x, y) => x.studentCode.localeCompare(y.studentCode, "th"));

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  const priorCount = await prisma.transaction.count({
    where: {
      category: "INTEREST",
      status: "NORMAL",
      account: { academicYearId: activeYear.id },
    },
  });

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-navy text-white">
          <Percent className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl">จ่ายดอกเบี้ยประจำปี</h1>
          <p className="text-sm text-slate-500">
            ปีการศึกษา {activeYear.year} · ดอกเบี้ย = ยอดคงเหลือ × อัตรา (ปัดลงเป็นสตางค์)
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          title="จำนวนบัญชีปีนี้"
          value={`${accounts.length.toLocaleString("th-TH")} บัญชี`}
          icon={PiggyBank}
          tone="navy"
        />
        <StatCard
          title="ยอดเงินรวมทุกบัญชี"
          value={formatBaht(totalBalance)}
          icon={Wallet}
          tone="gold"
        />
      </div>

      <Card
        title="คำนวณและจ่ายดอกเบี้ย"
        description="กรอกอัตราดอกเบี้ยเพื่อดูตัวอย่างรายบัญชี แล้วยืนยันด้วยการพิมพ์เลขปี"
      >
        <InterestForm
          year={activeYear.year}
          accounts={accounts}
          alreadyPaid={priorCount > 0}
          priorCount={priorCount}
        />
      </Card>
    </div>
  );
}
