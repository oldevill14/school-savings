/**
 * /passbook/[studentId]/certificate — เกียรติบัตรนักออม (พิมพ์ A4 แนวนอน)
 *
 * สิทธิ์ (ตรวจฝั่ง server) เหมือนหน้า /passbook:
 * - ADMIN / TEACHER / EXECUTIVE: เปิดของนักเรียนคนใดก็ได้
 * - PARENT: เฉพาะบุตรที่ผูกไว้ (session.studentIds) — คนอื่น 403
 *
 * เนื้อหา: ชื่อโรงเรียน (จาก getSchoolSetting) · ชื่อนักเรียน · ยอดเงินออม · ปีการศึกษา
 * + ช่องลงลายมือชื่อครูการเงิน/ผู้อำนวยการ — พิมพ์ลงกระดาษ A4 แนวนอน
 *
 * print CSS อยู่ใน <style> ของหน้านี้เอง (@media print) — ไม่แตะ globals.css
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSchoolSetting } from "@/lib/settings";
import { formatBaht } from "@/lib/money";
import { formatThaiDateFull } from "@/lib/thai-date";
import Card from "@/components/ui/Card";
import CertificatePrintButton from "./CertificatePrintButton";

export const dynamic = "force-dynamic";

export default async function CertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await requireRole(["ADMIN", "TEACHER", "PARENT", "EXECUTIVE"]);
  const { studentId } = await params;
  const sp = await searchParams;

  // ---------- สิทธิ์: PARENT เปิดได้เฉพาะบุตรที่ผูกไว้ ----------
  if (session.role === "PARENT" && !session.studentIds.includes(studentId)) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card className="text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-withdraw" aria-hidden="true" />
          <h1 className="mt-3 text-lg">403 — ไม่มีสิทธิ์เข้าถึง</h1>
          <p className="mt-1 text-sm text-slate-500">
            ผู้ปกครองพิมพ์เกียรติบัตรได้เฉพาะของบุตรหลานที่ผูกกับบัญชีของท่านเท่านั้น
          </p>
          <Link href="/my-child" className="link-navy mt-4 inline-block text-sm">
            กลับไปหน้ายอดของลูก
          </Link>
        </Card>
      </div>
    );
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      classroom: { select: { name: true } },
      accounts: {
        include: { academicYear: { select: { year: true, isActive: true } } },
        orderBy: { academicYear: { year: "desc" } },
      },
    },
  });
  if (!student) notFound();

  const fullName = `${student.firstName} ${student.lastName}`;
  const backHref = `/passbook/${student.id}`;

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
          <h1 className="text-lg">เกียรติบัตรนักออม — {fullName}</h1>
          <p className="mt-2 text-sm text-slate-500">
            นักเรียนคนนี้ยังไม่มีบัญชีออมทรัพย์ จึงยังออกเกียรติบัตรไม่ได้
          </p>
          <Link href={backHref} className="link-navy mt-4 inline-block text-sm">
            กลับไปหน้าสมุดบัญชี
          </Link>
        </Card>
      </div>
    );
  }

  const { schoolName, schoolArea } = await getSchoolSetting();
  const issuedDate = formatThaiDateFull(new Date());

  return (
    <div className="space-y-4">
      {/* print CSS เฉพาะหน้านี้ — A4 แนวนอน ซ่อน sidebar/topbar/ปุ่ม */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body { background: #ffffff !important; }
          aside, header.sticky, nav.fixed, .print-hide { display: none !important; }
          main { padding: 0 !important; }
          .lg\\:pl-64 { padding-left: 0 !important; }
          .cert-sheet {
            box-shadow: none !important;
            border-radius: 0 !important;
            width: 297mm !important;
            min-height: 210mm !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* แถบเครื่องมือ (ไม่พิมพ์) */}
      <div className="print-hide mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy"
          >
            <ArrowLeft className="h-4 w-4" />
            สมุดบัญชี
          </Link>
          <h1 className="mt-1 text-xl">เกียรติบัตรนักออม</h1>
        </div>
        <CertificatePrintButton />
      </div>

      {/* ---------- ตัวเกียรติบัตร (ส่วนที่พิมพ์) ---------- */}
      <div className="mx-auto w-full max-w-4xl">
        <div className="cert-sheet relative overflow-hidden rounded-card border-[6px] border-double border-gold bg-white p-8 shadow-card sm:p-12">
          {/* กรอบในสีน้ำเงินกรมท่า */}
          <div className="pointer-events-none absolute inset-3 rounded-sm border border-navy/25" aria-hidden="true" />

          <div className="relative flex flex-col items-center text-center">
            {/* ตราโรงเรียน — โลโก้ที่อัปโหลดจาก /settings (fallback: public/logo.png) */}
            <span
              className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-gold bg-navy"
              aria-hidden="true"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/api/branding/logo.png"
                alt="ตราโรงเรียน"
                className="h-10 w-10 object-contain"
              />
            </span>

            <div className="mt-3 text-lg font-bold text-navy">{schoolName}</div>
            <div className="text-sm text-slate-600">{schoolArea}</div>

            <h2 className="mt-6 text-3xl font-bold tracking-wide text-gold-dark">
              เกียรติบัตรนักออม
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              ปีการศึกษา {account.academicYear.year}
            </p>

            <p className="mt-6 text-base text-slate-600">มอบให้เพื่อแสดงว่า</p>
            <p className="mt-2 text-2xl font-bold text-navy">{fullName}</p>
            <p className="mt-1 text-sm text-slate-500">
              รหัสนักเรียน {student.studentCode} · ห้อง {student.classroom.name}
            </p>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-700">
              เป็นผู้มีวินัยในการออม มีเงินฝากสะสมในบัญชีออมทรัพย์นักเรียนรวมทั้งสิ้น
            </p>
            <p className="mt-3 text-4xl font-bold tabular-nums text-gold-dark">
              {formatBaht(account.balance.toString())} บาท
            </p>

            <p className="mt-6 text-sm text-slate-500">ให้ไว้ ณ วันที่ {issuedDate}</p>

            {/* ช่องลงลายมือชื่อ */}
            <div className="mt-10 grid w-full max-w-2xl grid-cols-1 gap-8 sm:grid-cols-2">
              <div className="flex flex-col items-center">
                <div className="h-10 w-full border-b border-dashed border-slate-400" />
                <div className="mt-2 text-sm text-slate-600">ลงชื่อ ครูการเงิน</div>
              </div>
              <div className="flex flex-col items-center">
                <div className="h-10 w-full border-b border-dashed border-slate-400" />
                <div className="mt-2 text-sm text-slate-600">ลงชื่อ ผู้อำนวยการโรงเรียน</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
