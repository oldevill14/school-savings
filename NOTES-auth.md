# NOTES — ทีม auth (login/logout)

วันที่: 2 ก.ค. 2569

## ไฟล์ที่สร้าง (ownership ของทีมนี้)

- `src/app/login/page.tsx` — หน้า /login (นอก route group `(app)`), redirect ถ้ามี session อยู่แล้ว, กรอง `?next=` กัน open redirect
- `src/components/LoginCard.tsx` — การ์ด 2 คอลัมน์ (client): ซ้ายแบรนด์ navy + เช็คลิสต์ 5 ฟีเจอร์จุดทอง, ขวาฟอร์ม + toggle รหัสผ่าน + modal "ลืมรหัสผ่าน" — mobile ซ้ายย่อเป็น header
- `src/app/api/auth/login/route.ts` — POST login: verify bcryptjs -> createSession -> ตอบ `{ ok, role, redirect }`; ผิด -> 401 "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"; มี dummy-hash compare กัน timing attack; `runtime = "nodejs"`
- `src/app/api/auth/logout/route.ts` — POST logout: `destroySession()` + ลบ cookie บน response แล้ว **redirect 303 -> /login** (รองรับ form POST จาก Topbar ตาม CONTRACTS ข้อ 3)

## สัญญาที่ทีมอื่นพึ่งพาได้

- login สำเร็จ: client จะ `window.location.replace(next ?? redirect)` — PARENT -> `/my-child`, อื่น -> `/dashboard`; ถ้า `next` เป็นหน้าที่ role นั้นเข้าไม่ได้ middleware จะเด้งเอง
- logout: form POST ธรรมดา (ไม่ใช้ JS) ใช้ได้เลย — ตอบ 303 See Other

## ปัญหา / ข้อสังเกตถึง integrator

1. **สเปกไฟล์ 01-SYSTEM-ANALYSIS.md / 02-FILE-PLAN.md / 03-BUILD-PROMPT.md ไม่มีอยู่จริง** — path ใน task เป็น "undefined/..." และหาไม่พบทั้ง repo จึงยึด `CONTRACTS.md` + รายละเอียดใน task แทน (เลย์เอาต์หน้า login ทำตามคำบรรยายใน task ไม่ได้เทียบกับภาพต้นฉบับ)
2. เช็คลิสต์ 5 ฟีเจอร์ฝั่งซ้าย เขียนขึ้นเองให้สอดคล้องระบบจริง (ฝาก-ถอน / สมุดบัญชี / ผู้ปกครองดูยอด / รายงาน / แบ่งสิทธิ์) — ถ้า 03-BUILD-PROMPT.md ระบุข้อความตายตัว ให้แก้ค่าคงที่ `FEATURES` ใน `LoginCard.tsx`
3. โลโก้วงกลมใช้ไอคอน `PiggyBank` (lucide) วง ring ทอง — ถ้ามีไฟล์ตราโรงเรียนจริงค่อยสลับเป็น `<Image>`
4. ไม่ได้แตะไฟล์ส่วนกลางใดๆ (lib, ui, middleware, layout) — ใช้ helper ตาม CONTRACTS ทั้งหมด (`verifyPassword`, `createSession`, `destroySession`, `SESSION_COOKIE`, `prisma`, Input/Button/Modal, token `navy/gold/line/withdraw/surface`, `.card-surface`, `.link-navy`)
5. **ยังไม่ได้ typecheck** — `node_modules` ยังไม่ถูกติดตั้งในโปรเจกต์ และกติกาห้ามรัน `npm install` — integrator ควรรัน `npm install && npx prisma generate && npx tsc --noEmit` ตรวจรวมทีเดียว (โค้ด auth นี้ import เฉพาะ `@/lib/*`, `@/components/ui/*`, `lucide-react`, `next/*` ตาม signature ใน CONTRACTS)
