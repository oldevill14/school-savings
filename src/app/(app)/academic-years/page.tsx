"use client";

/**
 * /academic-years — จัดการปีการศึกษา (ADMIN เท่านั้น)
 *
 * รายการปีทั้งหมด + ปุ่ม "ปิดปีการศึกษา + เปิดปีใหม่" พร้อม modal ยืนยัน 2 ชั้น
 * (ชั้นที่ 1: อ่านผลกระทบ / ชั้นที่ 2: พิมพ์เลขปีเพื่อยืนยัน) -> POST /api/academic-years/close
 *
 * สิทธิ์ถูกบังคับฝั่ง server: middleware (prefix /academic-years = ADMIN)
 * + requireRoleApi(["ADMIN"]) ในทุก endpoint
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";
import { formatBaht } from "@/lib/money";
import { formatThaiDate } from "@/lib/thai-date";

interface YearRow {
  id: string;
  year: number;
  isActive: boolean;
  openedAt: string;
  closedAt: string | null;
  classroomCount: number;
  accountCount: number;
  totalBalance: number;
}

interface CloseSummary {
  closedYear: number;
  newYear: number;
  classroomsCreated: number;
  promoted: number;
  graduated: number;
  accountsCreated: number;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default function AcademicYearsPage() {
  const [years, setYears] = useState<YearRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // modal ปิดปี: step 1 = ผลกระทบ, step 2 = พิมพ์เลขปียืนยัน, step 3 = ผลลัพธ์
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [confirmText, setConfirmText] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [summary, setSummary] = useState<CloseSummary | null>(null);

  const refresh = useCallback(async () => {
    setPageError(null);
    try {
      const res = await fetch("/api/academic-years", { cache: "no-store" });
      const json = await readJson(res);
      if (!res.ok) {
        throw new Error((json.error as string) || "โหลดข้อมูลไม่สำเร็จ");
      }
      setYears((json.years as YearRow[]) ?? []);
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeYear = years?.find((y) => y.isActive) ?? null;

  function openCloseFlow() {
    setConfirmText("");
    setCloseError(null);
    setSummary(null);
    setStep(1);
  }

  function closeModal() {
    if (closing) return;
    const wasDone = step === 3;
    setStep(0);
    if (wasDone) void refresh();
  }

  async function submitClose() {
    if (!activeYear) return;
    setClosing(true);
    setCloseError(null);
    try {
      const res = await fetch("/api/academic-years/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmYear: Number(confirmText) }),
      });
      const json = await readJson(res);
      if (!res.ok) {
        setCloseError((json.error as string) || "ปิดปีการศึกษาไม่สำเร็จ");
        return;
      }
      setSummary(json.summary as unknown as CloseSummary);
      setStep(3);
    } catch {
      setCloseError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่");
    } finally {
      setClosing(false);
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-slate-500">กำลังโหลดข้อมูล...</div>
    );
  }

  if (pageError) {
    return (
      <Card title="ปีการศึกษา">
        <p className="text-sm text-withdraw">{pageError}</p>
        <div className="mt-4">
          <Button variant="secondary" onClick={() => void refresh()}>
            ลองใหม่
          </Button>
        </div>
      </Card>
    );
  }

  const confirmMatched = activeYear !== null && confirmText.trim() === String(activeYear.year);

  return (
    <div className="space-y-6">
      {/* ส่วนหัว */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ปีการศึกษา</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {activeYear
              ? `ปีการศึกษาที่กำลังใช้งาน: ${activeYear.year}`
              : "ยังไม่มีปีการศึกษาที่กำลังใช้งาน"}
          </p>
        </div>
        <Button variant="danger" onClick={openCloseFlow} disabled={!activeYear}>
          <CalendarDays className="h-4 w-4" />
          ปิดปีการศึกษา + เปิดปีใหม่
        </Button>
      </div>

      {/* ตารางปี */}
      <Table minWidth="760px">
        <THead>
          <TR>
            <TH>ปีการศึกษา</TH>
            <TH>สถานะ</TH>
            <TH>เปิดเมื่อ</TH>
            <TH>ปิดเมื่อ</TH>
            <TH align="right">ห้องเรียน</TH>
            <TH align="right">บัญชี</TH>
            <TH align="right">ยอดรวม (บาท)</TH>
          </TR>
        </THead>
        <TBody>
          {(years ?? []).map((y) => (
            <TR key={y.id}>
              <TD className="font-medium text-slate-900">{y.year}</TD>
              <TD>
                {y.isActive ? (
                  <Badge variant="green">กำลังใช้งาน</Badge>
                ) : (
                  <Badge variant="gray">ปิดแล้ว</Badge>
                )}
              </TD>
              <TD>{formatThaiDate(y.openedAt)}</TD>
              <TD>{y.closedAt ? formatThaiDate(y.closedAt) : "-"}</TD>
              <TD align="right">{y.classroomCount}</TD>
              <TD align="right">{y.accountCount}</TD>
              <TD align="right" className="font-medium">
                {formatBaht(y.totalBalance)}
              </TD>
            </TR>
          ))}
          {(years ?? []).length === 0 && (
            <TableEmpty colSpan={7} message="ยังไม่มีปีการศึกษาในระบบ" />
          )}
        </TBody>
      </Table>

      {/* Modal ปิดปีการศึกษา — ยืนยัน 2 ชั้น */}
      <Modal
        open={step > 0}
        onClose={closeModal}
        size="lg"
        title={
          step === 3
            ? "ปิดปีการศึกษาเรียบร้อย"
            : `ปิดปีการศึกษา ${activeYear?.year ?? ""} และเปิดปีการศึกษา ${
                activeYear ? activeYear.year + 1 : ""
              }`
        }
        footer={
          step === 1 ? (
            <>
              <Button variant="secondary" onClick={closeModal}>
                ยกเลิก
              </Button>
              <Button variant="danger" onClick={() => setStep(2)}>
                ดำเนินการต่อ
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          ) : step === 2 ? (
            <>
              <Button variant="secondary" onClick={() => setStep(1)} disabled={closing}>
                ย้อนกลับ
              </Button>
              <Button
                variant="danger"
                onClick={() => void submitClose()}
                disabled={!confirmMatched || closing}
              >
                {closing ? "กำลังดำเนินการ..." : "ยืนยันปิดปีการศึกษา"}
              </Button>
            </>
          ) : (
            <Button onClick={closeModal}>ปิดหน้าต่าง</Button>
          )
        }
      >
        {/* ชั้นที่ 1: อธิบายผลกระทบ */}
        {step === 1 && activeYear && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              ระบบจะดำเนินการต่อไปนี้ทั้งหมดในคราวเดียว (สำเร็จทั้งหมดหรือยกเลิกทั้งหมด):
            </p>
            <ul className="list-inside list-disc space-y-1.5 text-sm text-slate-700">
              <li>
                ปิดปีการศึกษา <span className="font-semibold">{activeYear.year}</span>{" "}
                (บันทึกวันปิด — ข้อมูลและธุรกรรมเดิมยังอยู่ครบ ตรวจสอบย้อนหลังได้)
              </li>
              <li>
                เปิดปีการศึกษา{" "}
                <span className="font-semibold">{activeYear.year + 1}</span> เป็นปีที่กำลังใช้งาน
              </li>
              <li>สร้างห้องเรียนชุดใหม่ของปีใหม่ (ครูประจำชั้นคงอยู่ชั้นเดิม)</li>
              <li>เลื่อนชั้นนักเรียนอัตโนมัติ: ป.1 → ป.2, ป.2 → ป.3, ... , ป.5 → ป.6</li>
              <li>
                นักเรียน ป.6 เปลี่ยนสถานะเป็น{" "}
                <Badge variant="gray">จบการศึกษา</Badge> (ไม่สร้างบัญชีปีใหม่)
              </li>
              <li>
                สร้างบัญชีออมทรัพย์ปีใหม่ให้นักเรียนทุกคนที่เลื่อนชั้น โดย{" "}
                <span className="font-semibold">ยกยอดคงเหลือปีเดิมเป็นยอดยกมา</span>
              </li>
            </ul>
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-withdraw">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                การดำเนินการนี้ <span className="font-semibold">ย้อนกลับไม่ได้</span> —
                โปรดตรวจสอบให้แน่ใจว่าบันทึกธุรกรรมของปี {activeYear.year} ครบถ้วนแล้ว
              </span>
            </div>
          </div>
        )}

        {/* ชั้นที่ 2: พิมพ์เลขปียืนยัน */}
        {step === 2 && activeYear && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              เพื่อยืนยันการปิดปีการศึกษา กรุณาพิมพ์เลขปี{" "}
              <span className="font-semibold text-slate-900">{activeYear.year}</span>{" "}
              ในช่องด้านล่าง
            </p>
            <Input
              label={`พิมพ์ "${activeYear.year}" เพื่อยืนยัน`}
              placeholder={String(activeYear.year)}
              inputMode="numeric"
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              error={
                confirmText.length > 0 && !confirmMatched
                  ? "เลขปีไม่ตรงกับปีการศึกษาที่กำลังใช้งาน"
                  : undefined
              }
            />
            {closeError && <p className="text-sm text-withdraw">{closeError}</p>}
          </div>
        )}

        {/* ผลลัพธ์ */}
        {step === 3 && summary && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-deposit">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                ปิดปีการศึกษา {summary.closedYear} และเปิดปีการศึกษา {summary.newYear}{" "}
                เรียบร้อยแล้ว
              </span>
            </div>
            <ul className="list-inside list-disc space-y-1.5 text-sm text-slate-700">
              <li>สร้างห้องเรียนปีใหม่ {summary.classroomsCreated} ห้อง</li>
              <li>เลื่อนชั้นนักเรียน {summary.promoted} คน</li>
              <li>นักเรียนจบการศึกษา (ป.6) {summary.graduated} คน</li>
              <li>สร้างบัญชีปีใหม่พร้อมยอดยกมา {summary.accountsCreated} บัญชี</li>
            </ul>
          </div>
        )}
      </Modal>
    </div>
  );
}
