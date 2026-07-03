"use client";

/**
 * LineLinkCard — การ์ด "รับแจ้งเตือนผ่าน LINE" สำหรับหน้า /my-child (ผู้ปกครอง)
 *
 * กด "ขอรหัส" -> POST /api/line/link-code -> แสดงรหัส 6 หลัก + วิธีพิมพ์ในแชท LINE
 * รหัสหมดอายุใน 10 นาที (นับถอยหลังในการ์ด) — หมดแล้วขอใหม่ได้
 *
 * Client component ล้วน — เรียก API ผ่าน fetch, ไม่แตะ prisma/env
 * (integrator: เสียบ <LineLinkCard /> ในหน้า /my-child — ดู NOTES2-B6.md)
 */
import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Copy, Check, RefreshCw } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

type LinkCodeResult = { code: string; expiresAt: number };

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export default function LineLinkCard() {
  const [result, setResult] = useState<LinkCodeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [copied, setCopied] = useState(false);

  const requestCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/line/link-code", { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { code?: string; expiresAt?: string; error?: string }
        | null;
      if (!res.ok || !data?.code || !data?.expiresAt) {
        setError(data?.error ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        return;
      }
      setResult({ code: data.code, expiresAt: new Date(data.expiresAt).getTime() });
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, []);

  // นับถอยหลังจนหมดอายุ
  useEffect(() => {
    if (!result) return;
    const tick = () => setRemaining(result.expiresAt - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [result]);

  const expired = result !== null && remaining <= 0;

  const chatMessage = result ? `ผูกบัญชี ${result.code}` : "";

  const copyMessage = useCallback(async () => {
    if (!chatMessage) return;
    try {
      await navigator.clipboard.writeText(chatMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // คลิปบอร์ดใช้ไม่ได้ (เช่น http ไม่ปลอดภัย) — ผู้ใช้พิมพ์เองได้จากที่แสดง
    }
  }, [chatMessage]);

  return (
    <Card
      title="รับแจ้งเตือนผ่าน LINE"
      description="เชื่อมบัญชี LINE เพื่อรับแจ้งเตือนทุกครั้งที่มีการฝาก-ถอนของบุตรหลาน"
    >
      {!result || expired ? (
        <div className="space-y-3">
          {expired && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              รหัสหมดอายุแล้ว กรุณาขอรหัสใหม่
            </p>
          )}
          <p className="text-sm text-slate-600">
            กด &quot;ขอรหัสผูกบัญชี&quot; แล้วนำรหัสไปพิมพ์ในแชท LINE
            ของบัญชีทางการโรงเรียน เพื่อเปิดรับการแจ้งเตือน
          </p>
          {error && <p className="text-sm text-withdraw">{error}</p>}
          <Button variant="success" onClick={requestCode} disabled={loading}>
            <MessageCircle className="h-4 w-4" />
            {loading ? "กำลังสร้างรหัส…" : "ขอรหัสผูกบัญชี"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* รหัส */}
          <div className="rounded-card border border-line bg-surface px-4 py-3 text-center">
            <p className="text-xs text-slate-500">รหัสผูกบัญชีของท่าน</p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-navy">
              {result.code}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              หมดอายุใน{" "}
              <span className="font-medium text-navy">
                {formatCountdown(remaining)}
              </span>{" "}
              นาที
            </p>
          </div>

          {/* วิธีใช้ */}
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
            <li>เพิ่มเพื่อนบัญชี LINE ทางการของโรงเรียน</li>
            <li>
              พิมพ์ข้อความต่อไปนี้ในแชทแล้วส่ง:
              <div className="mt-1.5 flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm text-navy">
                  {chatMessage}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={copyMessage}
                  aria-label="คัดลอกข้อความ"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-deposit" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied ? "คัดลอกแล้ว" : "คัดลอก"}
                </Button>
              </div>
            </li>
            <li>ระบบจะตอบยืนยันในแชทเมื่อผูกบัญชีสำเร็จ</li>
          </ol>

          <Button
            variant="ghost"
            size="sm"
            onClick={requestCode}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            ขอรหัสใหม่
          </Button>
        </div>
      )}
    </Card>
  );
}
