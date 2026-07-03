# NOTES2-B2 — ทีมความปลอดภัยบัญชี + audit + role ผอ. (ฟีเจอร์ 2, 8, 10)

สรุปสิ่งที่ B2 ทำเสร็จ + คำขอประสานงานไปทีมอื่น (ไฟล์นอก ownership ของ B2)

---

## ✅ สิ่งที่ B2 สร้าง/แก้เอง (อยู่ใน ownership)

| ไฟล์ | สิ่งที่ทำ |
|---|---|
| `src/app/(app)/account/page.tsx` (ใหม่) | หน้า "บัญชีของฉัน" ทุก role — banner เตือนเมื่อ `mustChangePassword`, การ์ดเปลี่ยนรหัส |
| `src/app/(app)/account/ChangePasswordForm.tsx` (ใหม่) | client form เปลี่ยนรหัส → POST `/api/account/password` |
| `src/app/api/account/password/route.ts` (ใหม่) | เปลี่ยนรหัสตนเอง: verify รหัสเดิม → update hash + เคลียร์ `mustChangePassword` → **createSession ใหม่ให้ตัวเอง** (เพราะ pwv เปลี่ยนจะ revoke session เดิมทุกเครื่อง) → logAudit `PASSWORD_CHANGE` |
| `src/app/api/auth/login/route.ts` (แก้) | เพิ่ม logAudit `LOGIN_SUCCESS` / `LOGIN_FAIL` (rate-limit เดิมไม่แตะ) + ถ้า `mustChangePassword=true` ตอบ `redirect:"/account"` |
| `src/app/(app)/audit/page.tsx` (ใหม่) | หน้า Audit log (ADMIN) — ตาราง + กรอง action/ช่วงวันที่ + แบ่งหน้า + คำอธิบาย action ไทย |
| `src/app/(app)/dashboard/page.tsx` (แก้ requireRole) | เพิ่ม `EXECUTIVE` (อ่านอย่างเดียว, เห็นภาพรวมทั้งโรงเรียนเหมือน ADMIN) + แก้ `scopeLabel` |
| `src/app/(app)/transactions/page.tsx` (แก้ requireRole) | เพิ่ม `EXECUTIVE` — ปุ่ม VOID แสดงเฉพาะ ADMIN อยู่แล้ว EXECUTIVE จึงดูอย่างเดียว |
| `src/app/(app)/reports/page.tsx` (แก้ requireRole) | เพิ่ม `EXECUTIVE` (หน้าเลือกประเภทรายงาน) |

**การตัดสินใจ mustChangePassword flow:** เลือกบังคับผ่าน "login → redirect `/account`" (อยู่ใน ownership `api/auth`) + banner ในหน้า `/account` แทนการแก้ `(app)/layout.tsx` (ไฟล์กลาง + layout ไม่รู้ pathname → เสี่ยง redirect วน) — **จึงไม่ต้องแตะไฟล์กลาง** สำหรับฟีเจอร์นี้

---

## 📌 คำขอถึงทีมอื่น (ไฟล์นอก ownership ของ B2 — ช่วยแก้ด้วย)

### ถึง B1 (เจ้าของ `nav-items.ts` / `Sidebar` / `Topbar`)
1. เพิ่มลิงก์ **"บัญชีของฉัน" → `/account`** ให้ทุก role (แผนใน CONTRACTS E.5 = วางใน Topbar). ตอนนี้หน้าใช้งานได้แต่ยังไม่มีทางเข้าจากเมนู
2. เพิ่มเมนู **"บันทึกการตรวจสอบ" → `/audit`** เฉพาะ `roles: ["ADMIN"]` ใน `NAV_ITEMS` (ไอคอนแนะนำ `ScrollText`)
3. เพิ่ม case `EXECUTIVE` ใน `getNavItems()` ให้เห็น: `/dashboard`, `/transactions`, `/students`, `/reports` (+ `/account` ผ่าน Topbar) — ปัจจุบัน EXECUTIVE ยังไม่มี nav item เลย

### ถึง B5 (เจ้าของ `reports/classroom` + `reports/yearly`)
- เพิ่ม `EXECUTIVE` ใน `requireRole` ของ **`reports/classroom/page.tsx`** และ **`reports/yearly/page.tsx`** (ปัจจุบันเป็น `["ADMIN","TEACHER"]`)
- เหตุผล: B2 เปิด `/reports` (index) ให้ EXECUTIVE แล้ว แต่ถ้าไม่เปิดหน้าย่อย พอ EXECUTIVE กด "เปิดรายงาน" จะโดน redirect กลับ `/dashboard`
- หมายเหตุ: `api/export/classroom-report` และ `api/export/yearly-report` เปิดให้ EXECUTIVE อยู่แล้ว (ตรวจแล้ว) — แค่หน้า page ยังขาด. รายงานเป็น read-only/print เท่านั้น ไม่มีปุ่ม mutate จึงปลอดภัย

### ถึง B7 (เจ้าของ `students/*`)
- เพิ่ม `EXECUTIVE` ใน `requireRole` ของ **`students/page.tsx`** (list) และ **`students/[id]/page.tsx`** (detail) — ปัจจุบัน `["ADMIN","TEACHER"]`
- **ซ่อนปุ่ม mutate ทุกอันจาก EXECUTIVE** (เพิ่ม/แก้ไข/ย้ายห้อง/อัปโหลดรูป/แก้เป้าหมายออม) — ให้เป็นมุมมองอ่านอย่างเดียว
- ฝั่ง API ปลอดภัยแล้ว: `api/students/route.ts` (POST) และ `api/students/[id]/route.ts` (PATCH/mutate) เป็น `["ADMIN"]`/`["ADMIN","TEACHER"]` — **อย่าเผลอเพิ่ม EXECUTIVE ใน endpoint ที่ mutate**
- GET `api/students/[id]/route.ts` (บรรทัด 43) เป็น `["ADMIN","TEACHER","PARENT"]` — ถ้า detail page ของ EXECUTIVE เรียก endpoint นี้ ต้องเพิ่ม `EXECUTIVE` ให้ **เฉพาะ GET** (ไม่ใช่ PATCH)

### ถึง B3 (เจ้าของ `passbook/*` + `api/users/*`)
1. **passbook:** เพิ่ม `EXECUTIVE` ใน `requireRole` ของ **`passbook/[studentId]/page.tsx`** (ปัจจุบัน `["ADMIN","TEACHER","PARENT"]`). EXECUTIVE ดูสมุดบัญชีรายคนได้ทุกคนแบบอ่านอย่างเดียว (PARENT ยังจำกัดเฉพาะลูกตัวเองตามเดิม)
2. **reset รหัสผ่าน (ฟีเจอร์ B2 ข้อ 2 ฝั่ง admin) — B2 แตะเฉพาะ `api/auth/*` จึงฝากให้ B3 เจ้าของ `api/users/[id]`:**
   เมื่อ ADMIN รีเซ็ตรหัสผู้ใช้ใน `PATCH /api/users/[id]` (หรือ endpoint reset) ให้:
   - ตั้ง `mustChangePassword: true` พร้อมกับ update `passwordHash`
   - `await logAudit({ userId: session.userId, action: AuditAction.PASSWORD_RESET, detail: \`รีเซ็ตรหัสผ่านผู้ใช้ ${targetUsername}\` })`
   - (การเปลี่ยน hash จะ revoke session เดิมของ user นั้นเองผ่าน pwv อยู่แล้ว)
   ผู้ใช้ที่ถูกรีเซ็ตจะเจอ banner + ถูกพาไป `/account` ตอน login รอบถัดไป (flow ฝั่ง B2 พร้อมแล้ว)
   - ระหว่างนี้ที่ `api/users/[id]` ยังตั้ง disable/enable user อยู่แล้ว → ควร logAudit `USER_DISABLE`/`USER_ENABLE` ด้วยจะครบ (optional, ช่วยให้ /audit สมบูรณ์)

### ถึงทุกทีมที่มี API mutate
- **ห้ามเพิ่ม `EXECUTIVE` ใน `requireRoleApi` ของ endpoint ที่เขียน/แก้ข้อมูลเด็ดขาด** (EXECUTIVE = read-only ตาม CONTRACTS §4). ปัจจุบันตรวจแล้วสะอาด — EXECUTIVE อยู่แค่ใน `api/export/*` (GET) และ `api/account/password` (self-service ทุก role)
- heads-up: `api/stats` และ `api/reports` (GET) ยังเป็น `["ADMIN","TEACHER"]` — ถ้ามี client component ในหน้า EXECUTIVE (dashboard/reports) ไป fetch สองตัวนี้ จะได้ 403. ปัจจุบัน `dashboard/page.tsx` query prisma ตรง ไม่เรียก `api/stats` จึงไม่กระทบ — แต่ถ้าใครเพิ่ม widget ที่ fetch ให้เพิ่ม `EXECUTIVE` ใน GET เหล่านั้น

---

## ℹ️ ของกลางที่ B2 พึ่งพา (ไม่ได้แก้ — แค่ใช้)
- `@/lib/audit` → `logAudit`, `AuditAction` (fire-and-forget)
- `@/lib/auth` → `createSession`, `verifyPassword`, `hashPassword`, `requireRole`, `requireRoleApi`, `AuthError`
- `AuditLog` model (`userId String?`, no FK) — /audit resolve ชื่อผู้ใช้เองด้วย map
- `User.mustChangePassword` (Boolean default false) — อ่านตรงใน `/account` (ไม่อยู่ใน SessionPayload)
- `ROLE_LABELS` จาก `@/components/layout/Topbar`
