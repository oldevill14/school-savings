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

บัญชีทดสอบจาก seed: `admin/admin1234` (ADMIN "ครูการเงิน") · `teacher1/teacher1234` (TEACHER ประจำ ป.1/1) · `executive1/exec1234` (EXECUTIVE "ผู้อำนวยการ" read-only) · `parent1/parent1234` (PARENT ผูกนักเรียน 2 คน: 69001 + 69002)

---

## 2. Prisma models / enums (prisma/schema.prisma)

Enums:

- `Role`: `ADMIN | TEACHER | PARENT | EXECUTIVE` (EXECUTIVE = ผู้บริหาร read-only — เพิ่มรอบขยายฟีเจอร์)
- `StudentStatus`: `ACTIVE | GRADUATED | MOVED`
- `TransactionType`: `DEPOSIT | WITHDRAW`
- `TransactionStatus`: `NORMAL | VOIDED`
- `TransactionCategory`: `REGULAR | INTEREST` (default REGULAR — เพิ่มรอบขยายฟีเจอร์)

> **สำคัญ**: มี model/enum/lib ใหม่จำนวนมากในรอบขยายฟีเจอร์ — ดูรายละเอียดครบที่ท้ายไฟล์ หัวข้อ **"รอบขยายฟีเจอร์ (2569-07)"** ก่อนเริ่มทำงาน

Models (id ทุกตัวเป็น `String @id @default(cuid())`):

| Model | ฟิลด์สำคัญ | หมายเหตุ |
|---|---|---|
| `User` | `username` (unique), `passwordHash`, `role`, `name`, `lineUserId?` (unique), `mustChangePassword` (default false) | **ไม่มี `linkedStudentId` แล้ว** — ผูกนักเรียนผ่าน model `Guardian`; relations: `guardians`, `homeroomClassrooms`, `recordedTransactions`, `voidedTransactions`, `cashClosings`, `lineLinkCodes` |
| `AcademicYear` | `year Int` (unique, พ.ศ. เช่น 2569), `isActive`, `openedAt`, `closedAt?` | ปี active ควรมีตัวเดียว (บังคับฝั่งแอปตอนสลับปี) |
| `Classroom` | `academicYearId`, `name` ("ป.1/1"), `teacherId?` | `@@unique([academicYearId, name])` |
| `Student` | `studentCode` (unique, เช่น "69001"), `firstName`, `lastName`, `classroomId`, `status`, `photoFileName?` | relations: `guardians` (Guardian[]), `accounts` — **`parents` relation ถูกลบแล้ว** |
| `Account` | `studentId`, `academicYearId`, `openingBalance Decimal(12,2)`, `balance Decimal(12,2)` | `@@unique([studentId, academicYearId])` — 1 บัญชี/คน/ปี |
| `Transaction` | `accountId`, `type`, `category` (REGULAR\|INTEREST, default REGULAR), `amount Decimal(12,2)`, `txnDate`, `recordedById`, `note?`, `status`, `voidedById?`, `voidedAt?`, `createdAt` | **ห้ามลบ** — ยกเลิกด้วย `status=VOIDED` + `voidedById` + `voidedAt`; index: `[accountId, txnDate]`, `[txnDate]`, `[recordedById]`, `[status]` |

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
export type Role = "ADMIN" | "TEACHER" | "PARENT" | "EXECUTIVE";   // ตรงกับ Prisma enum — UI/lib ให้ import จากที่นี่

export type SessionPayload = {
  userId: string;
  role: Role;
  name: string;
  studentIds: string[];   // นักเรียนที่ PARENT ผูกไว้ (cuid String[]) — role อื่นเป็น [] เสมอ
};

export const SESSION_COOKIE = "session";             // httpOnly JWT (jose HS256) อายุ 12 ชม.

export async function hashPassword(plain: string): Promise<string>;
export async function verifyPassword(plain: string, hash: string): Promise<boolean>;
export async function createSession(payload: SessionPayload): Promise<void>;  // เซ็น JWT + set cookie (ฝัง claim pwv = fingerprint ของ passwordHash)
export async function getSession(): Promise<SessionPayload | null>;           // null ถ้าไม่มี/หมดอายุ/ปลอม — และตรวจกับ DB ทุกครั้ง: null ถ้าไม่พบ user / บัญชีถูกปิด (passwordHash ขึ้นต้น "DISABLED:") / รหัสผ่านถูกรีเซ็ตหลังออก token; role/name/studentIds ใช้ค่าจาก DB (studentIds มาจากตาราง Guardian ของ PARENT)
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
- ADMIN เท่านั้น: `/users`, `/academic-years`, `/classrooms`, `/settings`, `/interest`, `/audit`
- ADMIN + TEACHER เท่านั้น: `/cash-closing`
- `/my-child` -> PARENT เท่านั้น; PARENT เข้าหน้าอื่นไม่ได้นอกจาก `/my-child`, `/passbook`, `/account`
- EXECUTIVE (read-only) เข้าได้แค่ `/dashboard`, `/transactions`, `/students`, `/reports`, `/passbook`, `/account` และ **ห้าม `/transactions/new`**
- ทุก role ที่ล็อกอิน: เข้า `/account` (บัญชีของฉัน) ได้
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
| `/my-child` | PARENT | ยอดของลูก (ใช้ `session.studentIds`) |
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

---

# รอบขยายฟีเจอร์ (2569-07)

> รากฐาน (schema / migration / auth / middleware / libs กลาง / infra) เตรียมโดย **Architect** เสร็จแล้ว
> ทีม B1–B7 สร้าง UI/API บนรากฐานนี้ — **ห้ามแก้** `schema.prisma`, `migrations/`, `middleware.ts`, `lib/auth.ts`, `docker-compose.yml`, `package.json` (แจ้ง Architect ถ้าจำเป็น)
> ยืนยันแล้ว: `npx tsc --noEmit` ผ่าน + migration ทดสอบบน PostgreSQL 17 จริง (copy Guardian + seed SchoolSetting สำเร็จ)

## E.0 ข้อควรทราบสำคัญ (ค่าที่ต่างจากสเปกดิบ — ยึดตามนี้)

- **`session.studentIds` เป็น `string[]` ไม่ใช่ `number[]`** — เพราะ `Student.id` เป็น cuid (String) ทั้งระบบ
- **`AuditLog.userId` เป็น `String?` ไม่ใช่ `Int`** — เก็บ cuid ของ User; ไม่มี FK relation (audit ต้องอยู่รอดแม้ user ถูกลบ + logAudit เป็น fire-and-forget)
- **`User.lineUserId` เป็น `@unique`** (1 บัญชี LINE ต่อ 1 ผู้ใช้ — ช่วย webhook หา user)
- Migration ใหม่ = `prisma/migrations/20260703093000_feature_expansion/` (แก้มือให้ copy `linkedStudentId`→Guardian ก่อน DROP COLUMN + seed แถว SchoolSetting id=1)

## E.1 Model / Enum ใหม่

Enum เพิ่ม: `Role.EXECUTIVE`, `TransactionCategory { REGULAR | INTEREST }` (Transaction.category default REGULAR)

| Model | ฟิลด์ | หมายเหตุ |
|---|---|---|
| `SchoolSetting` | `id Int @id @default(1)` (singleton แถวเดียว), `schoolName`, `schoolArea`, `logoFileName?`, `updatedAt` | อ่าน/เขียนผ่าน `@/lib/settings` เท่านั้น — **อย่า query ตรง** |
| `Guardian` | `id`, `userId`, `studentId`, `createdAt`, `@@unique([userId, studentId])` | แทน `User.linkedStudentId`; relations `user`(cascade)/`student`; 1 ผู้ปกครองผูกได้หลายลูก |
| `AuditLog` | `id`, `userId String?`, `action String`, `detail String?`, `createdAt`; `@@index([createdAt])`,`@@index([action])` | เขียนผ่าน `logAudit()` เท่านั้น |
| `CashClosing` | `id`, `closeDate`, `scope String` ("ALL" หรือ classroomId), `expectedNet Decimal(12,2)`, `countedAmount Decimal(12,2)`, `note?`, `closedById`, `createdAt`; `@@unique([closeDate, scope])` | ปิดยอดเงินสดรายวัน (B4) |
| `LineLinkCode` | `id`, `code String @unique`, `userId`, `expiresAt`, `usedAt?` | โค้ดผูกบัญชี LINE (B6) |

User เพิ่ม: `lineUserId String? @unique`, `mustChangePassword Boolean @default(false)`, relations `guardians` / `cashClosings` / `lineLinkCodes` — **`linkedStudentId`/`linkedStudent` ถูกลบ**
Student เพิ่ม: `photoFileName String?`, relation `guardians` — **`parents` ถูกลบ**

## E.2 Session shape ใหม่

```ts
type SessionPayload = { userId: string; role: Role; name: string; studentIds: string[] };
// PARENT เข้าถึงได้เฉพาะ studentIds ของตน — เช็คด้วย session.studentIds.includes(id)
// (getSession ดึง studentIds จากตาราง Guardian ให้อัตโนมัติ role อื่น = [])
```

`ROLE_LABELS` (จาก `@/components/layout/Topbar`) เพิ่ม `EXECUTIVE: "ผู้บริหาร"` แล้ว

## E.3 Lib กลางใหม่ (server-only — ห้าม import จาก client)

### `@/lib/settings`
```ts
type SchoolSetting = { schoolName: string; schoolArea: string; logoFileName: string | null };
getSchoolSetting(): Promise<SchoolSetting>;                 // cache ใน module — คืน default ถ้าไม่มีแถว
updateSchoolSetting(data: Partial<{schoolName; schoolArea; logoFileName: string|null}>): Promise<SchoolSetting>; // upsert id=1 + refresh cache
invalidateSchoolSettingCache(): void;
export const DEFAULT_SCHOOL_SETTING;                        // { "โรงเรียนบ้านกะดาด", "สพป.สุรินทร์ เขต 3", null }
// ตัวอย่าง (แสดงชื่อโรงเรียนแทน hardcode): const { schoolName } = await getSchoolSetting();
```

### `@/lib/audit`
```ts
const AuditAction = { LOGIN_SUCCESS, LOGIN_FAIL, PASSWORD_CHANGE, PASSWORD_RESET, USER_DISABLE,
  USER_ENABLE, TXN_VOID, YEAR_CLOSE, INTEREST_PAYOUT, CASH_CLOSE, SETTINGS_UPDATE, LOGO_UPDATE, PHOTO_UPDATE }; // as const
logAudit({ userId?, action, detail? }): Promise<void>;     // fire-and-forget — ไม่มีทาง throw
// ตัวอย่าง: await logAudit({ userId: session.userId, action: AuditAction.TXN_VOID, detail: `txn ${id}` });
```

### `@/lib/files` (route ที่เรียกต้อง `export const runtime = "nodejs"`)
```ts
class FileValidationError extends Error { status = 400 }    // แปลงเป็น response 400 ได้
saveUpload(subdir, file: File): Promise<{ fileName; ext }>; // validate png/jpg + <=2MB + ตั้งชื่อสุ่ม -> เก็บ basename ลง DB
readUpload(subdir, name): Promise<{ data: Buffer; contentType }>; // กัน path traversal (whitelist subdir/ชื่อ)
export const MAX_UPLOAD_BYTES;                              // 2MB
// subdir ที่ใช้: "logo" (โลโก้โรงเรียน), "students" (รูปนักเรียน) — เก็บที่ UPLOADS_DIR/<subdir>/
```

### `@/lib/notify` (LINE — signature ล็อก, ไส้ในเป็น TODO ให้ B6)
```ts
type TransactionNotifySummary = { type:"DEPOSIT"|"WITHDRAW"; amount:string; balanceAfter:string; txnDate:Date|string; studentName?:string };
notifyGuardiansOfTransaction(studentIds: string[], summary: TransactionNotifySummary): Promise<void>;
// no-op ถ้าไม่ตั้ง LINE_CHANNEL_ACCESS_TOKEN · fire-and-forget · เรียกแบบ void หลัง commit ธุรกรรมสำเร็จ
```

## E.4 Env ใหม่ (ตั้งใน compose ให้แล้ว / .env.example อัปเดตแล้ว)

| ตัวแปร | ค่า | ใช้ |
|---|---|---|
| `UPLOADS_DIR` | dev: `./uploads` · compose: `/app/uploads` (named volume) | `@/lib/files` |
| `LINE_CHANNEL_ACCESS_TOKEN` | ว่าง = ปิดฟีเจอร์ LINE | `@/lib/notify` (B6) |
| `LINE_CHANNEL_SECRET` | ว่าง | LINE webhook (B6) |

Infra อื่น: `docker-compose.yml` เพิ่ม service **`db-backup`** (pg_dump ทุก 24 ชม. ลง volume `backups` เก็บ 14 ไฟล์ล่าสุด = ฟีเจอร์ข้อ 16 เสร็จทั้งข้อ), volume `uploads`+`backups`; `package.json` เพิ่ม **`exceljs`** (สำหรับ Export Excel — B5); Dockerfile สร้าง `/app/uploads` ให้ user `nextjs` เขียนได้

## E.5 แผนเมนู nav สุดท้าย (เพิ่มที่ `@/components/layout/nav-items` ไฟล์เดียว — B1)

| Role | เมนู |
|---|---|
| **ADMIN** | เดิมทั้งหมด + ตั้งค่าโรงเรียน (`/settings`) + ปิดยอดเงินสด (`/cash-closing`) + ดอกเบี้ย (`/interest`) + Audit log (`/audit`) |
| **TEACHER** | เดิมทั้งหมด + ปิดยอดเงินสด (`/cash-closing`, ดูอย่างเดียว) |
| **EXECUTIVE** | แดชบอร์ด (`/dashboard`) · ธุรกรรม (`/transactions` อ่าน) · นักเรียน (`/students`) · รายงาน (`/reports`) — ไม่มีปุ่มเขียนใดๆ |
| **PARENT** | เดิม (`/my-child`, `/passbook`) |
| **ทุกคน** | บัญชีของฉัน (`/account`) ใน Topbar |

> B1 ต้องเพิ่ม case `EXECUTIVE` ใน `getNavItems(role)` (ตอนนี้ยังไม่มี → sidebar EXECUTIVE ว่าง แต่ middleware กัน route ให้แล้ว)

## E.6 Ownership ไฟล์ 7 ทีม (กันแก้ชนกัน)

| ทีม | ขอบเขต | ไฟล์หลัก (สร้าง/แก้) |
|---|---|---|
| **B1 ตั้งค่า+branding** | ฟีเจอร์ 1 | `app/(app)/settings/page.tsx` + `api/settings/*`, แก้ `LoginCard`, `Sidebar`, `Topbar`, `nav-items`, `app/layout.tsx` (แสดงชื่อ/โลโก้จาก `getSchoolSetting`), route serve โลโก้ (`api/branding/logo` ใช้ `readUpload("logo",..)`) |
| **B2 security** | ฟีเจอร์ 2, 8, 10 | `app/(app)/account/page.tsx` (เปลี่ยนรหัสตัวเอง), `app/(app)/audit/page.tsx`, `api/auth/*` (ใส่ `logAudit` LOGIN_*/PASSWORD_*), guard EXECUTIVE ใน dashboard |
| **B3 family** | ฟีเจอร์ 3, 11 | `app/(app)/my-child` (multi-child), `passbook`, `users/page.tsx`+`api/users/*` (ผูกหลายลูกผ่าน Guardian), milestones, `SavingsTrendChart` (recharts รายคน) |
| **B4 money-ops** | ฟีเจอร์ 5, 6, 7 | `app/(app)/cash-closing`, `interest`, `transactions/new`+`api/transactions/_lib.ts` (ใส่ `notifyGuardiansOfTransaction` + `category=INTEREST` ตอนจ่ายดอกเบี้ย), สลิปหลังบันทึก, ใส่ `logAudit` YEAR_CLOSE/INTEREST_PAYOUT/CASH_CLOSE |
| **B5 reports** | ฟีเจอร์ 4, 15 | `app/(app)/reports/*`, `api/export/*` (ใช้ `exceljs`), ทะเบียนคุมเงิน |
| **B6 integrations** | ฟีเจอร์ 9, 12 | เติมไส้ `lib/notify.ts` เต็ม, LINE webhook (`api/line/*` ใช้ `LineLinkCode`+`lineUserId`), `manifest.json` + PWA icons/service worker |
| **B7 media** | ฟีเจอร์ 13, 14 | `app/(app)/students/*` (อัปโหลด/แสดงรูป ใช้ `saveUpload("students",..)`/`readUpload`), route serve รูปนักเรียน, เป้าหมายออม/เกียรติบัตร |

**ไฟล์กลางที่ Architect แก้ไปแล้วในรอบนี้** (อย่าแก้ทับโดยไม่คุยกัน): `schema.prisma`, migration ใหม่, `seed.ts`, `lib/auth.ts`, `middleware.ts`, `lib/{settings,audit,files,notify}.ts`, `docker-compose.yml`, `Dockerfile`, `package.json`, `.env.example`, `.gitignore`, และแก้ให้ compile ผ่าน: `Topbar.tsx`(+EXECUTIVE label), `users/page.tsx`(+EXECUTIVE badge), `users/route.ts`(Guardian), `login/route.ts`, `my-child/page.tsx`, `passbook/[studentId]/page.tsx`, `students/[id]/route.ts`
