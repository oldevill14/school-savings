"use client";

/**
 * ตัวจัดการรูปนักเรียนบนหน้าโปรไฟล์ (/students/[id]) — client component
 *
 * แสดง StudentAvatar (ขนาดใหญ่) + ปุ่มอัปโหลด/เปลี่ยน/ลบ (เฉพาะผู้มีสิทธิ์จัดการ)
 * - อัปโหลด/เปลี่ยน: POST multipart -> /api/students/[id]/photo
 * - ลบ:            DELETE          -> /api/students/[id]/photo
 *
 * ตรวจชนิด/ขนาดฝั่ง client เบื้องต้น (server validate ซ้ำผ่าน saveUpload เสมอ)
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import StudentAvatar from "@/components/StudentAvatar";

const MAX_BYTES = 2 * 1024 * 1024;

interface StudentPhotoManagerProps {
  studentId: string;
  studentName: string;
  initialPhotoFileName: string | null;
  /** ผู้ใช้ปัจจุบันจัดการรูปได้หรือไม่ (ADMIN / ครูประจำชั้นของนักเรียนคนนี้) */
  canManage: boolean;
}

export default function StudentPhotoManager({
  studentId,
  studentName,
  initialPhotoFileName,
  canManage,
}: StudentPhotoManagerProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoFileName, setPhotoFileName] = useState<string | null>(initialPhotoFileName);
  const [version, setVersion] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  function resetInput() {
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onPick(file: File | undefined) {
    setError("");
    setMsg("");
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setError("รองรับเฉพาะไฟล์รูปภาพ PNG หรือ JPG เท่านั้น");
      resetInput();
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("ไฟล์ต้องมีขนาดไม่เกิน 2 MB");
      resetInput();
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch(`/api/students/${studentId}/photo`, {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as { photoFileName?: string; error?: string };
      if (!res.ok) {
        setError(json.error ?? "อัปโหลดรูปไม่สำเร็จ");
        return;
      }
      setPhotoFileName(json.photoFileName ?? null);
      setVersion(Date.now());
      setMsg("บันทึกรูปนักเรียนเรียบร้อยแล้ว");
      router.refresh();
    } catch {
      setError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
      resetInput();
    }
  }

  async function onDelete() {
    setError("");
    setMsg("");
    setBusy(true);
    try {
      const res = await fetch(`/api/students/${studentId}/photo`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "ลบรูปไม่สำเร็จ");
        return;
      }
      setPhotoFileName(null);
      setVersion(Date.now());
      setMsg("ลบรูปนักเรียนแล้ว");
      router.refresh();
    } catch {
      setError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <StudentAvatar
        photoFileName={photoFileName}
        name={studentName}
        size="lg"
        version={version}
      />

      {canManage && (
        <div className="w-full space-y-2">
          {/* input ซ่อนไว้ ขับผ่านปุ่ม */}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => void onPick(e.target.files?.[0])}
            disabled={busy}
            className="hidden"
            aria-hidden="true"
          />
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Camera className="h-4 w-4" />
              {busy ? "กำลังบันทึก..." : photoFileName ? "เปลี่ยนรูป" : "เพิ่มรูป"}
            </Button>
            {photoFileName && (
              <Button variant="danger" size="sm" onClick={() => void onDelete()} disabled={busy}>
                <Trash2 className="h-4 w-4" />
                ลบรูป
              </Button>
            )}
          </div>
          <p className="text-center text-xs text-slate-400">PNG หรือ JPG ขนาดไม่เกิน 2 MB</p>
          {error && <p className="text-center text-sm text-withdraw">{error}</p>}
          {msg && <p className="text-center text-sm text-deposit">{msg}</p>}
        </div>
      )}
    </div>
  );
}
