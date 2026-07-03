# syntax=docker/dockerfile:1
# ============================================================================
# ระบบออมทรัพย์โรงเรียนบ้านกะดาด — Dockerfile (multi-stage, node:22-alpine)
#
# stage: deps  -> ติดตั้ง dependencies ทั้งหมด
# stage: build -> prisma generate + next build (output: "standalone")
# stage: runner-> image เล็ก รันด้วย user ไม่ใช่ root
#                 CMD: prisma migrate deploy แล้วค่อย start server
#
# เหตุผลการออกแบบ + ข้อควรระวัง: ดู NOTES-docker.md
# ============================================================================

# ---------- base: alpine + lib ที่ Prisma/Next ต้องใช้ ----------
FROM node:22-alpine AS base
# libc6-compat: แนะนำโดย Next.js สำหรับ alpine · openssl: Prisma engines ต้องใช้
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ---------- stage 1: deps ----------
FROM base AS deps
COPY package.json package-lock.json* ./
# ยังไม่มี package-lock.json ใน repo -> fallback เป็น npm install
# (เมื่อ commit lockfile แล้ว จะใช้ npm ci อัตโนมัติ = build ที่ reproducible กว่า)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---------- stage 2: build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# dummy env สำหรับตอน build เท่านั้น — ไม่ถูก bake ลง runner
# (ทุก page ที่แตะ DB เป็น force-dynamic จึงไม่ query DB ตอน build
#  แต่ PrismaClient/lib อาจถูก import ระหว่าง collect page data จึงกันไว้)
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV SESSION_SECRET="build-time-only-dummy-secret-not-used-at-runtime-00000000"

# สร้าง Prisma Client ก่อน build (บน alpine เอง -> engine ตรง platform linux-musl)
RUN npx prisma generate
# โปรเจกต์ยังไม่มีโฟลเดอร์ public/ — สร้างเปล่าไว้ให้ COPY ใน stage runner ไม่พัง
# (ถ้าภายหลังมี public/ จริง จะถูก COPY . . ด้านบนมาแล้ว และ mkdir -p ไม่ทับของเดิม)
RUN mkdir -p public
RUN npm run build

# ---------- stage 3: runner ----------
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000
# standalone server ต้อง bind 0.0.0.0 ไม่งั้นเข้าจากนอก container ไม่ได้
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
# ให้ "วันนี้" ของสถิติแดชบอร์ดตรงเวลาไทย (ตามที่ทีม dashboard ขอไว้)
ENV TZ=Asia/Bangkok
RUN apk add --no-cache tzdata

# โฟลเดอร์เก็บไฟล์อัปโหลด (โลโก้โรงเรียน, รูปนักเรียน) — compose mount volume ทับที่ /app/uploads
# ตั้ง default env ไว้เผื่อรันโดยไม่ผ่าน compose ด้วย
ENV UPLOADS_DIR=/app/uploads

# prisma CLI (migrate deploy ตอน start) + tsx (รัน prisma/seed.ts ใน container)
# + bcryptjs (seed.ts ใช้ hash รหัสผ่าน — standalone trace ของ Next ไม่ได้วางไว้ให้
#   require จาก /app/prisma/ จึงต้องลง global แล้วชี้ NODE_PATH ด้านล่าง)
# ติดตั้งแบบ global ให้ npm resolve dependency tree ครบเอง — เสถียรกว่าการ
# COPY node_modules/prisma + node_modules/@prisma ข้าม stage (ดูเหตุผลใน NOTES-docker.md)
# pin เวอร์ชันตรงกับ package-lock.json (prisma/@prisma/client 6.19.3, tsx 4.22.4,
# bcryptjs 2.4.3) เพื่อให้ image reproducible และ prisma CLI ไม่ดริฟท์จาก
# @prisma/client ที่ bundle มากับ standalone build —
# **ทุกครั้งที่ bump lockfile ต้องอัปเดตบรรทัดนี้ให้ตรงกัน**
RUN npm install -g "prisma@6.19.3" "tsx@4.22.4" "bcryptjs@2.4.3"
# ให้ seed.ts (รันด้วย tsx ใน /app/prisma) resolve โมดูล global ข้างบนได้เป็น fallback
# — ไม่กระทบแอป เพราะ Node หา node_modules ข้างไฟล์ก่อนเสมอ NODE_PATH ใช้เมื่อหาไม่เจอเท่านั้น
ENV NODE_PATH=/usr/local/lib/node_modules

# user ไม่ใช่ root
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

# artefact จาก next build (output: "standalone")
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
# schema + migrations + seed สำหรับ prisma migrate deploy / seed
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma

# สร้างโฟลเดอร์ uploads ให้ user nextjs เขียนได้ (named volume จะ inherit สิทธิ์นี้ตอน mount ครั้งแรก)
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3000

# migrate ให้ DB ทันสมัยก่อน แล้วค่อย start (ต้องมี prisma/migrations ใน repo —
# ครั้งแรกให้รัน `npx prisma migrate dev --name init` บนเครื่อง dev ก่อน build)
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
