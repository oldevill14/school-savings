# ระบบออมทรัพย์โรงเรียน — โรงเรียนบ้านกะดาด

ระบบบันทึกเงินออมทรัพย์นักเรียน โรงเรียนบ้านกะดาด สพป.สุรินทร์ เขต 3 ปีการศึกษา 2569
ครูบันทึกฝาก-ถอนรายวัน ผู้ปกครองเปิดดูยอดของลูกได้เอง และผู้ดูแลระบบดูรายงานภาพรวมทั้งโรงเรียน

## Stack

- **Next.js 15** (App Router, `src/`, `output: "standalone"`) + TypeScript
- **Tailwind CSS 3.4** · ฟอนต์ Sarabun · ไอคอน lucide-react · กราฟ recharts
- **Prisma + PostgreSQL** (เงินเก็บเป็น `Decimal(12,2)`)
- Auth: bcryptjs + jose (JWT ใน httpOnly cookie, อายุ 12 ชม.)
- Docker multi-stage (`node:22-alpine`) + docker compose (app + postgres:17-alpine)

## โครงสร้างระบบย่อ

3 บทบาท (ทุก API/Server Action ตรวจ role ฝั่ง server เสมอ):

| Role | เข้าได้ | ทำอะไร |
|---|---|---|
| `ADMIN` | ทุกหน้า | จัดการผู้ใช้/ห้องเรียน/ปีการศึกษา, บันทึกฝาก-ถอน, รายงาน |
| `TEACHER` | dashboard, ธุรกรรม, นักเรียน, รายงาน | บันทึกฝาก-ถอนของนักเรียน |
| `PARENT` | `/my-child`, `/passbook` ของลูกตัวเอง | ดูยอดและประวัติของลูก |

ข้อมูลหลัก: `AcademicYear` (ปี พ.ศ., active ทีละปี) → `Classroom` → `Student` →
`Account` (1 บัญชี/คน/ปี) → `Transaction` (ฝาก/ถอน)

หลักการบัญชีที่ระบบรักษาเสมอ:

- **ธุรกรรมห้ามลบ (immutable)** — ยกเลิกรายการด้วยการตั้ง `status = VOIDED` เท่านั้น
  (บันทึกผู้ยกเลิก + เวลา) ประวัติจึงตรวจสอบย้อนหลังได้ตลอด
- `Account.balance = openingBalance + SUM(ฝาก NORMAL) - SUM(ถอน NORMAL)`
  เขียนธุรกรรม + อัปเดตยอดใน `prisma.$transaction()` เสมอ และยอดห้ามติดลบ

## บัญชีทดสอบ (จาก `prisma/seed.ts`)

| Username | Password | Role | หมายเหตุ |
|---|---|---|---|
| `admin` | `admin1234` | ADMIN | "ครูการเงิน" |
| `teacher1` | `teacher1234` | TEACHER | ครูสุดารัตน์ ใจงาม — ประจำชั้น ป.1/1 |
| `parent1` | `parent1234` | PARENT | นางไพลิน สายบุตร — ผูกกับนักเรียน 69001 (ด.ช.กิตติศักดิ์ สายบุตร) |

seed สร้างเพิ่ม: ปีการศึกษา 2569 (active), ห้อง ป.1/1–ป.6/1, นักเรียนตัวอย่าง 20 คน
(รหัส 69001–69020) พร้อมธุรกรรมย้อนหลัง 18 พ.ค. – 1 ก.ค. 2569

> คำเตือน: seed **ล้างข้อมูลเดิมทั้งหมด**ก่อนใส่ข้อมูลตัวอย่าง — ห้ามรันกับฐานข้อมูลที่ใช้งานจริงแล้ว

## เปลี่ยนชื่อโรงเรียน / โลโก้

ชื่อโรงเรียน สังกัด/เขตพื้นที่ และโลโก้ ถูกเก็บใน**ฐานข้อมูล** (ตาราง `SchoolSetting`) และแสดงทั่วทั้งระบบ
(หน้า login, หัว Sidebar, แถบบน, ชื่อแท็บเบราว์เซอร์) — ไม่ต้อง hardcode หรือ build ใหม่

### วิธีหลัก (แนะนำ): หน้า "ตั้งค่าโรงเรียน"

1. เข้าสู่ระบบด้วยบัญชี **ADMIN** (ผู้ดูแลระบบ)
2. เปิดเมนู **ตั้งค่าโรงเรียน** (`/settings`)
3. แก้ **ชื่อโรงเรียน** / **สังกัด/เขตพื้นที่** แล้วกด "บันทึกข้อมูล"
4. เปลี่ยนโลโก้: เลือกไฟล์ **PNG หรือ JPG ขนาดไม่เกิน 2 MB** (แนะนำจัตุรัส **512 × 512 px** พื้นหลังโปร่งใส) แล้วกด "อัปโหลดโลโก้"

โลโก้ที่อัปโหลดถูกเก็บใน `UPLOADS_DIR/logo/` (compose ผูก named volume `uploads` ไว้ ข้อมูลไม่หายตอน redeploy)
และเสิร์ฟผ่าน route สาธารณะ `GET /api/branding/logo.png` — เปลี่ยนแล้วเห็นผลทันทีเมื่อโหลดหน้าใหม่ ไม่ต้อง build image ใหม่

### วิธีสำรอง: แทนไฟล์ `public/logo.png`

ถ้ายังไม่เคยอัปโหลดโลโก้ผ่านหน้า /settings ระบบจะใช้ไฟล์เริ่มต้น `public/logo.png` เป็น fallback

- นำไฟล์ตราโรงเรียน (นามสกุล `.png`) มาวางทับ `public/logo.png` (ใช้ชื่อไฟล์เดิม)
- รันแบบ dev → refresh browser ได้เลย
- รันแบบ Docker → `docker compose up -d --build app` (ต้อง build ใหม่ เพราะไฟล์ถูก copy เข้า image)

หมายเหตุ:

- โลโก้ถูกครอบในกรอบวงกลม/มุมโค้ง — โลโก้ทรงจัตุรัสพื้นหลังโปร่งใสจะออกมาสวยสุด
  (ระบบใช้ `object-contain` จึงไม่ถูกตัดขอบแม้สัดส่วนไม่จัตุรัส)
- โลโก้ที่อัปโหลดผ่าน /settings จะ**ทับ**ไฟล์ `public/logo.png` เสมอ (มีโลโก้อัปโหลด = ใช้ตัวนั้นก่อน)

---

## วิธีรันแบบ Development

ต้องมี Node.js 22+ และ PostgreSQL (สะดวกสุดคือรัน dev DB ชั่วคราวด้วย docker):

```bash
# 1) dev database (แยกจาก compose ของ production — ตัวนี้เปิด port 5432 ให้เครื่องเรา)
docker run -d --name school-savings-devdb \
  -e POSTGRES_USER=savings -e POSTGRES_PASSWORD=savings_dev_pw \
  -e POSTGRES_DB=school_savings -p 5432:5432 postgres:17-alpine

# 2) env (ค่า dev ในไฟล์ตัวอย่างชี้ localhost:5432 ตรงกับข้อ 1 อยู่แล้ว)
cp .env.example .env

# 3) ติดตั้ง + เตรียม DB
npm install
npx prisma generate
npx prisma migrate dev --name init   # สร้างตาราง (ครั้งแรกจะสร้าง prisma/migrations/ ด้วย)
npx prisma db seed                   # ข้อมูลตัวอย่าง + บัญชีทดสอบ

# 4) รัน
npm run dev                          # -> http://localhost:3000
```

## วิธีรันแบบ Docker (production)

> สำคัญ: image รัน `prisma migrate deploy` ตอน start ซึ่งใช้โฟลเดอร์ `prisma/migrations/`
> ถ้ายังไม่มี (ยังไม่เคยรัน `npx prisma migrate dev` เลย) ให้ทำขั้นตอน dev ข้อ 1–3 ก่อนหนึ่งครั้ง
> เพื่อให้เกิดไฟล์ migration ในโปรเจกต์

```bash
# 1) env — production ต้องเปลี่ยนทั้งสองค่า ห้ามใช้ค่า dev
cp .env.example .env
#    - SESSION_SECRET: สุ่มใหม่ เช่น  openssl rand -hex 32
#    - DB_PASSWORD:    รหัสผ่าน DB จริง

# 2) build + start (app + db)
docker compose up -d --build

# 3) ดู log จนเห็นว่า migrate + start สำเร็จ
docker compose logs -f app

# 4) seed ข้อมูลตัวอย่าง (ครั้งแรกเท่านั้น — seed ล้างข้อมูลเดิมทั้งหมด)
docker compose exec app tsx prisma/seed.ts

# -> เปิด http://localhost:3000 แล้ว login ด้วยบัญชีทดสอบด้านบน
```

คำสั่งที่ใช้บ่อย:

```bash
docker compose ps                 # สถานะ
docker compose logs -f app        # log แอป
docker compose restart app        # restart เฉพาะแอป
docker compose down               # หยุดทั้งหมด (ข้อมูล DB อยู่ใน volume "pgdata" ไม่หาย)
docker compose down -v            # หยุด + ลบข้อมูล DB ถาวร (อันตราย — คิดก่อนใช้)
```

หมายเหตุ: ตัว database **ไม่เปิด port ออก host** (ตั้งใจ เพื่อความปลอดภัย) —
จะเข้า psql ให้ใช้ `docker compose exec db psql -U savings -d school_savings`

## Backup / Restore ฐานข้อมูล

```bash
# backup เป็นไฟล์ SQL (รันได้ระหว่างระบบทำงานปกติ)
docker compose exec -T db pg_dump -U savings -d school_savings \
  > backup_school_savings_$(date +%Y%m%d_%H%M).sql

# หรือ custom format (ไฟล์เล็กกว่า, restore เลือกบางส่วนได้ด้วย pg_restore)
docker compose exec -T db pg_dump -U savings -d school_savings -Fc \
  > backup_school_savings_$(date +%Y%m%d_%H%M).dump
```

ตั้ง backup อัตโนมัติทุกวัน (ตัวอย่าง crontab บนเครื่อง host, ตี 1):

```cron
0 1 * * * cd /path/to/school-savings && docker compose exec -T db pg_dump -U savings -d school_savings > backups/backup_$(date +\%Y\%m\%d).sql
```

Restore (หยุดแอปก่อนกันเขียนชนกัน แล้วเทลง DB เปล่า):

```bash
docker compose stop app
docker compose exec -T db psql -U savings -c "DROP DATABASE school_savings;"
docker compose exec -T db psql -U savings -c "CREATE DATABASE school_savings;"
docker compose exec -T db psql -U savings -d school_savings < backup_school_savings_XXXX.sql
docker compose start app
```

> ธุรกรรมในระบบเป็น immutable อยู่แล้ว แต่ backup ยังจำเป็น — แนะนำเก็บไฟล์ backup
> ไว้นอกเครื่อง server อย่างน้อย 1 ชุดเสมอ (หลักการ "ไม่มีอะไรถูกลบ")

## โครงสร้างโปรเจกต์

```
├── prisma/
│   ├── schema.prisma        # โมเดล: User, AcademicYear, Classroom, Student, Account, Transaction
│   ├── migrations/          # เกิดจาก `prisma migrate dev` (ต้อง commit — ใช้ตอน deploy)
│   └── seed.ts              # ข้อมูลตัวอย่าง + บัญชีทดสอบ
├── src/
│   ├── middleware.ts        # ด่านแรก: บังคับ login + แบ่งโซนตาม role
│   ├── app/
│   │   ├── login/           # หน้าเข้าสู่ระบบ (public)
│   │   ├── (app)/           # หน้าในระบบ (มี Sidebar/Topbar): dashboard, transactions,
│   │   │                    #   students, reports, classrooms, academic-years, users,
│   │   │                    #   my-child, passbook
│   │   └── api/             # route handlers (auth, transactions, stats, ...)
│   ├── components/          # ui/ (Button, Card, Table, ...), layout/, charts/
│   └── lib/                 # auth (session/role guard), db (prisma), money, thai-date
├── public/
│   └── logo.png             # โลโก้ระบบ 512×512 — แทนที่ด้วยตราโรงเรียนของท่าน (ดูหัวข้อ "เปลี่ยนโลโก้ระบบ")
├── Dockerfile               # multi-stage: deps -> build -> runner (standalone)
├── docker-compose.yml       # app + postgres:17 (db ไม่ expose ออก host)
└── .env.example             # ตัวอย่าง environment variables
```

## Environment variables

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `DATABASE_URL` | connection string ของ Prisma (ใน compose ระบบตั้งให้ชี้ service `db` เอง) |
| `SESSION_SECRET` | เซ็น JWT session cookie — production ต้องสุ่มใหม่ ยาว ≥ 32 ตัวอักษร |
| `DB_PASSWORD` | รหัสผ่าน PostgreSQL (compose ใช้ตั้งทั้งฝั่ง db และประกอบ `DATABASE_URL` ของ app) |
| `COOKIE_SECURE` | ติด `Secure` attribute ให้ session cookie (`true`/`false`, default `false`) — ปล่อย `false` เมื่อเข้าผ่าน `http://<ip>:3000` ใน LAN (ถ้าตั้ง `true` บน HTTP browser จะทิ้ง cookie ทำให้ login วนไม่ติด); ตั้ง `true` เฉพาะเมื่อมี HTTPS reverse proxy ข้างหน้าและผู้ใช้เข้าผ่าน `https` เท่านั้น |
| `UPLOADS_DIR` | โฟลเดอร์เก็บไฟล์อัปโหลด (โลโก้โรงเรียน + รูปนักเรียน) — dev: `./uploads` · compose: `/app/uploads` (named volume) |
| `LINE_CHANNEL_ACCESS_TOKEN` | Channel access token ของ LINE OA — ว่าง = ปิดฟีเจอร์แจ้งเตือน LINE (ดูหัวข้อ "แจ้งเตือน LINE") |
| `LINE_CHANNEL_SECRET` | Channel secret ของ LINE OA — ว่าง = `/api/line/webhook` ตอบ 404 (ฟีเจอร์ปิดสนิท) |

## แจ้งเตือน LINE (ตัวเลือกเสริม)

ระบบส่งแจ้งเตือนการฝาก-ถอนให้ผู้ปกครองผ่าน LINE ได้ — ปิดโดยปริยาย
เปิดใช้เมื่อตั้งค่า env ครบและเซิร์ฟเวอร์มี **HTTPS URL สาธารณะ** เท่านั้น
(LINE เรียก webhook ผ่าน HTTPS เท่านั้น — LAN/HTTP ภายในใช้ไม่ได้)

### ขั้นตอน
1. สร้าง **LINE Official Account** + เปิด **Messaging API** ที่ LINE Developers Console
2. คัดลอกค่ามาใส่ env ของเซิร์ฟเวอร์:
   - `LINE_CHANNEL_ACCESS_TOKEN` = Channel access token (long-lived)
   - `LINE_CHANNEL_SECRET` = Channel secret
3. ตั้ง **Webhook URL** = `https://<โดเมนของคุณ>/api/line/webhook` แล้วกด Verify + เปิด "Use webhook"
4. ปิด auto-reply/greeting ใน LINE OA (จะได้ไม่ตอบชนกับระบบ)

### วิธีที่ผู้ปกครองใช้
1. เพิ่มเพื่อน LINE OA ของโรงเรียน
2. เข้าแอปหน้า "ยอดของลูก" กด "รับแจ้งเตือนผ่าน LINE" เพื่อรับรหัส (อายุ 10 นาที)
3. พิมพ์ในแชท: `ผูกบัญชี <รหัส>` — ระบบตอบยืนยันเมื่อผูกสำเร็จ

> ไม่ตั้ง env ทั้งสองตัว = ฟีเจอร์ปิดสนิท: `notify` เป็น no-op และ `/api/line/webhook` ตอบ 404
