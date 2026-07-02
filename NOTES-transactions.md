# NOTES — ทีม transactions (บันทึกฝาก-ถอน + ประวัติธุรกรรม)

วันที่: 2 ก.ค. 2569

## ไฟล์ที่สร้าง (ownership ของทีมนี้)

| ไฟล์ | หน้าที่ |
|---|---|
| `src/app/(app)/transactions/page.tsx` | ประวัติธุรกรรม + ตัวกรอง (ห้อง/วันที่/ประเภท) + แบ่งหน้า 20 รายการ + สรุปยอดตามตัวกรอง + ปุ่มยกเลิก (admin) |
| `src/app/(app)/transactions/new/page.tsx` | หน้าเลือกห้อง + โหลดนักเรียนทั้งห้อง (teacher ล็อกห้องตัวเอง) |
| `src/app/api/transactions/route.ts` | `POST` บันทึกรายคน · `PATCH` ยกเลิกรายการ (ADMIN, VOID + คืนยอด) |
| `src/app/api/transactions/batch/route.ts` | `POST` บันทึกทั้งชุดใน `prisma.$transaction` เดียว |
| `src/components/BatchDepositTable.tsx` | ตารางกรอกหลายคน (client) — เติมยอดเท่ากัน, Enter/Tab ไล่ลง, เตือนถอนเกินยอดสีแดงทันที, Modal ยืนยัน |

## ไฟล์เพิ่มเติมนอกรายการ ownership (อยู่ใน subtree ของ feature นี้ ไม่ทับใคร)

1. **`src/app/api/transactions/_lib.ts`** — logic กลาง (`recordTransactions`, `voidTransaction`, `parseTxnItem`, `TxnError`)
   เหตุผล: Next.js **ห้าม export อย่างอื่นจาก route.ts** นอกจาก HTTP handlers (build type-check จะพัง)
   จึงแยกไฟล์เพื่อให้ route รายคน/batch ใช้ logic ชุดเดียวกันตามโจทย์ — ไฟล์ขึ้นต้น `_` ไม่ถูก route
2. **`src/app/(app)/transactions/VoidTransactionButton.tsx`** — ปุ่ม+Modal ยืนยันยกเลิก (client component)
   เหตุผล: หน้า history เป็น Server Component ผสม client ในไฟล์เดียวไม่ได้

## การตัดสินใจสำคัญ (ให้ integrator/reviewer ตรวจตาม)

- **Atomicity**: batch ทั้งชุดอยู่ใน `prisma.$transaction` เดียว (`timeout: 20000` เผื่อห้องใหญ่) — แถวใดไม่ผ่าน rollback ทั้งชุด พร้อม error ไทยระบุชื่อนักเรียน + ยอดคงเหลือ
- **กันยอดติดลบแบบ atomic**: การถอนใช้ `updateMany({ where: { id, balance: { gte: amount } }, data: { decrement } })` แล้วเช็ค `count === 0` → กัน race ระหว่าง request ซ้อนกัน โดยไม่ต้องใช้ serializable isolation
- **VOID (PATCH /api/transactions)**: ADMIN เท่านั้น, ตั้ง `status=VOIDED + voidedById + voidedAt` แล้วคืนยอดใน `$transaction` เดียว — **ยกเลิกรายการฝากจะถูกปฏิเสธถ้ายอดปัจจุบันไม่พอหักคืน** (กัน balance ติดลบกรณีเงินถูกถอนไปแล้ว)
- **txnDate = เวลา server ขณะบันทึก** — UI ยังไม่มีช่องบันทึกย้อนหลัง (schema รองรับอยู่แล้ว เพิ่มภายหลังได้ที่ `_lib.ts`)
- **ไม่มีบัญชีปีปัจจุบัน → เปิดบัญชียอด 0 ให้อัตโนมัติ** ตอนบันทึกธุรกรรมแรก (กันเคสทีม students เพิ่มนักเรียนโดยไม่สร้าง account)
- TEACHER ถูกบังคับขอบเขตฝั่ง server ทุกจุด: บันทึกได้เฉพาะนักเรียนห้องที่ตนประจำชั้น (ปี active), ประวัติเห็นเฉพาะห้องตัวเอง — เช็คใน `_lib.ts` + query ของ page ไม่ใช่แค่ UI
- ฟอร์มตัวกรองหน้า history เป็น `<form method="get">` ล้วน — ทำงานได้ไม่ต้องมี JS
- จำกัด: ≤ 100 รายการ/batch, จำนวนเงิน ≤ 1,000,000 บาท/รายการ, note ≤ 200 ตัวอักษร

## สิ่งที่ยังไม่ได้ทำ / ต้องรอ

- **ยังไม่ได้ typecheck/build** — เครื่องนี้ไม่มี `node_modules` และกติกาห้ามรัน `npm install` / `prisma generate` → integrator ต้องรัน `npm install && npx prisma generate` ก่อน `tsc`/`next build`
- ไฟล์สเปก `01-SYSTEM-ANALYSIS.md` / `02-FILE-PLAN.md` / `03-BUILD-PROMPT.md` **ไม่มีอยู่จริงใน repo** (path ที่ orchestrator ส่งมาเป็น `undefined/...`) — ทำงานตาม `CONTRACTS.md` + โจทย์ในงานแทน
- ถ้าทีม reports/passbook ต้องการ query ธุรกรรม แนะนำ query prisma ตรงใน Server Component แบบเดียวกับหน้า history (ไม่มี GET /api/transactions — จงใจไม่ทำ เพราะไม่มีผู้ใช้)
