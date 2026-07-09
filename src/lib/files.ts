/**
 * จัดการไฟล์อัปโหลด (โลโก้โรงเรียน, รูปนักเรียน) — เก็บเป็น bytes ใน Postgres (ตาราง UploadedFile)
 *
 * เดิมเขียนไฟล์ลงดิสก์ (fs) — เปลี่ยนมาเก็บใน DB เพื่อรองรับ serverless (Vercel/Cloudflare)
 * ที่ไม่มีดิสก์ถาวร. contract กับ caller ไม่เปลี่ยน: ยังเก็บแค่ basename (fileName) ใน DB
 * (SchoolSetting.logoFileName / Student.photoFileName) แล้วเรียก readUpload คืน bytes.
 *
 * ใช้ได้เฉพาะฝั่ง server — โมดูลนี้ไม่พึ่ง fs แล้ว (ไม่มี path traversal ให้กังวล)
 * แต่ route ที่เรียกยังควรประกาศ runtime = "nodejs" (prisma/bcrypt ใช้ Node API)
 */
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";

/** error สำหรับไฟล์ไม่ผ่าน validation — มี .status = 400 ให้ route แปลงเป็น response */
export class FileValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "FileValidationError";
  }
}

/**
 * ไฟล์อัปโหลดไม่พบใน DB — ตั้ง .code = "ENOENT" ให้ route เดิมที่เช็ค ENOENT
 * (เช่น GET /api/files/students/[name]) แปลงเป็น 404 ได้เหมือนตอนอ่านจากดิสก์
 */
export class UploadNotFoundError extends Error {
  code = "ENOENT" as const;
  constructor(message = "ไม่พบไฟล์") {
    super(message);
    this.name = "UploadNotFoundError";
  }
}

/** ประเภทไฟล์ที่อนุญาต -> นามสกุลไฟล์ */
const ALLOWED_TYPES: Record<string, "png" | "jpg"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};
/** ขนาดสูงสุด 2 MB */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** subdir อนุญาตเฉพาะ a-z A-Z 0-9 _ - ยาว 1-32 */
const SUBDIR_RE = /^[a-zA-Z0-9_-]{1,32}$/;
/** ชื่อไฟล์อนุญาตเฉพาะ a-z A-Z 0-9 . _ - ยาว 1-128 (กัน "..") */
const FILENAME_RE = /^[a-zA-Z0-9._-]{1,128}$/;

function assertSubdir(subdir: string): string {
  if (!SUBDIR_RE.test(subdir)) {
    throw new FileValidationError("ชื่อโฟลเดอร์ปลายทางไม่ถูกต้อง");
  }
  return subdir;
}

function assertFileName(name: string): string {
  if (name.includes("..") || !FILENAME_RE.test(name)) {
    throw new FileValidationError("ชื่อไฟล์ไม่ถูกต้อง");
  }
  return name;
}

export type SaveUploadResult = {
  /** ชื่อไฟล์ (basename) — เก็บลง DB เช่น SchoolSetting.logoFileName / Student.photoFileName */
  fileName: string;
  /** นามสกุล "png" | "jpg" */
  ext: "png" | "jpg";
};

/**
 * บันทึกไฟล์อัปโหลด — validate ประเภท (png/jpg) + ขนาด (<= 2MB) แล้วตั้งชื่อสุ่ม
 * เก็บ bytes ลงตาราง UploadedFile คืน { fileName } เพื่อให้ caller เก็บ pointer ลง DB
 * โยน FileValidationError ถ้าไฟล์ไม่ผ่าน
 */
export async function saveUpload(subdir: string, file: File): Promise<SaveUploadResult> {
  const safeSub = assertSubdir(subdir);

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    throw new FileValidationError("รองรับเฉพาะไฟล์รูปภาพ PNG หรือ JPG เท่านั้น");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new FileValidationError("ไฟล์ต้องมีขนาดไม่เกิน 2 MB");
  }

  const buf = Buffer.from(await file.arrayBuffer());
  // ตรวจขนาดซ้ำหลังอ่านจริง (file.size อาจถูกปลอมได้)
  if (buf.length > MAX_UPLOAD_BYTES) {
    throw new FileValidationError("ไฟล์ต้องมีขนาดไม่เกิน 2 MB");
  }

  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  const fileName = `${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;

  await prisma.uploadedFile.create({
    data: { fileName, subdir: safeSub, contentType, data: buf, size: buf.length },
  });

  return { fileName, ext };
}

export type ReadUploadResult = {
  data: Buffer;
  contentType: "image/png" | "image/jpeg";
};

/**
 * อ่านไฟล์อัปโหลดกลับ (สำหรับ route ที่ serve รูป) จากตาราง UploadedFile
 * โยน FileValidationError ถ้าชื่อไม่ถูกต้อง / โยน UploadNotFoundError (.code=ENOENT) ถ้าไม่พบ
 */
export async function readUpload(subdir: string, name: string): Promise<ReadUploadResult> {
  const safeSub = assertSubdir(subdir);
  const safeName = assertFileName(name);

  const row = await prisma.uploadedFile.findUnique({
    where: { fileName: safeName },
    select: { subdir: true, contentType: true, data: true },
  });
  if (!row || row.subdir !== safeSub) {
    throw new UploadNotFoundError();
  }

  const contentType: "image/png" | "image/jpeg" =
    row.contentType === "image/png" ? "image/png" : "image/jpeg";
  return { data: Buffer.from(row.data), contentType };
}
