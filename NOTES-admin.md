# NOTES-admin — ทีม admin (ห้องเรียน / ปีการศึกษา / ผู้ใช้)

วันที่: 2 ก.ค. 2569

## ไฟล์ที่สร้าง (ตาม ownership)

- `src/app/(app)/classrooms/page.tsx`
- `src/app/(app)/academic-years/page.tsx`
- `src/app/(app)/users/page.tsx`
- `src/app/api/classrooms/route.ts` — GET / POST / PATCH / DELETE (PATCH/DELETE รับ id ใน body เพราะ ownership ไม่มี [id] route)
- `src/app/api/academic-years/route.ts` — GET
- `src/app/api/academic-years/close/route.ts` — POST (ปิดปี+เปิดปีใหม่ใน `prisma.$transaction` เดียว)
- `src/app/api/users/route.ts` — GET / POST
- `src/app/api/users/[id]/route.ts` — PATCH (reset-password / disable / enable)

ทุก endpoint เช็ค `requireRoleApi(["ADMIN"])` ฝั่ง server

## การตัดสินใจสถาปัตยกรรม (integrator ควรรู้)

1. **ทั้ง 3 หน้าเป็น client component (`"use client"`) ดึงข้อมูลผ่าน API ของทีมนี้เอง**
   เหตุผล: ownership อนุญาตเฉพาะ `page.tsx` (สร้างไฟล์ client component แยกไม่ได้)
   แต่หน้าเหล่านี้ต้องมี modal/ฟอร์มโต้ตอบ จึงเลือกให้ทั้งหน้าเป็น client
   - การกันสิทธิ์หน้า: middleware บังคับ prefix `/classrooms`, `/academic-years`, `/users` = ADMIN อยู่แล้ว
   - การกันข้อมูล: ทุก API ที่หน้าเรียก เช็ค `requireRoleApi(["ADMIN"])` ซ้ำเสมอ
   - จึงไม่ต้องใช้ `export const dynamic = "force-dynamic"` ที่หน้า (หน้าไม่แตะ DB ตรง) —
     ใส่ไว้ที่ API route แทน

2. **"ปิดใช้งานผู้ใช้" ทำโดยไม่แก้ schema** (schema ไม่มีฟิลด์ `isActive` และ
   `prisma/schema.prisma` เป็นของทีม foundation):
   - ปิดใช้งาน = เติม prefix `"DISABLED:"` หน้า `passwordHash`
     → `bcrypt.compare` กับค่าที่มี prefix จะคืน false เสมอ = ล็อกอินไม่ได้
   - เปิดใช้งานกลับ = ถอด prefix ออก (hash เดิมยังอยู่ ไม่ต้องตั้งรหัสใหม่)
   - **ข้อจำกัด**: session JWT ที่ออกไปแล้ว (อายุ 12 ชม.) ยังใช้ได้จนหมดอายุ
     เพราะ middleware/getSession ไม่ query DB
   - **ขอทีม foundation (ถ้ามีรอบแก้ schema)**: เพิ่ม `isActive Boolean @default(true)`
     ใน model User + ให้ `/api/auth/login` ปฏิเสธผู้ใช้ isActive=false
     แล้วค่อย migrate ข้อมูล (แถวที่ hash ขึ้นต้น `DISABLED:` → isActive=false + ถอด prefix)
   - รีเซ็ตรหัสผ่านผู้ใช้ที่ถูกปิดใช้งาน = เปิดใช้งานกลับโดยปริยาย (hash ใหม่ทับ sentinel) —
     แจ้งไว้ใน UI แล้ว
   - ค่าคงที่ `DISABLED_PREFIX` ประกาศซ้ำใน 3 route files (สร้าง lib กลางไม่ได้ตาม ownership) —
     ถ้าย้ายเข้า `src/lib` ได้จะดีกว่า

3. **ตรรกะปิดปีการศึกษา** (`POST /api/academic-years/close`) — ใน transaction เดียว:
   - ยืนยัน: body `{ confirmYear }` ต้องตรงกับเลขปี active (UI บังคับพิมพ์เลขปี 2 ชั้น)
   - ปีใหม่ = ปี active + 1 (ถ้ามีปีนั้นอยู่แล้ว → 400)
   - ห้องปีใหม่ = ชื่อห้องเดิมทั้งหมด ∪ ชื่อปลายทางเลื่อนชั้น (เช่น มี ป.1/1 เดิม →
     ปีใหม่มีทั้ง ป.1/1 เปล่าไว้รับเด็กใหม่ และ ป.2/1 รับเด็กที่เลื่อนขึ้น)
   - **ครูประจำชั้นติดกับชื่อห้องเดิม** (ครูอยู่ชั้นเดิม รับนักเรียนรุ่นใหม่) — ตีความจาก
     ธรรมเนียมประถม ถ้าโรงเรียนให้ครูตามนักเรียนขึ้นชั้น ต้องแก้ mapping ใน close/route.ts
   - นักเรียน ACTIVE เท่านั้นที่ถูกเลื่อน/จบ (GRADUATED/MOVED เดิมไม่ถูกแตะ)
   - ป.6 → status GRADUATED, ไม่สร้างบัญชีปีใหม่, classroomId คงชี้ห้องปีเดิม (เป็นประวัติ)
   - ชื่อห้องที่ไม่ตรง pattern `ป.X/Y` → สร้างห้องชื่อเดิมในปีใหม่แล้วย้ายนักเรียนไป (ไม่เลื่อนชั้น)
   - บัญชีปีใหม่: `openingBalance = balance` ปีเดิม (ส่ง Prisma Decimal ตรงๆ ไม่แปลง float)
   - บัญชี/ธุรกรรมปีเดิมไม่ถูกแตะเลย — audit ย้อนหลังได้ครบ

4. **ลบห้องเรียน**: อนุญาตเฉพาะห้องของปี active ที่ `_count.students == 0`
   (ห้องที่เคยมีนักเรียน = มีประวัติ = ลบไม่ได้) — สอดคล้องหลัก "ไม่มีอะไรถูกลบ" เท่าที่ CRUD ต้องการ

## สิ่งที่พึ่งพาจากทีมอื่น (ยืนยันแล้วว่ามีจริง)

- `@/lib/auth` (`requireRoleApi`, `AuthError`, `hashPassword`, `Role`), `@/lib/db`,
  `@/lib/money`, `@/lib/thai-date`
- UI: Button/Card/Input/Select/Modal/Badge (default), Table (named), StatCard
- `ROLE_LABELS` import จาก `@/components/layout/Topbar` (named export)
- เมนู `/classrooms`, `/academic-years`, `/users` มีใน `nav-items.ts` แล้ว — ไม่ได้แก้อะไร

## ประเด็นที่พบระหว่างทำ (แจ้ง integrator)

- **ไม่พบไฟล์สเปก** `01-SYSTEM-ANALYSIS.md` / `02-FILE-PLAN.md` / `03-BUILD-PROMPT.md`
  ที่ prompt อ้างถึง (ค้นทั้ง repo แล้ว) — สร้างตาม CONTRACTS.md + task brief แทน
- โฟลเดอร์โปรเจกต์ชื่อ `undefined/` (ตัวแปร path ของ orchestrator ไม่ถูก set) —
  ควร rename ก่อน deploy
- `/api/classrooms`, `/api/academic-years`, `/api/users` โดน middleware เช็คแค่ "login แล้ว"
  (prefix ADMIN ของ middleware คุมเฉพาะหน้า ไม่ใช่ /api/*) — role จึงถูกเช็คใน handler ทุกตัวตามสัญญา
- ยังไม่ได้รัน typecheck กับ `@prisma/client` จริง (ห้ามรัน npm install/prisma generate) —
  จุดเสี่ยง type ที่ควรดูตอน build: `prisma.account.groupBy` ใน academic-years GET,
  `params: Promise<{ id }>` (Next 15) ใน users/[id]
