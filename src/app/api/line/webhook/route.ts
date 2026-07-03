/**
 * POST /api/line/webhook — รับ event จาก LINE Messaging API
 *
 * - ไม่ตั้ง env `LINE_CHANNEL_SECRET` = ฟีเจอร์ปิด -> ตอบ 404 (เสมือนไม่มี endpoint)
 * - ตรวจลายเซ็น `x-line-signature` = Base64(HMAC-SHA256(channelSecret, rawBody))
 *   ไม่ตรง -> 401 (กัน request ปลอม)
 * - event ข้อความ "ผูกบัญชี <รหัส>" -> ตรวจ LineLinkCode (ยังไม่ใช้/ยังไม่หมดอายุ)
 *   -> บันทึก lineUserId ให้ผู้ใช้เจ้าของรหัส + ตอบยืนยันในแชท
 *
 * หมายเหตุ (integrator): middleware.ts กัน `/api/*` ทุกเส้นที่ไม่มี session (401)
 * ยกเว้นเฉพาะ `/api/auth/*` — LINE ยิง webhook มาโดยไม่มี cookie จึงถูก block
 * ต้องให้ Architect เพิ่ม `api/line/webhook` ใน negative-lookahead ของ matcher
 * (ดู NOTES2-B6.md หัวข้อ "BLOCKER: middleware")
 *
 * runtime = nodejs เพราะใช้ crypto (HMAC) + prisma
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const LINE_TIMEOUT_MS = 4000;

const HELP_TEXT =
  "สวัสดีค่ะ 🙏\n" +
  "ต้องการรับแจ้งเตือนการฝาก-ถอนของบุตรหลาน?\n" +
  'เปิดแอปออมทรัพย์ที่หน้า "ยอดของลูก" กด "รับแจ้งเตือนผ่าน LINE" เพื่อรับรหัส\n' +
  'แล้วพิมพ์กลับมาว่า: ผูกบัญชี <รหัสที่ได้>';

/** โครง event จาก LINE ที่เราสนใจ (text message) */
type LineTextEvent = {
  type?: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type?: string; text?: string };
};
type LineWebhookBody = { events?: LineTextEvent[] };

/** เทียบ string แบบ timing-safe (กัน timing attack ตอน verify signature) */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** ตอบข้อความกลับผ่าน LINE reply API (no-op ถ้าไม่มี access token/replyToken) */
async function reply(
  token: string | undefined,
  replyToken: string | undefined,
  text: string
): Promise<void> {
  if (!token || !replyToken) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINE_TIMEOUT_MS);
  try {
    await fetch(LINE_REPLY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
      signal: controller.signal,
    });
  } catch (e) {
    console.error("LINE reply ล้มเหลว (ข้ามไป):", e);
  } finally {
    clearTimeout(timer);
  }
}

/** จัดการ 1 event — ห้าม throw (กลืน error ต่อ event) */
async function handleEvent(
  ev: LineTextEvent,
  token: string | undefined
): Promise<void> {
  try {
    if (ev.type !== "message" || ev.message?.type !== "text") return;

    const replyToken = ev.replyToken;
    const lineUserId = ev.source?.userId;
    const text = String(ev.message.text ?? "").trim();

    // รูปแบบที่รับ: "ผูกบัญชี <รหัส>"
    const m = text.match(/^ผูกบัญชี\s+(\S+)$/);
    if (!m) {
      await reply(token, replyToken, HELP_TEXT);
      return;
    }

    if (!lineUserId) {
      await reply(
        token,
        replyToken,
        "ไม่สามารถระบุบัญชี LINE ของท่านได้ กรุณาลองใหม่อีกครั้ง"
      );
      return;
    }

    const code = m[1].toUpperCase();
    const link = await prisma.lineLinkCode.findUnique({ where: { code } });

    const expired = link ? link.expiresAt.getTime() < Date.now() : true;
    if (!link || link.usedAt || expired) {
      await reply(
        token,
        replyToken,
        'รหัสไม่ถูกต้องหรือหมดอายุแล้ว ❌\nกรุณาขอรหัสใหม่จากหน้า "ยอดของลูก" ในแอป'
      );
      return;
    }

    // ผูก lineUserId ให้ผู้ใช้เจ้าของรหัส —
    // เคลียร์ของเดิมก่อน เผื่อ LINE บัญชีนี้เคยผูกกับผู้ใช้อื่น (lineUserId เป็น @unique)
    const user = await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { lineUserId },
        data: { lineUserId: null },
      });
      const u = await tx.user.update({
        where: { id: link.userId },
        data: { lineUserId },
        select: { name: true },
      });
      await tx.lineLinkCode.update({
        where: { id: link.id },
        data: { usedAt: new Date() },
      });
      return u;
    });

    await reply(
      token,
      replyToken,
      `ผูกบัญชีสำเร็จ ✅\nคุณ ${user.name} จะได้รับแจ้งเตือนการฝาก-ถอนของบุตรหลานผ่าน LINE นี้`
    );
  } catch (e) {
    console.error("LINE webhook event ล้มเหลว (ข้ามไป):", e);
  }
}

export async function POST(req: Request) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  // ไม่ตั้ง secret = ปิดฟีเจอร์ LINE = เสมือนไม่มี endpoint นี้
  if (!secret) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  if (!safeEqual(signature, expected)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: LineWebhookBody;
  try {
    payload = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    // signature ผ่านแต่ body พัง — ตอบ 200 กัน LINE retry ไม่รู้จบ
    return NextResponse.json({ ok: true });
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  await Promise.all(events.map((ev) => handleEvent(ev, token)));

  // LINE ต้องได้ 200 เมื่อ signature ผ่าน
  return NextResponse.json({ ok: true });
}
