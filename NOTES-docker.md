# NOTES — ทีม Docker + เอกสารรัน

วันที่: 2 ก.ค. 2569

## ไฟล์ที่สร้าง (ownership ของทีมนี้)

- `Dockerfile` — multi-stage node:22-alpine (deps → build → runner, non-root, standalone)
- `docker-compose.yml` — app (3000:3000, depends_on db healthy) + db (postgres:17-alpine, volume `pgdata`, healthcheck `pg_isready`, ไม่ expose port ออก host)
- `.dockerignore`
- `README.md` — วิธีรัน dev/docker, credentials จาก seed จริง, backup/restore, โครงสร้างระบบ
- `NOTES-docker.md` (ไฟล์นี้)

## การตัดสินใจสำคัญ: prisma CLI ใน runner

โจทย์: CMD ต้องรัน `npx prisma migrate deploy` ได้ แต่ runner มีแค่ standalone output
(node_modules แบบ trace แล้ว — ไม่มี prisma CLI เพราะเป็น devDependency)

ทางเลือกที่พิจารณา:

1. **COPY `node_modules/prisma` + `node_modules/@prisma` + `.bin` จาก stage deps** —
   pattern ที่เจอบ่อยในเน็ต ใช้ได้กับ Prisma 6 วันนี้ (dependency ของ CLI เป็น @prisma/* scope ทั้งหมด)
   แต่ *เปราะ*: ถ้า prisma รุ่นถัดไปเพิ่ม dependency นอก scope เมื่อไร migrate จะพังแบบเงียบตอน start
   และ @prisma ที่ copy จาก deps ยังไม่มี generated client (generate รันใน stage build) ทำให้ seed ผ่านทางนี้ไม่ได้
2. **COPY node_modules ทั้งก้อน** — ชัวร์แต่ image บวมหลายร้อย MB ขัดจุดประสงค์ standalone
3. **`npm install -g "prisma@6.19.3" "tsx@4.22.4"` ใน stage runner** ← **เลือกอันนี้**
   - npm resolve dependency tree ให้ครบเองทุกครั้ง → ไม่ผูกกับ layout ภายในของ prisma
   - **pin เวอร์ชันตรงกับ `package-lock.json`** (prisma/@prisma/client 6.19.3, tsx 4.22.4)
     → image reproducible และ CLI ไม่ดริฟท์จาก client ที่ npm ci ใน stage deps ติดตั้ง
     (เดิมใช้ semver range ลอย — ใช้ได้ตอนยังไม่มี lockfile แต่พอ deps ใช้ `npm ci` แบบ pin แล้ว
     global install ที่ลอยจะได้ 6.x ล่าสุด ณ เวลา build ซึ่งอาจคนละรุ่นกับ client)
   - **ข้อแลก: ทุกครั้งที่ bump prisma/tsx ใน lockfile ต้องแก้บรรทัดนี้ใน Dockerfile ให้ตรงกันด้วย**
   - engines ถูกดาวน์โหลดบน alpine (linux-musl) ตอน build image → platform ตรง, runtime ไม่ต้องมี network
   - แถม `tsx` ทำให้รัน seed ในคอนเทนเนอร์ได้ (ดูหัวข้อ seed)
   - ต้นทุน: ต้องมี network ตอน `docker build` (ปกติมีอยู่แล้ว) + image โตขึ้น ~60-80MB
     ซึ่งยังไงก็ต้องจ่ายเพราะ schema-engine จำเป็นต่อ migrate ทุกทางเลือก

`npx` ใน CMD หา global package เจอ (npx เช็ค local `.bin` → PATH → global installs) จึงไม่ยิง network ตอน start

## seed ในคอนเทนเนอร์

- `prisma db seed` อ่าน `package.json -> prisma.seed = "tsx prisma/seed.ts"` แต่ package.json
  ใน standalone ไม่การันตีว่าคง key `prisma` ไว้ → README ใช้คำสั่งตรง:
  `docker compose exec app tsx prisma/seed.ts`
- ใช้งานได้เพราะ: `tsx` เป็น global, ส่วน `@prisma/client` (พร้อม generated client ใน `.prisma/`)
  และ `bcryptjs` ถูก trace เข้า standalone node_modules อยู่แล้ว (แอป import ทั้งคู่) —
  seed.ts resolve จาก `/app/node_modules` ได้ตามปกติ
- seed.ts ใช้ TS syntax แบบ erasable ล้วน จึงรันผ่าน tsx ได้แน่นอน (และผ่าน
  `node --experimental-strip-types` ได้ด้วยถ้าจำเป็น)

## ⚠️ เรื่องที่ integrator ต้องจัดการก่อน deploy จริง

1. **`prisma/migrations/` ยังไม่มีในโปรเจกต์** — `prisma migrate deploy` ใน CMD จะ no-op
   (ไม่สร้างตาราง!) ถ้าไม่มี migration → ต้องรัน `npx prisma migrate dev --name init`
   บนเครื่อง dev หนึ่งครั้งแล้ว commit โฟลเดอร์ migrations ก่อน build image
   (เขียนเตือนใน README แล้ว) — จงใจไม่ fallback เป็น `prisma db push` เพื่อคง
   วินัย migration history ตามหลัก "ไม่มีอะไรถูกลบ"
2. **ยังไม่มี `package-lock.json`** (ยังไม่เคย `npm install` และกติกาห้ามทีมนี้รัน) —
   stage deps จึง fallback เป็น `npm install`; หลัง integrator รัน `npm install` ครั้งแรก
   ให้ commit lockfile → Dockerfile จะสลับเป็น `npm ci` อัตโนมัติ (reproducible build)
3. **ยังไม่ได้ทดสอบ `docker compose build` จริง** — กติกาห้ามรัน install/build
   → integrator ควร verify: `docker compose build && docker compose up -d` แล้วไล่ตาม README
4. **สเปก 01-SYSTEM-ANALYSIS.md / 02-FILE-PLAN.md / 03-BUILD-PROMPT.md ไม่มีอยู่จริงใน repo**
   (path ใน task เป็น "undefined/...", ทีม auth เจอเหมือนกัน) — ยึดข้อความใน task +
   `CONTRACTS.md` + ไฟล์จริงในโปรเจกต์แทน

## รายละเอียดเชิงเทคนิคอื่นที่ตั้งใจทำ

- **`public/` ไม่มีในโปรเจกต์** → stage build ทำ `mkdir -p public` กัน COPY ใน runner พัง;
  ถ้าทีมไหนเพิ่ม `public/` จริงภายหลัง จะถูก `COPY . .` เก็บมาเองโดยไม่ต้องแก้ Dockerfile
- **dummy `DATABASE_URL`/`SESSION_SECRET` ใน stage build** — ทุก page ที่แตะ DB เป็น
  force-dynamic จึงไม่ query ตอน build แต่ `new PrismaClient()` ใน `lib/db.ts` ถูก
  instantiate ระหว่าง collect page data → กัน edge case build fail; ค่า dummy อยู่เฉพาะ
  stage build ไม่ติดไป runner (คนละ stage)
- **`prisma generate` รันบน alpine เอง** → engine target "native" = linux-musl ถูกต้อง
  ไม่ต้องแก้ `binaryTargets` ใน schema.prisma (ซึ่งทีมนี้ไม่มีสิทธิ์แก้อยู่แล้ว)
- **`HOSTNAME=0.0.0.0`** — standalone `server.js` ไม่ตั้งจะ bind localhost → เข้าจากนอก container ไม่ได้
- **`TZ=Asia/Bangkok` + `tzdata`** ทั้ง app และ db — ตามที่ NOTES-dashboard.md ข้อ 6 ขอ
  (สถิติ "วันนี้" ใช้ midnight ตามเวลา server)
- **`apk add libc6-compat openssl`** — libc6-compat แนะนำโดย Next สำหรับ alpine,
  openssl จำเป็นต่อ Prisma engines บน alpine
- **compose ใช้ `${VAR:?error}`** ทั้ง `SESSION_SECRET` และ `DB_PASSWORD` → fail fast
  พร้อมข้อความไทยถ้าลืมตั้ง .env แทนที่จะแอบใช้ default ที่รู้กันทั่ว
- **`DATABASE_URL` ใน `.env` ไม่ถูกส่งเข้า container** — compose ตั้ง environment ของ app
  เองให้ชี้ `db:5432` (ค่าใน .env มีไว้ให้ dev บนเครื่องที่ DB อยู่ localhost)
- **db ไม่ expose port ออก host ตามสเปก** → dev บนเครื่องใช้ postgres แยกผ่าน
  `docker run -p 5432:5432` (คำสั่งอยู่ใน README) และ backup ใช้ `docker compose exec -T db pg_dump`
  (`-T` จำเป็นเวลา pipe/redirect — บทเรียนจากงาน TCMT)
- `.dockerignore` ตัด `*.md`, `.env*`, `node_modules`, `.next`, `.git`, ไฟล์ docker เอง —
  ไม่มี .md ไหนจำเป็นต่อ build จึงไม่ต้องมีข้อยกเว้น
- non-root user `nextjs` (uid 1001) + `--chown` ทุก COPY — ตามแนวทาง official Next.js Dockerfile
