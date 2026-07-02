# CONTRACTS — ระบบออมทรัพย์โรงเรียนบ้านกะดาด

เอกสารสัญญากลางสำหรับทุก agent/ทีมที่สร้างหน้า feature บนโครงนี้
**อ่านทั้งไฟล์ก่อนเขียนโค้ด** — ห้ามสร้าง util/component ซ้ำกับที่มีอยู่แล้ว

- Stack: Next.js 15 (App Router, `src/`, `output: "standalone"`) + TypeScript + Tailwind v3.4 + Prisma + PostgreSQL + bcryptjs + jose + lucide-react + recharts
- ปีการศึกษา 2569 · โรงเรียนบ้านกะดาด สพป.สุรินทร์ เขต 3
- UI ภาษาไทยทั้งหมด, วันที่ พ.ศ. ("2 ก.ค. 2569"), เงิน "1,234.50" ชิดขวาในตาราง
- ธุรกรรม immutable — ห้าม delete แถว Transaction เด็ดขาด ใช้ status VOIDED เท่านั้น

---

## 1. คำสั่ง / environment

```bash
npm install
npx prisma generate          # ต้องรันก่อน typecheck/build (lib ไม่ import type จาก client ยกเว้น db.ts/seed)
npx prisma migrate dev       # สร้างตาราง
npx prisma db seed           # seed (ตั้งค่าแล้วใน package.json -> tsx prisma/seed.ts)
npm run dev
```

`.env` (มีไฟล์ dev ให้แล้ว / ตัวอย่างใน `.env.example`):

| ตัวแปร | ค่า dev |
|---|---|
| `DATABASE_URL` | `postgresql://savings:savings_dev_pw@localhost:5432/school_savings` |
| `SESSION_SECRET` | ค่า dev ยาว (production ต้องสุ่มใหม่) |
| `DB_PASSWORD` | `savings_dev_pw` |

บัญชีทดสอบจาก seed: `admin/admin1234` (ADMIN "ครูการเงิน") · `teacher1/teacher1234` (TEACHER ประจำ ป.1/1) · `parent1/parent1234` (PARENT ผูกนักเรียนคนแรก 69001)

---

## 2. Prisma models / enums (prisma/schema.prisma)

Enums:

- `Role`: `ADMIN | TEACHER | PARENT`
- `StudentStatus`: `ACTIVE | GRADUATED | MOVED`
- `TransactionType`: `DEPOSIT | WITHDRAW`
- `TransactionStatus`: `NORMAL | VOIDED`

Models (id ทุกตัวเป็น `String @id @default(cuid())`):

| Model | ฟิลด์สำคัญ | หมายเหตุ |
|---|---|---|
| `User` | `username` (unique), `passwordHash`, `role`, `name`, `linkedStudentId?` | PARENT เท่านั้นที่มี linkedStudentId; relations: `linkedStudent`, `homeroomClassrooms`, `recordedTransactions`, `voidedTransactions` |
| `AcademicYear` | `year Int` (unique, พ.ศ. เช่น 2569), `isActive`, `openedAt`, `closedAt?` | ปี active ควรมีตัวเดียว (บังคับฝั่งแอปตอนสลับปี) |
| `Classroom` | `academicYearId`, `name` ("ป.1/1"), `teacherId?` | `@@unique([academicYearId, name])` |
| `Student` | `studentCode` (unique, เช่น "69001"), `firstName`, `lastName`, `classroomId`, `status` | relation `parents` (User[]), `accounts` |
| `Account` | `studentId`, `academicYearId`, `openingBalance Decimal(12,2)`, `balance Decimal(12,2)` | `@@unique([studentId, academicYearId])` — 1 บัญชี/คน/ปี |
| `Transaction` | `accountId`, `type`, `amount Decimal(12,2)`, `txnDate`, `recordedById`, `note?`, `status`, `voidedById?`, `voidedAt?`, `createdAt` | **ห้ามลบ** — ยกเลิกด้วย `status=VOIDED` + `voidedById` + `voidedAt`; index: `[accountId, txnDate]`, `[txnDate]`, `[recordedById]`, `[status]` |

Invariant ทางบัญชี (ทุกจุดที่เขียนธุรกรรมต้องรักษา):

```
Account.balance = openingBalance
               + SUM(amount WHERE type=DEPOSIT  AND status=NORMAL)
               - SUM(amount WHERE type=WITHDRAW AND status=NORMAL)
```

เขียนธุรกรรม + อัปเดต balance ใน `prisma.$transaction()` เสมอ และห้ามให้ balance ติดลบ (ตรวจก่อนถอน)

**Decimal ข้าม boundary ไม่ได้**: ก่อนส่งจาก Server Component -> Client Component ให้แปลง `account.balance.toString()` หรือ `Number(...)` (`formatBaht` รับได้ทั้งคู่)

---

## 3. Session / Auth — `@/lib/auth`

```ts
export type Role = "ADMIN" | "TEACHER" | "PARENT";   // ตรงกับ Prisma enum — UI/lib ให้ import จากที่นี่

export type SessionPayload = {
  userId: string;
  role: Role;
  name: string;
  linkedStudentId: string | null;   // มีค่าเฉพาะ PARENT
};

export const SESSION_COOKIE = "session";             // httpOnly JWT (jose HS256) อายุ 12 ชม.

export async function hashPassword(plain: string): Promise<string>;
export async function verifyPassword(plain: string, hash: string): Promise<boolean>;
export async function createSession(payload: SessionPayload): Promise<void>;  // เซ็น JWT + set cookie (ฝัง claim pwv = fingerprint ของ passwordHash)
export async function getSession(): Promise<SessionPayload | null>;           // null ถ้าไม่มี/หมดอายุ/ปลอม — และตรวจกับ DB ทุกครั้ง: null ถ้าไม่พบ user / บัญชีถูกปิด (passwordHash ขึ้นต้น "DISABLED:") / รหัสผ่านถูกรีเซ็ตหลังออก token; role/name/linkedStudentId ใช้ค่าจาก DB
export async function destroySession(): Promise<void>;                        // ลบ cookie

// Page / Server Component / Server Action — redirect เมื่อไม่ผ่าน
export async function requireRole(roles: Role[]): Promise<SessionPayload>;

// API Route Handler — โยน AuthError (มี .status 401/403) เมื่อไม่ผ่าน
export class AuthError extends Error { status: number }
export async function requireRoleApi(roles: Role[]): Promise<SessionPayload>;
```

ข้อจำกัด: ไฟล์นี้ใช้ได้เฉพาะ server (มี bcryptjs + next/headers) — **ห้าม import จาก client component และห้าม import จาก middleware**

### ตัวอย่างเช็ค role ใน Server Component (page)

```tsx
// src/app/(app)/students/page.tsx
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function StudentsPage() {
  const session = await requireRole(["ADMIN", "TEACHER"]); // ไม่ผ่าน -> redirect เอง
  const students = await prisma.student.findMany({ include: { classroom: true } });
  return <div>...</div>;
}
```

### ตัวอย่างเช็ค role ใน API Route

```ts
// src/app/api/transactions/route.ts
import { NextResponse } from "next/server";
import { requireRoleApi, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await requireRoleApi(["ADMIN", "TEACHER"]);
    const body = await req.json();
    // ... ตรวจ input + เขียนธุรกรรมใน prisma.$transaction()
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
```

### สัญญาที่ทีม auth ต้องทำ (foundation เตรียมไว้ให้แล้ว)

- `POST /api/auth/login` — รับ `{ username, password }` -> `verifyPassword` -> `createSession({...})` -> ตอบ ok/redirect (หน้า `/login` อยู่นอก route group `(app)`)
- `POST /api/auth/logout` — `destroySession()` แล้ว **redirect 303 ไป `/login`** — Topbar ยิง form POST มาที่ path นี้แล้ว (ไม่ใช้ JS)

---

## 4. Middleware (src/middleware.ts) — มีอยู่แล้ว ห้ามทำซ้ำใน page

- ไม่มี session -> redirect `/login?next=...` (path `/api/*` -> 401 JSON)
- `/users`, `/academic-years`, `/classrooms` -> ADMIN เท่านั้น
- `/my-child` -> PARENT เท่านั้น; PARENT เข้าหน้าอื่นไม่ได้นอกจาก `/my-child`, `/passbook`
- matcher ยกเว้น: `/login`, `/api/auth/*`, `_next`, ไฟล์ static (มี `.` ใน path)
- **middleware เป็นแค่ด่านแรก** — ทุก API/Server Action ต้องเรียก `requireRole`/`requireRoleApi` ซ้ำเสมอ

---

## 5. Lib utilities

### `@/lib/db`

```ts
export const prisma: PrismaClient;   // singleton — ใช้ตัวนี้เสมอ ห้าม new PrismaClient() เอง
export default prisma;
```

### `@/lib/money`

```ts
export function formatBaht(value: number | string | { toString(): string }): string;
// formatBaht(1234.5) === "1,234.50" · รับ Prisma Decimal ได้ · parse ไม่ได้คืน "0.00"

export function formatBahtText(value): string;   // "1,234.50 บาท"

export function parseBaht(input: string): number | null;
// "1,234.50" / "50 บาท" -> number · คืน null ถ้าไม่ใช่จำนวนบวก/ทศนิยมเกิน 2 ตำแหน่ง (0 ก็ null)
```

### `@/lib/thai-date`

```ts
export function formatThaiDate(value: Date | string | number): string;      // "2 ก.ค. 2569"
export function formatThaiDateFull(value): string;                          // "2 กรกฎาคม 2569"
export function formatThaiDateTime(value): string;                          // "2 ก.ค. 2569 14:30 น."
export function toBuddhistYear(value): number;                              // 2569
// ทุกตัว: parse ไม่ได้คืน "-"
```

### `@/lib/utils`

```ts
export function cn(...classes: (string | undefined | null | false)[]): string; // รวม class กรอง falsy
```

---

## 6. UI components

ทุกตัว import แบบ default ยกเว้น Table (named exports)

### `@/components/ui/Button` (default)

```ts
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "success" | "danger" | "ghost"; // default "primary"
  size?: "sm" | "md" | "lg";                                          // default "md"
}
// primary=navy, success=เขียวฝาก, danger=แดงถอน · default type="button"
```

### `@/components/ui/Card` (default)

```ts
interface CardProps {
  title?: string; description?: string;
  actions?: ReactNode;   // มุมขวา header
  footer?: ReactNode;
  padded?: boolean;      // default true — ปิดเมื่อวางตารางเต็มการ์ด
  className?: string; children: ReactNode;
}
```

### `@/components/ui/Input` (default, forwardRef)

```ts
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string; hint?: string;
}
```

### `@/components/ui/Select` (default, forwardRef)

```ts
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; error?: string;
  options?: { value: string; label: string }[];
  placeholder?: string;   // option แรก value="" เช่น "— เลือกห้องเรียน —"
}
```

### `@/components/ui/Table` (named exports)

```tsx
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/Table";

<Table>                                   {/* wrapper: การ์ดขาว + overflow-x + minWidth (default 640px) */}
  <THead>                                 {/* bg-navy ตัวอักษรขาว */}
    <TR><TH>วันที่</TH><TH>รายการ</TH><TH align="right">จำนวนเงิน</TH></TR>
  </THead>
  <TBody>                                 {/* แถวสลับสีอัตโนมัติ */}
    <TR>
      <TD>{formatThaiDate(t.txnDate)}</TD>
      <TD><Badge variant="green">ฝาก</Badge></TD>
      <TD align="right" className="text-deposit">{formatBaht(t.amount)}</TD>
    </TR>
    {rows.length === 0 && <TableEmpty colSpan={3} />}   {/* message default "ไม่พบข้อมูล" */}
  </TBody>
</Table>
```

กติกา: คอลัมน์เงินใช้ `align="right"` เสมอ (ได้ tabular-nums), ฝาก=`text-deposit`, ถอน=`text-withdraw`, รายการ VOIDED ใช้ `className="line-through text-slate-400"` + `<Badge variant="gray">ยกเลิกแล้ว</Badge>`

### `@/components/ui/Modal` (default, **client component**)

```ts
interface ModalProps {
  open: boolean; onClose: () => void;
  title?: string; footer?: ReactNode;
  size?: "sm" | "md" | "lg";   // default "md"
  children: ReactNode;
}
// ปิดด้วย X / Escape / คลิกฉากหลัง · ใช้ได้เฉพาะใน client component
```

### `@/components/ui/Badge` (default)

```ts
interface BadgeProps {
  variant?: "navy" | "green" | "red" | "gold" | "gray";  // default "navy"
  className?: string; children: ReactNode;
}
// green=ฝาก/ปกติ, red=ถอน, gray=ยกเลิก/ย้าย/จบ, gold=ไฮไลต์
```

### `@/components/StatCard` (default)

```ts
interface StatCardProps {
  title: string;
  value: string;              // format มาก่อน เช่น formatBaht(n) หรือ "20 คน"
  icon?: LucideIcon; hint?: string;
  tone?: "navy" | "green" | "red" | "gold";
  className?: string;
}
```

### `@/components/BalanceCard` (default)

```ts
interface BalanceCardProps {
  title?: string;                    // default "ยอดเงินคงเหลือ"
  balance: number | string;          // Prisma Decimal ให้ .toString() ก่อน
  studentName?: string; studentCode?: string; classroomName?: string;
  updatedAt?: Date | string;         // วันที่ธุรกรรมล่าสุด
  className?: string;
}
// การ์ด gradient navy ตัวเลขทอง — ใช้ใน /my-child และ /passbook
```

### Layout components (ประกอบแล้วใน `src/app/(app)/layout.tsx` — feature ไม่ต้องเรียกเอง)

- `@/components/layout/Sidebar` — `{ role: Role }` (client, กรองเมนูตาม role)
- `@/components/layout/Topbar` — `{ name: string; role: Role }` + export `ROLE_LABELS: Record<Role, string>` (ADMIN="ผู้ดูแลระบบ", TEACHER="ครูประจำชั้น", PARENT="ผู้ปกครอง")
- `@/components/layout/MobileNav` — `{ role: Role }`
- `@/components/layout/nav-items` — `NAV_ITEMS`, `getNavItems(role)`, `isNavActive(pathname, href)` — **เพิ่มเมนูใหม่ที่ไฟล์นี้ไฟล์เดียว**

---

## 7. Route map

หน้า (วางใต้ `src/app/(app)/...` เพื่อได้ Sidebar/Topbar อัตโนมัติ — ยกเว้น `/login`):

| Route | Role | หน้าที่ |
|---|---|---|
| `/login` | public | ฟอร์มเข้าสู่ระบบ (อยู่ `src/app/login/page.tsx` — นอก group) |
| `/` | ทุกคน | redirect: ไม่ login->/login, PARENT->/my-child, อื่น->/dashboard (**มีแล้ว**) |
| `/dashboard` | ADMIN, TEACHER | แดชบอร์ดสรุป (StatCard + กราฟ recharts) |
| `/transactions/new` | ADMIN, TEACHER | ฟอร์มบันทึกฝาก-ถอน |
| `/transactions` | ADMIN, TEACHER | ประวัติธุรกรรม + ยกเลิกรายการ (VOID) |
| `/students` | ADMIN, TEACHER | รายชื่อนักเรียน + จัดการ |
| `/reports` | ADMIN, TEACHER | รายงานสรุป |
| `/classrooms` | ADMIN | จัดการห้องเรียน |
| `/academic-years` | ADMIN | จัดการปีการศึกษา / เปิด-ปิดปี |
| `/users` | ADMIN | จัดการผู้ใช้ |
| `/my-child` | PARENT | ยอดของลูก (ใช้ `session.linkedStudentId`) |
| `/passbook/...` | ทุก role ที่ login | สมุดบัญชีรายคน (PARENT เข้าได้เฉพาะของลูกตัวเอง — ตรวจใน page) |

API (ทีม feature สร้าง — ทุกตัวเช็ค role ด้วย `requireRoleApi`):

| Endpoint | หมายเหตุ |
|---|---|
| `POST /api/auth/login` | ยกเว้นจาก middleware แล้ว |
| `POST /api/auth/logout` | **Topbar เรียกอยู่** — destroySession + redirect 303 /login |
| อื่นๆ `/api/...` | middleware บังคับ login ให้แล้ว (401 ถ้าไม่มี session) แต่ role ต้องเช็คเองในทุก handler |

---

## 8. Design tokens (tailwind.config.ts)

| Token | ค่า | ใช้กับ |
|---|---|---|
| `navy` / `navy-light` / `navy-dark` | `#1E3A5F` / `#2C4F7C` / `#162C49` | sidebar, ปุ่มหลัก, thead |
| `surface` | `#F5F7FA` | พื้นหลังแอป |
| `line` | `#E2E8F0` | ขอบ/เส้นแบ่ง |
| `deposit` | `#16A34A` | เขียว = ฝาก |
| `withdraw` | `#DC2626` | แดง = ถอน |
| `gold` / `gold-light` / `gold-dark` | `#D4A843` / `#E8C978` / `#B08A2E` | ไฮไลต์, ยอดสะสม |
| `font-sarabun` | Sarabun (next/font, ตั้งที่ body แล้ว) | ทั้งแอป |
| `rounded-card` | 12px | การ์ด |
| `shadow-card` | เงาบาง | การ์ด |

คลาสสำเร็จรูปใน globals.css: `.card-surface` (การ์ดขาวขอบบาง), `.amount-cell` (ชิดขวา+tabular-nums), `.link-navy`

ข้อกำหนดสไตล์: ห้ามพาสเทล/การ์ตูน, ไอคอน lucide-react เท่านั้น, ภาษาไทยจริงทั้งหมด (ห้าม Lorem Ipsum), วันที่แสดงเป็น พ.ศ. ผ่าน `formatThaiDate*` เท่านั้น, จำนวนเงินผ่าน `formatBaht` เท่านั้น
