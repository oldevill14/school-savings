# NOTES2-B3 — ทีม family (ผู้ปกครองหลายลูก + milestones + กราฟ)

สรุปสิ่งที่ทำในรอบขยายฟีเจอร์ + จุดที่ทีมอื่นต้องรับช่วง/รับรู้
สถานะ: `npx tsc --noEmit` ผ่าน · `npx next build` ผ่าน (exit 0)

## ไฟล์ที่สร้าง/แก้ (อยู่ใน ownership B3 ทั้งหมด)

สร้างใหม่
- `src/lib/milestones.ts` — pure lib (ไม่ import prisma/next/lucide) คำนวณ milestones + trend
- `src/components/MilestoneBadges.tsx` — ตราสัญลักษณ์นักออม (Server Component, ไม่มี "use client")
- `src/components/charts/SavingsTrendChart.tsx` — กราฟเส้นยอดสะสมรายเดือน ("use client", recharts, props-only)
- `src/app/api/guardians/route.ts` — POST/DELETE ผูก/ถอด Guardian (ADMIN)
- `src/app/(app)/passbook/[studentId]/certificate/page.tsx` — เกียรติบัตรนักออม A4 แนวนอน
- `src/app/(app)/passbook/[studentId]/certificate/CertificatePrintButton.tsx` — ปุ่มพิมพ์ (client)

แก้
- `src/app/(app)/my-child/page.tsx` — รองรับหลายบุตร (`?child=<studentId>` + แถบสลับ), เพิ่ม MilestoneBadges + SavingsTrendChart
- `src/app/(app)/passbook/[studentId]/page.tsx` — เพิ่มกราฟยอดสะสม + ปุ่มเกียรติบัตร + รับ role EXECUTIVE
- `src/app/(app)/users/page.tsx` — ผูกนักเรียนหลายคน + modal จัดการ Guardian + แสดง linkedStudents หลายคน
- `src/app/api/users/route.ts` — POST รับ `linkedStudentIds: string[]` (ยังรับ `linkedStudentId` เดิม), ตั้ง `mustChangePassword: true` ตอนสร้าง
- `src/app/api/users/[id]/route.ts` — reset-password ตั้ง `mustChangePassword: true` + `logAudit`; disable/enable ใส่ `logAudit`

## >>> ถึงทีม B7 (media/students) — วิธีวางตราสัญลักษณ์ใน `students/[id]/page.tsx`

MilestoneBadges เป็น Server Component ส่งข้อมูลธุรกรรมย่อเข้าไปได้ตรงๆ (ไม่ต้อง "use client")
แต่ต้องมี **ธุรกรรมทั้งหมดของบัญชี active** ไม่ใช่แค่ 10 รายการล่าสุด (peak/streak ต้องดูทั้งปี)

```tsx
import MilestoneBadges from "@/components/MilestoneBadges";
import type { MilestoneTxn } from "@/lib/milestones";
// (ถ้าจะโชว์กราฟด้วย) import SavingsTrendChart from "@/components/charts/SavingsTrendChart";
// (ถ้าจะโชว์กราฟด้วย) import { buildSavingsTrend } from "@/lib/milestones";

// หลังได้ activeAccount แล้ว — ดึงธุรกรรมทั้งหมดของบัญชีเพื่อคำนวณตรา
const milestoneTxns: MilestoneTxn[] = activeAccount
  ? (await prisma.transaction.findMany({
      where: { accountId: activeAccount.id },
      orderBy: [{ txnDate: "asc" }, { createdAt: "asc" }],
      select: { type: true, status: true, txnDate: true, amount: true },
    })).map((t) => ({
      type: t.type,
      status: t.status,
      txnDate: t.txnDate,
      amount: Number(t.amount), // Prisma Decimal -> number
    }))
  : [];

// ใน JSX (ในการ์ดโปรไฟล์ก็ได้):
{activeAccount && (
  <MilestoneBadges balance={Number(activeAccount.balance)} transactions={milestoneTxns} showLocked />
)}
// กราฟ (ถ้าต้องการ): const trend = buildSavingsTrend(Number(activeAccount.openingBalance), milestoneTxns);
//   {trend.length >= 2 && <SavingsTrendChart data={trend} />}
```

หมายเหตุ: `showLocked` = แสดงตราที่ยังไม่ปลดล็อกแบบจาง (เป็นเป้าหมาย) — ผมเปิดในหน้า my-child;
ในหน้า students/[id] จะเปิดหรือปิดก็ได้ตามพื้นที่ (ปิด = โชว์เฉพาะที่ได้แล้ว)

เกณฑ์ตรา (นิยามใน milestones.ts): ยอดสะสมสูงสุดที่เคยแตะ 100/500/1,000/5,000 บาท
(ปลดล็อกแล้วไม่หลุดแม้ถอนออก) + ฝากต่อเนื่อง 4/8/12 สัปดาห์ (นับสัปดาห์แบบเริ่มวันจันทร์)

## >>> ถึงทีม B2 (security/auth) — dependency เรื่อง mustChangePassword

ผมตั้ง `User.mustChangePassword = true` ในสองจุด (ฝั่ง B3):
1. สร้างผู้ใช้ใหม่ผ่าน `POST /api/users` (บัญชีใหม่ = รหัสสุ่มชั่วคราว ควรบังคับเปลี่ยน)
2. รีเซ็ตรหัสผ่านผ่าน `PATCH /api/users/[id] {action:"reset-password"}`

**ต้องการให้ B2 เป็นผู้บังคับใช้** flag นี้ตอน login/หน้า `/account`:
- ตอนนี้ผมแค่ "ตั้ง flag" — ยังไม่มีใครเช็ค `mustChangePassword` ตอนล็อกอิน (ถ้า B2 ยังไม่ทำ = ไม่พัง อะไร แค่ flag ค้างไว้เฉยๆ)
- เมื่อผู้ใช้เปลี่ยนรหัสเองสำเร็จที่ `/account` (endpoint ของ B2: `api/account/password`) ให้ **เคลียร์ `mustChangePassword: false`** ด้วย
- ผมไม่แตะ `lib/auth.ts` / `api/auth/*` / `account/**` (นอก ownership) — ปล่อยให้ B2 ทำการบังคับใช้

logAudit ที่ผมใส่แล้ว: `PASSWORD_RESET`, `USER_DISABLE`, `USER_ENABLE` (action มีอยู่ใน `@/lib/audit` ครบ)
ยังไม่มี action `USER_CREATE` ใน AuditAction จึงไม่ได้ log ตอนสร้าง (ไม่แก้ audit.ts)

## จุดที่ปรับให้ตรง CONTRACTS (แจ้งเผื่อชน)

- **passbook รับ role EXECUTIVE แล้ว**: `requireRole([...,"EXECUTIVE"])` เดิมหน้า passbook ไม่รับ EXECUTIVE
  (จะโดน requireRole เด้งไป /dashboard) ทั้งที่ middleware + route map ระบุ EXECUTIVE อ่าน /passbook ได้
  → เพิ่ม EXECUTIVE เข้า allow-list ของ passbook + certificate (อ่านอย่างเดียว, ปุ่มเขียนไม่มี)
  ปุ่ม "back" ของ EXECUTIVE ชี้ไป `/students` (ไม่ใช่ `/students/[id]` เพราะหน้านั้นสงวนให้ ADMIN/TEACHER)
- ผมไม่แตะ `nav-items.ts` (B1 เป็นเจ้าของ) — route ใหม่ของผม (certificate) เข้าผ่านลิงก์ในหน้า passbook

## Contract ของ API ที่ทีมอื่นอาจเรียก

- `GET /api/users` → ผู้ใช้แต่ละคนมี `linkedStudents: {id,studentCode,name}[]` (+ `linkedStudent` เดิม = คนแรก, ยังคงไว้)
- `POST /api/users` body: `{ username, name, role, linkedStudentIds?: string[] }` (PARENT ต้องมี ≥1;
  ยังรับ `linkedStudentId` เดี่ยวแบบ backward-compat) → คืน `{ ok, user, password }`
- `POST /api/guardians` body `{ userId, studentId }` (ADMIN, PARENT เท่านั้น) → ผูกเพิ่ม (ซ้ำ = `{ok,already:true}`)
- `DELETE /api/guardians` body `{ userId, studentId }` (ADMIN) → ถอด (idempotent)
  - session ผู้ปกครองอ่าน studentIds จาก Guardian สดทุก request (getSession) → เพิ่ม/ถอดมีผลทันที

## ข้อจำกัด/ที่ยังเปิดไว้
- เกียรติบัตรใช้ช่องลงลายมือชื่อเปล่า (ครูการเงิน/ผู้อำนวยการ) — ไม่มีชื่อ ผอ. ใน DB;
  ชื่อโรงเรียน/เขตพื้นที่ดึงจาก `getSchoolSetting()` แล้ว
- กราฟ/ตรา ใช้ธุรกรรม "สถานะปกติ" เท่านั้น (VOIDED ไม่นับ) และคำนวณด้วยหน่วยสตางค์ (integer) เลี่ยง float
