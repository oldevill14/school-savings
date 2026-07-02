# NOTES — ทีม Dashboard + มุมผู้ปกครอง

ไฟล์ที่สร้าง (ownership ของทีมนี้):

- `src/app/(app)/dashboard/page.tsx` — แดชบอร์ด ADMIN/TEACHER (StatCard 4 ใบ + MonthlyChart + ธุรกรรมล่าสุด 10 รายการ)
- `src/app/(app)/my-child/page.tsx` — มุมผู้ปกครอง (mobile-first, BalanceCard + ประวัติ 20 รายการ)
- `src/app/api/stats/route.ts` — GET สถิติแดชบอร์ด (JSON)
- `src/components/charts/MonthlyChart.tsx` — recharts BarChart ("use client", รับ data ผ่าน props)

## ข้อสมมติ / จุดที่ทีมอื่นควรยืนยัน

1. **`/passbook/[id]` ใช้ `student.id` เป็น param** — ปุ่ม "ดูสมุดบัญชี" ใน `/my-child`
   ลิงก์ไป `/passbook/${student.id}` เพราะ `session.linkedStudentId` เป็น Student id
   และ CONTRACTS ระบุว่า PARENT ตรวจสิทธิ์กับ linkedStudentId ใน page ของ passbook
   → **ทีม passbook ช่วยยืนยัน** ว่า dynamic segment คือ studentId (ไม่ใช่ accountId)
   ถ้าไม่ใช่ แจ้งกลับมาแล้วทีมนี้แก้ลิงก์เอง

2. **การตีความ "12 เดือนของปี active"** — ใช้ปีปฏิทิน ม.ค.–ธ.ค. ของปี พ.ศ. active
   (เช่น พ.ศ. 2569 → ค.ศ. 2026-01-01 ถึง 2026-12-31) ไม่ใช่ปีการศึกษา พ.ค.–มี.ค.

3. **Logic สถิติซ้ำกัน 2 ที่โดยตั้งใจ** — `dashboard/page.tsx` และ `api/stats/route.ts`
   คำนวณเหมือนกัน (Next ไม่อนุญาต export helper เพิ่มจาก route file และทีมนี้ไม่มี
   ownership ใน `src/lib/`) → ถ้า integrator อยาก refactor แนะนำสร้าง `src/lib/stats.ts`
   แล้วให้ทั้งสองไฟล์ import (ทีมนี้ยินดีแก้ตาม)

4. **`GET /api/stats` ตอบ 200 เสมอเมื่อ auth ผ่าน** — ถ้าไม่มีปีการศึกษา active
   จะได้ `{ academicYear: null, ...ค่าศูนย์, monthly: 12 เดือนศูนย์ }` (ไม่ใช่ 404)

5. **ขอบเขต TEACHER** = บัญชีของนักเรียนในห้องที่ `Classroom.teacherId = session.userId`
   และ `Classroom.academicYearId = ปี active` — ครูที่ยังไม่มีห้องประจำจะเห็นค่าศูนย์
   พร้อมการ์ดแจ้งเตือน (ไม่ error)

6. **"วันนี้"** ของสถิติฝาก/ถอนวันนี้ ใช้เวลาเครื่อง server (`new Date()` local midnight
   ถึง midnight ถัดไป) — ถ้า deploy แล้ว server เป็น UTC ควรตั้ง `TZ=Asia/Bangkok`
   ใน environment ของ production (ฝาก integrator ใส่ใน compose/env)

7. **ตัวเลขทุกตัวนับเฉพาะ `status = NORMAL`** — รายการ VOIDED ไม่ถูกนับในยอด
   แต่ยังแสดงในตาราง (line-through + Badge เทา "ยกเลิกแล้ว") ตาม CONTRACTS §6

8. **ปุ่ม "ดูสมุดบัญชี" ไม่ได้ใช้ `Button` component** — Button รองรับเฉพาะ
   `<button>` (ButtonHTMLAttributes) แต่ตรงนี้ต้องเป็นลิงก์ navigation จึงใช้ `<Link>`
   ที่ใส่คลาสหน้าตาเหมือน Button variant primary — ถ้าเจ้าของ `ui/Button` เพิ่ม
   pattern `asChild`/`ButtonLink` เมื่อไร ทีมนี้พร้อมสลับไปใช้

9. **`/my-child` fallback บัญชี** — ถ้าไม่มีบัญชีของปี active จะ fallback ไปบัญชี
   ปีล่าสุดของนักเรียน (กันช่วงคาบเกี่ยวเปลี่ยนปีการศึกษา) พร้อมแสดงเลขปีจริง
   ของบัญชีนั้นใน subtitle

## Dependencies ที่ใช้ (มีครบใน package.json แล้ว)

recharts ^2.15.0, lucide-react, Prisma client (`import type { Prisma } from "@prisma/client"`
ใน page/route เพื่อ type ของ `AccountWhereInput` — ต้อง `npx prisma generate` ก่อน typecheck
ตามที่ CONTRACTS ระบุอยู่แล้ว)
