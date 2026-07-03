# NOTES2-B6 — LINE แจ้งเตือน + PWA (ฟีเจอร์ 9, 12)

บันทึกส่งต่อสำหรับ **integrator / Architect** — สิ่งที่ทีม B6 ทำเสร็จ + จุดที่ต้องให้คนอื่นเสียบต่อ

## ไฟล์ที่ B6 สร้าง/แก้ (อยู่ใน ownership ทั้งหมด)

| ไฟล์ | สถานะ |
|---|---|
| `src/lib/notify.ts` | เติมไส้จริง (LINE multicast) — signature เดิมไม่เปลี่ยน |
| `src/app/api/line/webhook/route.ts` | ใหม่ — รับ event LINE + ผูกบัญชี |
| `src/app/api/line/link-code/route.ts` | ใหม่ — ออกโค้ดผูกบัญชี (PARENT) |
| `src/components/LineLinkCard.tsx` | ใหม่ — การ์ด "รับแจ้งเตือนผ่าน LINE" (client) |
| `src/app/manifest.ts` | ใหม่ — PWA manifest แบบ dynamic |
| `src/app/apple-icon.png` | ใหม่ — apple-touch-icon 180×180 (Next convention) |
| `public/icon-192.png`, `public/icon-512.png` | ใหม่ — สร้างจาก `public/logo.png` |

**ไม่ได้เพิ่ม dependency ใด ๆ** (ใช้ `fetch` + node `crypto` ล้วน) — ไม่ต้องแตะ `package.json`

---

## 🛑 BLOCKER (ต้องให้ Architect แก้ `src/middleware.ts` — B6 แก้เองไม่ได้)

**LINE webhook ถูก middleware บล็อกก่อนถึง route** — พิสูจน์แล้วด้วยการยิงจริง:
`POST /api/line/webhook` (ไม่มี session) → **HTTP 401 `{"error":"ยังไม่ได้เข้าสู่ระบบ"}`** (ข้อความนี้มาจาก middleware ไม่ใช่ route)

เหตุ: matcher ปัจจุบันยกเว้นแค่ `api/auth` — ทุก `/api/*` ที่เหลือถ้าไม่มี cookie จะโดน 401
LINE ยิง webhook มาโดยไม่มี cookie จึงเข้าไม่ถึง handler เลย

**แก้:** เพิ่ม `api/line/webhook` เข้า negative-lookahead ของ matcher (บรรทัดสุดท้ายใน `src/middleware.ts`)

```diff
- matcher: ["/((?!login|api/auth|_next|favicon\\.ico|.*\\..*).*)"],
+ matcher: ["/((?!login|api/auth|api/line/webhook|_next|favicon\\.ico|.*\\..*).*)"],
```

⚠️ ยกเว้น **เฉพาะ `api/line/webhook`** — **อย่า** ยกเว้นทั้ง `api/line`
เพราะ `api/line/link-code` ต้องคง session gate ไว้ (PARENT เท่านั้น)

ความปลอดภัยไม่หลุด: route webhook ตรวจ HMAC `x-line-signature` เองอยู่แล้ว + ตอบ 404 เมื่อไม่ตั้ง `LINE_CHANNEL_SECRET` (ฟีเจอร์ปิด) จึงปลอดภัยที่จะปล่อยผ่าน session gate

---

## เสียบ LineLinkCard เข้าหน้า /my-child (ให้ทีม B3 — B6 ห้ามแก้ my-child เอง)

`<LineLinkCard />` เป็น client component **ที่ self-contained ไม่รับ props** — โค้ดผูกเป็นราย "ผู้ใช้"
(ไม่ผูกกับนักเรียนคนใดคนหนึ่ง) จึงวางที่ไหนในมุมมอง PARENT ก็ได้ และใช้ได้แม้มีลูกหลายคน

ในไฟล์ `src/app/(app)/my-child/page.tsx` (ของ B3):

```tsx
import LineLinkCard from "@/components/LineLinkCard";
// ...
// วางในบล็อกที่มีบัญชีแล้ว เช่น หลังปุ่ม "ดูสมุดบัญชี" ก่อน section ประวัติ:
<LineLinkCard />
```

หมายเหตุ: ปุ่มคัดลอกในการ์ดใช้ `navigator.clipboard` — บน HTTP LAN ที่ไม่ปลอดภัยอาจคัดลอกไม่ได้
กรณีนั้นการ์ดยังแสดงข้อความให้ผู้ใช้พิมพ์เองได้ (degrade อย่างนุ่มนวล ไม่ error)

---

## README — section "แจ้งเตือน LINE (ตัวเลือกเสริม)" (ให้ทีม B1 รวมเข้า README)

> คัดลอกบล็อกด้านล่างไปต่อท้าย README (B6 ไม่ได้เป็นเจ้าของ README)

```markdown
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
```

Env ทั้งสองตัวมีใน `.env.example` แล้ว (Architect เพิ่มไว้) — **ไม่ต้องแก้ .env.example เพิ่ม**

---

## พฤติกรรมที่ยึด (ตาม CONTRACTS)

- `notifyGuardiansOfTransaction(studentIds, summary)` — signature เดิมเป๊ะ; no-op เงียบถ้าไม่มี
  `LINE_CHANNEL_ACCESS_TOKEN`; fire-and-forget + timeout 4s; ไม่มีทาง throw (เรียกด้วย `void ...` หลัง commit ได้)
  → ทีม B4 (transactions) เรียกได้เลยตามแผนเดิม ไม่ต้องเปลี่ยนอะไร
- webhook: verify HMAC-SHA256(base64) ด้วย `LINE_CHANNEL_SECRET`; signature ไม่ตรง → 401; ไม่ตั้ง secret → 404;
  ข้อความ `ผูกบัญชี <code>` → เช็ค `LineLinkCode` (ยังไม่ใช้/ยังไม่หมดอายุ) → set `lineUserId` + mark `usedAt` ใน `$transaction` → reply ยืนยัน
- link-code: `requireRoleApi(["PARENT"])`; โค้ด 6 หลัก (ตัด O/0/I/1); อายุ 10 นาที; ออกใหม่ = หมดอายุโค้ดเดิมที่ยังไม่ใช้ของคนนั้น (ไม่ลบแถว — เคารพหลัก "ไม่มีอะไรถูกลบ")
- manifest: dynamic (`force-dynamic`) อ่าน `schoolName` จาก `getSchoolSetting()` มี try/catch fallback default กัน build ล้ม; Next แทรก `<link rel="manifest">` + `<link rel="apple-touch-icon">` ให้อัตโนมัติ (ไม่ต้องแตะ root layout)

---

## ที่ verify แล้วจากเครื่องนี้ (dev server ชั่วคราว port 3100)

- `/manifest.webmanifest` → 200 `application/manifest+json` + ชื่อโรงเรียน dynamic ✅
- `/apple-icon.png` (180²) + `/icon-192.png` → 200 image/png ✅
- head ของหน้า login แทรก `<link rel="manifest">` + `<link rel="apple-touch-icon">` อัตโนมัติ ✅
- `POST /api/line/webhook` → 401 จาก middleware (ยืนยัน BLOCKER ข้างบน) ✅
- `npx tsc --noEmit` — ไฟล์ B6 ทั้งหมดผ่าน (error เดียวในระบบคือ `settings/page.tsx` ของ B1 ที่ยังไม่มี `SettingsForm` — ไม่เกี่ยวกับ B6)

## ยังต้อง smoke-test หลัง rebuild (DB compose ต่อจาก host ไม่ได้ในสภาพนี้)

เส้นทางที่แตะ DB (link-code สร้างโค้ด, webhook ผูกบัญชี) ตรวจด้วย typecheck + code review แล้ว
แต่ยังไม่ได้ยิงจริงเพราะพอร์ต DB ของ compose ไม่ได้ publish ออก host (login ก็ 500 ด้วยเหตุเดียวกัน)
หลัง Architect แก้ middleware + rebuild ให้ลอง:
1. login เป็น PARENT → `POST /api/line/link-code` → คาดว่าได้ `{ ok, code, expiresAt }`
2. (ถ้ามี LINE OA จริง) พิมพ์ `ผูกบัญชี <code>` ในแชท → ได้ reply ยืนยัน + `User.lineUserId` ถูกเซ็ต
