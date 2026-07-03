# NOTES2-B5 — Export Excel + ทะเบียนคุมเงิน (ฟีเจอร์ 4, 15)

ทีม B5 · ownership: `src/app/(app)/reports/**`, `src/app/api/export/**`

## สรุปสิ่งที่ทำ (เสร็จ + `npx tsc --noEmit` ผ่าน 0 error ทั้งโปรเจกต์)

### 1. Export Excel (ฟีเจอร์ 4) — ใช้ `exceljs` (dep ติดตั้งแล้ว)
- `src/app/api/export/_xlsx.ts` — helper กลางของทีม (ภายใน ownership) สร้าง workbook,
  หัวกระดาษไทย, สไตล์ thead navy/แถวรวม gold, `MONEY_FMT = "#,##0.00"`, `workbookResponse()`
  (Content-Type + Content-Disposition + ชื่อไฟล์ ASCII + วันที่ YYYYMMDD), `schoolHeaderInfo()`
  (ดึงชื่อโรงเรียนจาก `@/lib/settings` แทน hardcode)
- `api/export/classroom-report/route.ts` — reuse `buildClassroomReport` (ไม่ duplicate logic);
  role: ADMIN/EXECUTIVE ทุกห้อง, TEACHER เฉพาะห้องตน; คอลัมน์ตรงหน้า /reports/classroom เป๊ะ
- `api/export/yearly-report/route.ts` — reuse `buildYearlyReport`; 2 ชีต (รายห้อง + รายเดือน);
  มีบรรทัด "ดอกเบี้ยรวมทั้งปี" ถ้ามี
- `api/export/students/route.ts` — รายชื่อนักเรียนปีที่เปิดใช้งาน + ยอดคงเหลือ; TEACHER เฉพาะห้องตน
- `api/export/ledger/route.ts` — ทะเบียนคุมเงินเป็น Excel (A4 แนวนอน) reuse `buildLedgerReport`
- ทุก route: `runtime="nodejs"` + `dynamic="force-dynamic"`, ตัวเลขเป็น number จริง format #,##0.00,
  เช็ค role เดียวกับหน้ารายงาน (โยน AuthError → 401/403), validate เดือน `YYYY-MM`
- ปุ่ม "ดาวน์โหลด Excel" (`ExcelLinkButton.tsx` = `<a download>` สไตล์ secondary, ไม่ต้องใช้ JS)
  ใส่ใน /reports/classroom, /reports/yearly, /reports/ledger, และการ์ดส่งออกรายชื่อใน /reports index

### 2. ทะเบียนคุมเงิน (ฟีเจอร์ 15)
- `src/app/(app)/reports/ledger/page.tsx` — เลือกขอบเขต (ทั้งโรงเรียน/รายห้อง) + ช่วงเดือน →
  ตารางแนวราชการต่อบัญชี: วันที่ | รายการ | รับ(ฝาก) | จ่าย(ถอน) | คงเหลือ | ผู้บันทึก + ยอดยกมา/ยกไป;
  หัวกระดาษ "ทะเบียนคุมเงินออมทรัพย์นักเรียน" + ชื่อโรงเรียนจาก `getSchoolSetting`;
  ช่องเซ็น ผู้จัดทำ/ผู้ตรวจ; print A4 แนวนอน; ปุ่ม export Excel
- เพิ่มการ์ด "ทะเบียนคุมเงิน" + การ์ดส่งออกรายชื่อนักเรียนใน `/reports` index
- TEACHER เห็นเฉพาะห้องตน (ไม่มีตัวเลือก "ทั้งโรงเรียน"); EXECUTIVE ดูได้แบบ view

### 3. report-data.ts (ownership ของ B5 — `reports/report-data.ts`)
- เพิ่ม `buildLedgerReport(scope, {fromKey,toKey})` → คำนวณ carry/entries/running balance
  จาก transactions **NORMAL** เท่านั้น (ตามหลักเดิม, mirror `buildClassroomReport`)
- เพิ่มฟิลด์ `YearlyReport.totals.interest` (SUM DEPOSIT category=INTEREST, NORMAL) — additive

## จุดที่ integrator ควรรู้ / จุดเสี่ยง
- **แก้ requireRole ใน reports pages ให้รวม `EXECUTIVE`** (classroom, yearly — ใน 
  ownership B5; index/page.tsx ทีมอื่นเติม EXECUTIVE ไปแล้ว ผม merge ต่อ). middleware อนุญาต
  EXECUTIVE เข้า `/reports` อยู่แล้ว ก่อนหน้านี้ page จะ redirect ทิ้ง — ตอนนี้ตรงกันแล้ว
- **แก้ `report-data.ts` เพิ่มฟิลด์ `totals.interest`** — เป็น additive, ผู้ใช้เดิม
  (`api/reports/route.ts` = pass-through, yearly page = B5) ไม่กระทบ
- ไม่ได้แตะไฟล์กลางต้องห้าม (schema/migration/middleware/auth/lib กลาง/package.json/compose)
- **ไม่ได้เพิ่มเมนู nav** — ทะเบียนคุมเงินเข้าผ่านการ์ดใน /reports (B1 เป็นเจ้าของ nav-items);
  ถ้าต้องการเมนูลัด `/reports/ledger` แจ้ง B1 เพิ่มเองได้
- Route ที่เปิด `/reports/ledger` เป็น path ใหม่ — middleware ผ่านให้ (prefix `/reports`) ทั้ง
  ADMIN/TEACHER/EXECUTIVE เรียบร้อย
- **ยังไม่ได้ทดสอบผ่าน HTTP จริง**: container `school-savings-app` รันเป็น prod build
  (`node server.js`, NODE_ENV=production) ไม่ hot-reload + ห้าม rebuild/restart; DB ไม่ถูก
  expose ออก host (base compose). ตรวจแล้ว: (a) `tsc --noEmit` 0 error, (b) รัน exceljs จริงกับ
  helper pattern เดียวกัน → ได้ .xlsx ถูกต้อง (PK zip, [Content_Types]/workbook/worksheet ครบ,
  `new Response(buf)` bytes ครบ). แนะนำ integrator rebuild image แล้วลองกดดาวน์โหลดจริงอีกครั้ง
