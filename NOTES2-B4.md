# NOTES2-B4 — ปิดยอดเงินสด + สลิป + ดอกเบี้ย (ฟีเจอร์ 5, 6, 7)

ทีม B4 · รอบขยายฟีเจอร์ 2569-07 · ไม่ได้แตะไฟล์กลาง (schema/middleware/auth/lib กลาง/package/compose)

## ไฟล์ที่สร้างใหม่

- `src/app/(app)/cash-closing/page.tsx` — หน้าปิดยอดเงินสด (ADMIN เขียน / TEACHER อ่านเฉพาะห้องตน)
- `src/app/(app)/cash-closing/CashClosingForm.tsx` — client: กรอกยอดนับจริง + แสดงผลต่างสด
- `src/app/(app)/cash-closing/cash-data.ts` — **server-only** helper คำนวณเงินสดรายวัน (แชร์กับ API)
- `src/app/api/cash-closing/route.ts` — POST บันทึกปิดยอด (คำนวณ expectedNet ใหม่ฝั่ง server; กันปิดซ้ำด้วย P2002 → 409)
- `src/app/(app)/interest/page.tsx` — หน้าจ่ายดอกเบี้ย (ADMIN)
- `src/app/(app)/interest/InterestForm.tsx` — client: กรอกอัตรา → preview → ยืนยันด้วยการพิมพ์เลขปี
- `src/app/(app)/interest/interest-calc.ts` — **pure** (ไม่มี import server/client) แชร์สูตรระหว่าง form + API ให้ preview ตรงกับที่บันทึกจริง
- `src/app/api/interest/route.ts` — POST จ่ายดอกเบี้ย ($transaction เดียว, category=INTEREST)
- `src/components/TransactionSlip.tsx` — ปุ่ม/ตัวพิมพ์สลิป (พิมพ์ผ่าน iframe ซ่อน, หนึ่งใบต่อนักเรียน)

## ไฟล์ที่แก้ (อยู่ใน ownership B4)

- `src/app/api/transactions/_lib.ts`
  - **เปลี่ยน return ของ `recordTransactions`**: เดิม `{ count }` → **`{ count, results: TxnResult[] }`** (เพิ่ม type `TxnResult = { studentId, type, amount, balanceAfter }`) เพื่อพิมพ์สลิปด้วยยอดคงเหลือใหม่จริง อ่านจากบัญชี "ภายใน" transaction เดียวกัน — **ไม่แตะ logic validate/atomicity เดิม** (เพิ่มเฉพาะการอ่านยอด + เก็บ results)
  - บันทึกสำเร็จ → `notifyGuardiansOfTransaction([studentId], summary)` แบบ fire-and-forget หลัง commit
  - `voidTransaction` → เพิ่ม `logAudit(TXN_VOID)` หลัง void สำเร็จ
- `src/app/api/transactions/route.ts`, `.../batch/route.ts` — ส่ง `results` กลับใน JSON เพิ่มเติม
- `src/app/(app)/transactions/new/page.tsx` — เพิ่ม `getSchoolSetting()` + ส่ง `schoolName/schoolArea/recorderName` เข้า BatchDepositTable
- `src/components/BatchDepositTable.tsx` — หลังบันทึกสำเร็จเปิด Modal สรุปรายการ + ปุ่ม "พิมพ์สลิป" (SlipPrintButton)
- `src/app/api/academic-years/close/route.ts` — เพิ่ม `logAudit(YEAR_CLOSE)` เท่านั้น (ตามที่ contract อนุญาต)

## เรื่องที่ integrator/Architect ควรรู้

1. **เมนู nav (ฝั่ง B1):** ยังไม่มีลิงก์เมนู `/cash-closing` และ `/interest` เพราะ `nav-items.ts` เป็นของ B1 คนเดียว — B1 ต้องเพิ่ม (ADMIN+TEACHER → cash-closing, ADMIN → interest) middleware กัน route ให้แล้ว หน้าเข้าถึงได้ตรง ๆ ระหว่างรอเมนู
2. **ไม่ต้องเพิ่ม dependency ใด ๆ** — ใช้ของเดิมทั้งหมด (ไม่แตะ package.json)
3. **cash-closing จัดกลุ่มตามห้องปัจจุบันของนักเรียน** (`student.classroomId`) — ถูกต้องสำหรับการปิดยอด "วันนี้"; หากเปิดดูวันย้อนหลังของนักเรียนที่ย้ายห้องแล้ว ห้องอาจแสดงเป็นห้องปัจจุบัน (ยอดรวมทั้งโรงเรียนยังถูกต้อง) — ยอมรับได้สำหรับ daily reconciliation
4. **สลิปพิมพ์ผ่าน iframe ซ่อน** (ไม่ใช่ @media print ทั้งหน้า) เพื่อไม่ชนกับ layout/print CSS ของทีมอื่น
5. **verify ที่ทำแล้ว:** `npx tsc --noEmit` ผ่าน + `npx next build` ผ่าน (compile + type-check ทุก route ใหม่ ✓). **ยังไม่ได้ render จริงกับ Dit จริง** เพราะ localhost:5432 บนเครื่องนี้เป็น Postgres ของ host (ไม่ใช่ DB ใน Docker ที่ไม่ publish port ออก host) → login 500 (access denied) ตอนต่อ dev server ท้องถิ่น. แนะนำให้ smoke-test /cash-closing, /interest, พิมพ์สลิป, จ่ายดอกเบี้ย หลัง rebuild container
