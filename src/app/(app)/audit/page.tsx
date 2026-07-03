/**
 * /audit — บันทึกการตรวจสอบ (Audit log) สำหรับผู้ดูแลระบบ (ADMIN)
 *
 * ตาราง AuditLog กรองตามประเภทการกระทำ + ช่วงวันที่ + แบ่งหน้า
 * พร้อมคำอธิบาย action เป็นภาษาไทย (form GET — ไม่ต้องใช้ JS)
 *
 * หมายเหตุ: AuditLog ไม่มี FK ไปยัง User (อยู่รอดแม้ user ถูกลบ) จึง resolve
 * ชื่อผู้ใช้เองด้วย map ของหน้าปัจจุบัน — userId ที่หาไม่เจอ = ผู้ใช้ถูกลบแล้ว
 */
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ChevronLeft, ChevronRight, ScrollText, Search } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AuditAction } from "@/lib/audit";
import { formatThaiDateTime } from "@/lib/thai-date";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

type BadgeVariant = "navy" | "green" | "red" | "gold" | "gray";

/** คำอธิบาย action ภาษาไทย + สีป้าย (คีย์ = ค่าใน AuditAction) */
const ACTION_META: Record<string, { label: string; variant: BadgeVariant }> = {
  [AuditAction.LOGIN_SUCCESS]: { label: "เข้าสู่ระบบสำเร็จ", variant: "green" },
  [AuditAction.LOGIN_FAIL]: { label: "เข้าสู่ระบบล้มเหลว", variant: "red" },
  [AuditAction.PASSWORD_CHANGE]: { label: "เปลี่ยนรหัสผ่าน", variant: "navy" },
  [AuditAction.PASSWORD_RESET]: { label: "รีเซ็ตรหัสผ่าน (โดยผู้ดูแล)", variant: "gold" },
  [AuditAction.USER_DISABLE]: { label: "ปิดใช้งานผู้ใช้", variant: "red" },
  [AuditAction.USER_ENABLE]: { label: "เปิดใช้งานผู้ใช้", variant: "green" },
  [AuditAction.TXN_VOID]: { label: "ยกเลิกธุรกรรม", variant: "red" },
  [AuditAction.YEAR_CLOSE]: { label: "ปิดปีการศึกษา", variant: "gold" },
  [AuditAction.INTEREST_PAYOUT]: { label: "จ่ายดอกเบี้ย", variant: "gold" },
  [AuditAction.CASH_CLOSE]: { label: "ปิดยอดเงินสด", variant: "navy" },
  [AuditAction.SETTINGS_UPDATE]: { label: "แก้ไขตั้งค่าโรงเรียน", variant: "navy" },
  [AuditAction.LOGO_UPDATE]: { label: "เปลี่ยนโลโก้โรงเรียน", variant: "navy" },
  [AuditAction.PHOTO_UPDATE]: { label: "เปลี่ยนรูปนักเรียน", variant: "navy" },
};

const ACTION_OPTIONS = Object.entries(ACTION_META).map(([value, meta]) => ({
  value,
  label: meta.label,
}));

/** แปลงพารามิเตอร์วันที่ "YYYY-MM-DD" (ค่าไม่ถูกต้อง -> null) */
function parseDateParam(value: string | undefined, endOfDay = false): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** สร้าง query string จากตัวกรอง (ตัดค่าว่างทิ้ง) */
function buildQuery(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

interface PageProps {
  searchParams: Promise<{
    action?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}

export default async function AuditPage({ searchParams }: PageProps) {
  await requireRole(["ADMIN"]);
  const sp = await searchParams;

  const actionFilter = sp.action && ACTION_META[sp.action] ? sp.action : undefined;
  const fromDate = parseDateParam(sp.from);
  const toDate = parseDateParam(sp.to, true);

  const where: Prisma.AuditLogWhereInput = {
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const total = await prisma.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requestedPage = Number.parseInt(sp.page ?? "1", 10);
  const page = Math.min(
    Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1),
    totalPages
  );

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  // resolve ชื่อผู้ใช้ของหน้าปัจจุบัน (AuditLog ไม่มี FK — บาง userId อาจถูกลบไปแล้ว)
  const userIds = [
    ...new Set(logs.map((l) => l.userId).filter((id): id is string => !!id)),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, username: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const filterParams = {
    action: actionFilter,
    from: fromDate ? sp.from : undefined,
    to: toDate ? sp.to : undefined,
  };
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-card bg-navy text-white">
          <ScrollText className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl">บันทึกการตรวจสอบ</h1>
          <p className="text-sm text-slate-500">
            ประวัติการกระทำสำคัญในระบบ — เข้าสู่ระบบ เปลี่ยน/รีเซ็ตรหัสผ่าน
            ยกเลิกธุรกรรม ปิดยอด ฯลฯ (ไม่มีการลบข้อมูล)
          </p>
        </div>
      </header>

      {/* ตัวกรอง — form GET ธรรมดา ทำงานได้โดยไม่ต้องใช้ JS */}
      <Card padded>
        <form
          method="get"
          action="/audit"
          className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Select
            name="action"
            label="ประเภทการกระทำ"
            placeholder="ทั้งหมด"
            options={ACTION_OPTIONS}
            defaultValue={actionFilter ?? ""}
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
          <div className="flex items-center gap-2">
            <Button type="submit">
              <Search className="h-4 w-4" />
              กรอง
            </Button>
            <Link href="/audit" className="link-navy text-sm">
              ล้างตัวกรอง
            </Link>
          </div>
        </form>
      </Card>

      {/* ตารางบันทึก */}
      <Table minWidth="820px">
        <THead>
          <TR>
            <TH>เวลา</TH>
            <TH>ผู้ใช้</TH>
            <TH>การกระทำ</TH>
            <TH>รายละเอียด</TH>
          </TR>
        </THead>
        <TBody>
          {logs.map((log) => {
            const meta = ACTION_META[log.action];
            const u = log.userId ? userMap.get(log.userId) : undefined;
            return (
              <TR key={log.id}>
                <TD className="whitespace-nowrap text-slate-600">
                  {formatThaiDateTime(log.createdAt)}
                </TD>
                <TD>
                  {u ? (
                    <>
                      <span className="block font-medium text-slate-900">
                        {u.name}
                      </span>
                      <span className="text-xs text-slate-400">{u.username}</span>
                    </>
                  ) : (
                    <span className="text-slate-400">
                      {log.userId ? "ผู้ใช้ถูกลบแล้ว" : "ระบบ / ไม่ระบุ"}
                    </span>
                  )}
                </TD>
                <TD>
                  <Badge variant={meta?.variant ?? "gray"}>
                    {meta?.label ?? log.action}
                  </Badge>
                </TD>
                <TD className="max-w-[22rem] text-slate-600">
                  {log.detail ?? "-"}
                </TD>
              </TR>
            );
          })}
          {logs.length === 0 && (
            <TableEmpty colSpan={4} message="ไม่พบบันทึกตามเงื่อนไขที่เลือก" />
          )}
        </TBody>
      </Table>

      {/* แบ่งหน้า */}
      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-slate-500">
          แสดง {showingFrom.toLocaleString("th-TH")}–
          {showingTo.toLocaleString("th-TH")} จาก{" "}
          {total.toLocaleString("th-TH")} รายการ
        </p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              href={`/audit${buildQuery({ ...filterParams, page: String(page - 1) })}`}
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
              href={`/audit${buildQuery({ ...filterParams, page: String(page + 1) })}`}
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
