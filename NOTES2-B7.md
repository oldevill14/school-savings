# NOTES2-B7 — media (รูปนักเรียน ฟีเจอร์ 14 + ปุ่ม Export ในหน้านักเรียน)

สถานะ: **เสร็จ** · `npx tsc --noEmit` ผ่านสะอาด · smoke-test route + auth guard บน dev server (พอร์ต 3100) ผ่านทุกเคส · ไม่แตะ container/volume ของ project school-savings (localhost:3000 ยัง 200)

## ไฟล์ที่สร้าง

| ไฟล์ | หน้าที่ |
|---|---|
| `src/components/StudentAvatar.tsx` | avatar วงกลม (shared component ใช้ได้ทั้ง server/client) sizes `sm`/`md`/`lg`; มีรูป→`<img src=/api/files/students/<name>>`, ไม่มีรูป→อักษรตัวแรกบนพื้น navy; รับ `version` เพื่อ bust cache |
| `src/app/api/files/students/[name]/route.ts` | GET เสิร์ฟรูป role-guarded (runtime nodejs) |
| `src/app/api/students/[id]/photo/route.ts` | POST อัปโหลด/เปลี่ยน · DELETE ลบรูป (runtime nodejs) |
| `src/app/(app)/students/[id]/StudentPhotoManager.tsx` | client component จัดการรูปบนหน้าโปรไฟล์ |

## ไฟล์ที่แก้ (อยู่ใน ownership B7 ทั้งหมด)

- `src/app/(app)/students/page.tsx` — เพิ่ม `photoFileName` ลง rows; **เพิ่ม EXECUTIVE (read-only)** เข้าหน้านี้ (ดูหัวข้อ "เรื่องต้องรู้")
- `src/app/(app)/students/StudentsClient.tsx` — `photoFileName` ใน `StudentRow`; แสดง `StudentAvatar` ในคอลัมน์ชื่อ; ปุ่ม **"ดาวน์โหลด Excel รายชื่อ"** (`<a href="/api/export/students">`)
- `src/app/(app)/students/[id]/page.tsx` — เพิ่ม EXECUTIVE (read-only); ฝัง `StudentPhotoManager` ในการ์ดโปรไฟล์; ฝัง `MilestoneBadges` (ของ B3)

## API ใหม่ (เช็ค role ครบฝั่ง server)

- `POST /api/students/[id]/photo` — multipart field **`photo`** → `saveUpload("students", file)` → update `Student.photoFileName` → `logAudit(PHOTO_UPDATE)`. สิทธิ์: ADMIN ทุกคน / TEACHER เฉพาะห้องประจำชั้นของตน. คืน `{ ok, photoFileName }`.
- `DELETE /api/students/[id]/photo` — set `photoFileName = null` (ไฟล์บนดิสก์ **ไม่ถูกลบ** ตามหลัก "ไม่มีอะไรถูกลบ") + `logAudit(PHOTO_UPDATE)`. สิทธิ์เดียวกับ POST.
- `GET /api/files/students/[name]` — เสิร์ฟรูป. ADMIN/TEACHER/EXECUTIVE เห็นทุกคน; **PARENT เห็นเฉพาะรูปบุตร** (lookup `student.photoFileName == name` แล้วเทียบ `session.studentIds`, ไม่ใช่ของบุตร→403). กัน path traversal ผ่าน `readUpload` + ETag ตามชื่อไฟล์.

## เรื่องต้องรู้ (integrator/ทีมอื่น)

1. **EXECUTIVE เข้า /students ได้แล้ว (read-only)** — เดิม `requireRole(["ADMIN","TEACHER"])` ทำให้ EXECUTIVE ถูกเด้งไป /dashboard ทั้งที่ middleware + nav (E.5) + `api/export/students` (B5) ต่างคาดว่า EXECUTIVE เข้าได้. ปรับเป็น `["ADMIN","TEACHER","EXECUTIVE"]` ทั้งหน้า list และ detail. EXECUTIVE: เห็นทุกห้อง, **ไม่มีปุ่มจัดการ/รูป**, มีปุ่ม export. (`canManage = ADMIN`, `seesAll = ADMIN|EXECUTIVE`.) ถ้าทีมที่ดูแล EXECUTIVE ไม่ต้องการให้เข้า /students ให้ย้อนกลับได้ที่ 2 ไฟล์นี้.
2. **B1 (nav-items):** ปุ่มเมนู "นักเรียน" ของ EXECUTIVE ต้องชี้ `/students` (ตาม E.5) — ตอนนี้หน้าพร้อมรับแล้ว.
3. **B3 (MilestoneBadges):** integrate แล้วในหน้า detail — import `@/components/MilestoneBadges` + ส่ง `balance` (Number) และ txns ทั้งหมดของบัญชีปี active. ใช้งานได้จริง.
4. **B5 (export):** ปุ่ม export ชี้ `/api/export/students` (มีอยู่แล้ว, อนุญาต ADMIN/TEACHER/EXECUTIVE) — เป็นแค่ลิงก์ ไม่ได้แก้ไฟล์ B5.
5. **ไฟล์รูปกำพร้า:** เปลี่ยน/ลบรูป = ไฟล์เก่ายังอยู่บนดิสก์ (ไม่เรียก unlink) โดยตั้งใจตามหลักการรักษาประวัติศาสตร์ + `lib/files` ไม่มีฟังก์ชันลบ (ไฟล์กลางของ Architect ไม่แตะ). ถ้าต้องการ cleanup job ในอนาคต ให้ Architect เพิ่มใน `lib/files`.
6. **middleware:** `/api/files/students/<name>` มี "." ในชื่อไฟล์ → ถูกยกเว้นจาก matcher → **ไม่มีด่าน middleware**. handler เช็ค auth เอง (verify แล้ว: ไม่มี session → 401).
7. ไม่ได้แตะไฟล์กลางใดๆ (schema/middleware/auth/lib กลาง/package.json/compose) — ไม่มีสิ่งที่ต้องให้ Architect เพิ่ม.
