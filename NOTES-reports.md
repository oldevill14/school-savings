# NOTES — ทีมรายงานสรุป (reports)

สถานะ: เสร็จตามสโคป — เขียนไฟล์อย่างเดียว ยังไม่ได้รัน install/generate/build ตามกติกา

## ไฟล์ที่สร้าง

| ไฟล์ | หน้าที่ |
|---|---|
| `src/app/(app)/reports/page.tsx` | หน้าเลือกประเภทรายงาน (การ์ด 2 ใบ) |
| `src/app/(app)/reports/classroom/page.tsx` | รายงานรายห้องเรียน (เลือกห้อง + ช่วงเดือน) |
| `src/app/(app)/reports/yearly/page.tsx` | รายงานรายปีการศึกษา (สรุปทุกห้อง + รายเดือน) |
| `src/app/api/reports/route.ts` | GET JSON: `?type=classroom&classroomId=..&from=..&to=..` / `?type=yearly&year=2569` |
| `src/app/(app)/reports/report-data.ts` | **ไฟล์เพิ่มนอกรายการ ownership (colocated ในโฟลเดอร์ reports)** — ชั้นข้อมูลรายงานที่หน้าเพจ + API route ใช้ร่วมกัน กันตรรกะซ้ำ 3 ที่ (Next ห้าม export ฟังก์ชันอื่นจาก route.ts จึงแยกไฟล์) |
| `src/app/(app)/reports/PrintButton.tsx` | **ไฟล์เพิ่มนอกรายการ ownership (colocated)** — client component ปุ่ม `window.print()` (server page ใส่ onClick เองไม่ได้) |

ไฟล์เพิ่ม 2 ตัวอยู่ใต้ `src/app/(app)/reports/` ทั้งคู่ — ไม่แตะไฟล์กลางหรือไฟล์ของทีมอื่นใดๆ

## การตัดสินใจสำคัญ

- **ทุกตัวเลขคำนวณจาก `Transaction` ที่ `status = NORMAL`** ผ่าน `groupBy`/`findMany` — ไม่อ่าน `Account.balance` เลย ใช้ `Prisma.Decimal` (`.plus/.minus`) ตลอดสาย คืนเป็น string `toFixed(2)` แล้วแสดงผลผ่าน `formatBaht`
- ยอดยกมา (รายห้อง) = `openingBalance` + ฝาก − ถอน (NORMAL) *ก่อน* เดือนเริ่มช่วง / คงเหลือ = ยกมา + ฝาก − ถอนในช่วง
- ช่วงเดือนใช้คีย์ `YYYY-MM` (ค.ศ.) ใน URL/API, แสดงผลเป็น พ.ศ. — หน้าต่างปีการศึกษา = พ.ค. → เม.ย. ปีถัดไป; ค่าที่ผิด/นอกหน้าต่างถูก clamp เป็นค่าเริ่มต้น (พ.ค. → เดือนปัจจุบัน), from > to สลับให้
- **TEACHER เห็นเฉพาะห้องที่ตนเป็นครูประจำชั้น** (`Classroom.teacherId = session.userId`) — บังคับทั้งใน page และใน API (403 + ข้อความไทย); ADMIN เห็นทุกห้อง; รายงานรายปีเปิดให้ทั้ง ADMIN/TEACHER ตาม route map
- หน้าเลือกห้องแสดงห้องของ "ปีการศึกษาที่ isActive" — รายงานปีเก่าดูผ่านรายงานรายปี
- รายงานรายปี: บัญชีของนักเรียนที่ `Student.classroomId` ไม่อยู่ในห้องของปีนั้นแล้ว (เช่น ดูปีเก่าหลังเลื่อนชั้น — schema เก็บห้องปัจจุบันห้องเดียว) ถูกจัดเข้าแถว "ไม่ระบุห้อง (ย้ายห้อง/ปีอื่น)" เพื่อให้แถวรวมทั้งโรงเรียนตรงกับผลรวมจริงเสมอ
- ทุกรายงานมี "ข้อมูล ณ วันที่ …" (formatThaiDateTime) + หมายเหตุว่าไม่รวมรายการ VOIDED; `export const dynamic = "force-dynamic"` ทุก page ที่แตะ DB
- พิมพ์: ปุ่ม PrintButton + `@media print` ใน `<style>` ของแต่ละหน้า (ผ่าน `dangerouslySetInnerHTML` กัน React escape CSS) — ซ่อน `aside`/`nav`/`header.sticky`/`.print-hide`, โชว์หัวกระดาษ `.print-only` (ชื่อโรงเรียน + เขตพื้นที่ + ชื่อรายงาน), thead พิมพ์พื้นขาวตัวดำกันเครื่องพิมพ์ไม่พิมพ์พื้นหลัง

## สิ่งที่ integrator ควรรู้ / เฝ้าระวัง

1. **ฟอร์มตัวกรองเป็น GET form ธรรมดา** (ไม่มี JS) — ใช้ `<Select>`/`<Button type="submit">` จาก ui กลาง render ใน Server Component; `Select` ใช้ `useId` ซึ่ง React 19 รองรับใน Server Components แล้ว แต่ถ้า build แล้วเจอ error เรื่อง hook ใน RSC ให้แจ้งทีม ui/foundation (กระทบทุกทีมที่ใช้ Select ในฟอร์มแบบ server)
2. แถวรวมท้ายตารางในหน้า classroom ใช้ raw `<td colSpan={2}>` ปนกับ `TD` (คอมโพเนนต์ `TD` กลางไม่รับ colSpan) — ถ้าทีม ui เพิ่ม prop colSpan ให้ TD ภายหลัง ค่อยเปลี่ยนได้
3. แถวรวมใช้ `!bg-gold/10` (important) เพราะ `TBody` กลางมี zebra stripe `[&>tr:nth-child(even)]:bg-slate-50/70` ที่ specificity ชนะคลาสธรรมดา
4. API `/api/reports` คืนจำนวนเงินเป็น string ทศนิยม 2 ตำแหน่ง (`"1234.50"`) และเดือนเป็นคีย์ ค.ศ. + `label` ภาษาไทย พ.ศ. ให้แล้ว
5. ไม่ได้แตะ `nav-items.ts` — เมนู "รายงาน" `/reports` มีอยู่แล้วจาก foundation
6. ยังไม่ได้รัน typecheck (ห้ามรัน npm install/prisma ตามกติกา + ไม่มี node_modules) — จุดที่พึ่ง type จาก generated client: `groupBy` ใน `report-data.ts`
