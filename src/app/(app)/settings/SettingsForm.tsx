"use client";

/**
 * SettingsForm — ฟอร์มตั้งค่าโรงเรียน (client)
 *
 * 2 ส่วนแยกกันบันทึก:
 *   1) ข้อมูลโรงเรียน (ชื่อ + สังกัด)   -> PUT  /api/settings         (JSON)
 *   2) โลโก้โรงเรียน                    -> POST /api/settings/logo    (multipart)
 *
 * โลโก้ปัจจุบันแสดงจาก /api/branding/logo.png (public route) — ใส่ ?v= กันแคชหลังอัปโหลด
 * ตรวจไฟล์ฝั่ง client เบื้องต้น (png/jpg + <=2MB) ก่อนส่ง แต่ server (@/lib/files) ตรวจซ้ำเสมอ
 */
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Save, UploadCloud } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB — ตรงกับ MAX_UPLOAD_BYTES ฝั่ง server
const ACCEPTED_TYPES = ["image/png", "image/jpeg"];

export interface SettingsFormProps {
  initialSchoolName: string;
  initialSchoolArea: string;
  hasLogo: boolean;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default function SettingsForm({
  initialSchoolName,
  initialSchoolArea,
  hasLogo,
}: SettingsFormProps) {
  // ── ส่วนข้อมูลโรงเรียน ──
  const [schoolName, setSchoolName] = useState(initialSchoolName);
  const [schoolArea, setSchoolArea] = useState(initialSchoolArea);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [infoErr, setInfoErr] = useState<string | null>(null);

  // ── ส่วนโลโก้ ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoMsg, setLogoMsg] = useState<string | null>(null);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  // เวอร์ชันกันแคชของโลโก้ปัจจุบัน — bump หลังอัปโหลดสำเร็จเพื่อบังคับโหลดรูปใหม่
  const [logoVersion, setLogoVersion] = useState(() => Date.now());

  // เก็บกวาด object URL ของ preview เมื่อ unmount / เปลี่ยนไฟล์
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const currentLogoSrc = `/api/branding/logo.png?v=${logoVersion}`;

  async function saveInfo() {
    setInfoErr(null);
    setInfoMsg(null);

    const name = schoolName.trim();
    const area = schoolArea.trim();
    if (!name) {
      setInfoErr("กรุณากรอกชื่อโรงเรียน");
      return;
    }
    if (!area) {
      setInfoErr("กรุณากรอกสังกัด/เขตพื้นที่");
      return;
    }

    setSavingInfo(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolName: name, schoolArea: area }),
      });
      const json = await readJson(res);
      if (!res.ok) {
        setInfoErr((json.error as string) || "บันทึกไม่สำเร็จ");
        return;
      }
      setSchoolName(name);
      setSchoolArea(area);
      setInfoMsg("บันทึกข้อมูลโรงเรียนแล้ว — ชื่อใหม่จะปรากฏทั่วระบบเมื่อโหลดหน้าใหม่");
    } catch {
      setInfoErr("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่");
    } finally {
      setSavingInfo(false);
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setLogoErr(null);
    setLogoMsg(null);
    const file = e.target.files?.[0] ?? null;

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setSelectedFile(null);
      setLogoErr("รองรับเฉพาะไฟล์รูปภาพ PNG หรือ JPG เท่านั้น");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setSelectedFile(null);
      setLogoErr("ไฟล์ต้องมีขนาดไม่เกิน 2 MB");
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function uploadLogo() {
    if (!selectedFile) {
      setLogoErr("กรุณาเลือกไฟล์โลโก้ก่อน");
      return;
    }
    setLogoErr(null);
    setLogoMsg(null);
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("logo", selectedFile);
      const res = await fetch("/api/settings/logo", { method: "POST", body: fd });
      const json = await readJson(res);
      if (!res.ok) {
        setLogoErr((json.error as string) || "อัปโหลดโลโก้ไม่สำเร็จ");
        return;
      }
      // ล้างไฟล์ที่เลือก + บังคับโหลดโลโก้ปัจจุบันใหม่
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setLogoVersion(Date.now());
      setLogoMsg("เปลี่ยนโลโก้เรียบร้อยแล้ว — โลโก้ใหม่จะปรากฏทั่วระบบเมื่อโหลดหน้าใหม่");
    } catch {
      setLogoErr("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่");
    } finally {
      setUploadingLogo(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ── ข้อมูลโรงเรียน ── */}
      <Card title="ข้อมูลโรงเรียน" description="ชื่อและสังกัดจะแสดงบนหน้าเข้าสู่ระบบ แถบเมนู และหัวรายงาน">
        <div className="space-y-4">
          <Input
            label="ชื่อโรงเรียน"
            placeholder="เช่น โรงเรียนบ้านกะดาด"
            value={schoolName}
            maxLength={120}
            onChange={(e) => setSchoolName(e.target.value)}
            disabled={savingInfo}
          />
          <Input
            label="สังกัด / เขตพื้นที่"
            placeholder="เช่น สพป.สุรินทร์ เขต 3"
            value={schoolArea}
            maxLength={120}
            onChange={(e) => setSchoolArea(e.target.value)}
            disabled={savingInfo}
          />

          {infoErr && <p className="text-sm text-withdraw">{infoErr}</p>}
          {infoMsg && <p className="text-sm text-deposit">{infoMsg}</p>}

          <div className="flex justify-end">
            <Button onClick={() => void saveInfo()} disabled={savingInfo}>
              <Save className="h-4 w-4" />
              {savingInfo ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
            </Button>
          </div>
        </div>
      </Card>

      {/* ── โลโก้โรงเรียน ── */}
      <Card title="โลโก้โรงเรียน" description="รูปตราโรงเรียนที่แสดงบนหน้าเข้าสู่ระบบและแถบเมนู">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={previewUrl ?? currentLogoSrc}
                src={previewUrl ?? currentLogoSrc}
                alt="ตราโรงเรียน"
                className="h-16 w-16 object-contain"
              />
            </div>
            <div className="min-w-0 text-sm text-slate-600">
              <p className="font-medium text-slate-800">
                {previewUrl
                  ? "ตัวอย่างโลโก้ใหม่ (ยังไม่บันทึก)"
                  : hasLogo
                    ? "โลโก้ปัจจุบัน"
                    : "โลโก้เริ่มต้นของระบบ"}
              </p>
              <p className="mt-0.5 text-slate-500">
                ไฟล์ PNG หรือ JPG ขนาดไม่เกิน 2 MB — แนะนำรูปจัตุรัส 512×512 พิกเซล
                พื้นหลังโปร่งใส
              </p>
            </div>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={onPickFile}
              disabled={uploadingLogo}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-navy file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-navy-light disabled:opacity-50"
            />
          </div>

          {logoErr && <p className="text-sm text-withdraw">{logoErr}</p>}
          {logoMsg && <p className="text-sm text-deposit">{logoMsg}</p>}

          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
              <ImagePlus className="h-4 w-4" />
              เลือกไฟล์แล้วกด &quot;อัปโหลดโลโก้&quot;
            </span>
            <Button onClick={() => void uploadLogo()} disabled={uploadingLogo || !selectedFile}>
              <UploadCloud className="h-4 w-4" />
              {uploadingLogo ? "กำลังอัปโหลด..." : "อัปโหลดโลโก้"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
