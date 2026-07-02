# NOTES — ทีมจัดการนักเรียน + สมุดบัญชี (students / passbook)

สถานะ: เสร็จตาม scope · ไม่ได้รัน typecheck/build (ห้ามรันตามกติกา + prisma client ยังไม่ generate)

## ไฟล์ที่สร้าง

| ไฟล์ | หน้าที่ |
|---|---|
| `src/app/(app)/students/page.tsx` | รายชื่อนักเรียน (server: requireRole ADMIN/TEACHER, ดึงข้อมูลปี active) |
| `src/app/(app)/students/StudentsClient.tsx` | **ไฟล์เพิ่มนอก ownership list** — ดูเหตุผลด้านล่าง |
| `src/app/(app)/students/[id]/page.tsx` | โปรไฟล์ + BalanceCard + ธุรกรรมล่าสุด 10 รายการ |
| `src/app/api/students/route.ts` | GET รายชื่อ / POST สร้างรายคน + นำเข้า CSV |
| `src/app/api/students/[id]/route.ts` | GET รายคน / PATCH แก้ไข-ย้ายห้อง-เปลี่ยนสถานะ |
| `src/app/(app)/passbook/[studentId]/page.tsx` | สมุดบัญชี + เลือกปี + print CSS ในหน้า |
| `src/components/PassbookTable.tsx` | ตารางสมุดบัญชี (client) + `PassbookPrintButton` (named export, เรียก `window.print()`) |

## ไฟล์เพิ่ม 1 ไฟล์: `students/StudentsClient.tsx`

หน้า /students ต้องมี Modal + ค้นหา + import CSV (ต้องเป็น client component) แต่ page.tsx
ต้องเป็น server component เพื่อเรียก `requireRole` — จึงแยกส่วน interactive เป็นไฟล์ colocated
ในโฟลเดอร์ route ของทีมนี้เอง ไม่กระทบไฟล์ของ agent อื่น ถ้า integrator ไม่โอเค ย้าย/รีเนมได้อิสระ
(export: default `StudentsClient` + types `StudentRow`, `ClassroomOption`, `StudentStatusValue`)

## การตีความสิทธิ์ (ตัดสินใจแล้ว — เช็คฝั่ง server ทุกจุด)

- **เพิ่ม/แก้ไข/ย้ายห้อง/นำเข้า CSV = ADMIN เท่านั้น** (spec: "admin จัดการได้ทุกห้อง teacher ดูได้แต่ห้องตัวเอง")
- TEACHER: /students และ GET API เห็นเฉพาะห้องที่ `classroom.teacherId = session.userId`;
  /students/[id] ของนักเรียนนอกห้องตัวเอง → การ์ดไม่มีสิทธิ์
- **PARENT + passbook**: เช็ค `session.linkedStudentId === studentId` ใน page ก่อน query — ไม่ตรงได้การ์ด 403
- passbook สำหรับ ADMIN/TEACHER เปิดได้ทุกคน (spec ระบุข้อจำกัดเฉพาะ PARENT; ครูต้องใช้ตรวจสอบ/บันทึก)
- ไม่มี DELETE นักเรียน — ใช้ status GRADUATED/MOVED (หลักการไม่มีอะไรถูกลบ)

## API contract (สำหรับทีมอื่นที่อยากเรียก)

- `GET /api/students?search=&classroomId=` → `{ students: [{ id, studentCode, firstName, lastName, status, classroomId, classroomName }] }`
- `POST /api/students` body `{ studentCode, firstName, lastName, classroomId }` → 201 `{ student }` (เปิด Account ปีเดียวกับห้องให้อัตโนมัติ, openingBalance 0)
- `POST /api/students` body `{ rows: [{ studentCode, firstName, lastName, classroomName, line? }] }` → `{ created, skipped: [{ line, studentCode, reason }] }` (จับคู่ห้องด้วยชื่อในปี active, ข้ามรหัสซ้ำ, จำกัด 500 แถว/ครั้ง)
- `PATCH /api/students/[id]` body partial `{ studentCode?, firstName?, lastName?, classroomId?, status? }` → `{ student }`
- `GET /api/students/[id]` → `{ student }` รวม `accounts[]` (balance เป็น string; PARENT เข้าถึงได้เฉพาะบุตรตัวเอง)
- error ทุกตัว: `{ error: "ข้อความไทย" }` + status 400/403/404/409/500

## จุดที่ integrator ควรรู้ / ข้อจำกัด

1. **scope ปี active**: /students แสดงเฉพาะนักเรียนในห้องของปีการศึกษาที่ `isActive` —
   ถ้าทีมปีการศึกษาสร้างห้องปีใหม่โดยยังไม่ย้ายนักเรียน นักเรียนห้องปีเก่าจะไม่โผล่ในหน้านี้
   (ตาม schema: Student ผูก 1 classroom, classroom ผูก 1 ปี)
2. **ย้ายห้าม cross-year**: PATCH ตรวจแค่ว่า classroom มีจริง ไม่ได้บังคับว่าเป็นปีเดียวกับห้องเดิม —
   ถ้าทีม academic-years ต้องการ policy เข้มกว่านี้ เพิ่ม validation ได้ที่ `api/students/[id]/route.ts`
3. **running balance ใน passbook** คำนวณสดจาก transactions (satang int, เฉพาะ NORMAL) เริ่มจาก
   openingBalance — ถ้าเลขไม่ตรงกับ `Account.balance` (BalanceCard) แปลว่าที่อื่นเขียนธุรกรรม
   โดยไม่รักษา invariant ใน `$transaction()`
4. **print CSS** อยู่ใน `<style>` ของ passbook page เท่านั้น — selector อิง markup ของ layout ทีมกลาง:
   `aside` (Sidebar), `header.sticky` (Topbar), `nav.fixed` (MobileNav) — **ถ้าทีม layout เปลี่ยน
   class เหล่านี้ print จะเพี้ยน** (ตั้งใจไม่แตะ globals.css ตามกติกา)
5. แถวแรกของสมุดคือ "ยอดยกมา" ใช้วันที่ `academicYear.openedAt`; รายการ VOIDED แสดงขีดฆ่า +
   Badge "ยกเลิกแล้ว" และช่องคงเหลือเป็น "—" (ไม่กระทบยอด)
6. CSV import: UTF-8, คั่น comma, ไม่รองรับค่าในเซลล์ที่มี comma ภายใน (ชื่อคน/ชื่อห้องไทยปกติไม่มี);
   ข้ามแถวหัวถ้าคอลัมน์แรกเป็น `studentCode`; ตัด BOM ให้แล้ว
7. ไม่พบไฟล์สเปก `01-SYSTEM-ANALYSIS.md` / `02-FILE-PLAN.md` / `03-BUILD-PROMPT.md` ใน repo —
   ทำงานจาก `CONTRACTS.md` + prompt ของทีมเท่านั้น
