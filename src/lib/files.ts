/**
 * จัดการไฟล์อัปโหลด (โลโก้โรงเรียน, รูปนักเรียน) บนดิสก์
 *
 * ใช้ได้เฉพาะฝั่ง server (Node.js runtime: fs) — ห้าม import จาก client component
 * และ route/handler ที่เรียกต้องประกาศ `export const runtime = "nodejs"`
 *
 * เก็บไฟล์ที่ UPLOADS_DIR (env, default "./uploads") แยกโฟลเดอร์ย่อยตามชนิด
 * เช่น saveUpload("logo", file) -> UPLOADS_DIR/logo/<random>.png
 *      saveUpload("students", file) -> UPLOADS_DIR/students/<random>.jpg
 *
 * ความปลอดภัย: กัน path traversal เด็ดขาด — subdir/ชื่อไฟล์ต้องผ่าน whitelist regex
 * และตรวจซ้ำว่า resolved path ยังอยู่ใต้ UPLOADS_DIR เสมอ
 */
import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";

/** error สำหรับไฟล์ไม่ผ่าน validation — มี .status = 400 ให้ route แปลงเป็น response */
export class FileValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "FileValidationError";
  }
}

/** ประเภทไฟล์ที่อนุญาต -> นามสกุลไฟล์ */
const ALLOWED_TYPES: Record<string, "png" | "jpg"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};
/** ขนาดสูงสุด 2 MB */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** subdir อนุญาตเฉพาะ a-z A-Z 0-9 _ - ยาว 1-32 (กัน "..", "/", ตัวอักษรพิเศษ) */
const SUBDIR_RE = /^[a-zA-Z0-9_-]{1,32}$/;
/** ชื่อไฟล์อนุญาตเฉพาะ a-z A-Z 0-9 . _ - ยาว 1-128 */
const FILENAME_RE = /^[a-zA-Z0-9._-]{1,128}$/;

/** โฟลเดอร์ราก (absolute) — อ่าน env สดทุกครั้งเพื่อรองรับการตั้งค่าใน runtime */
function baseDir(): string {
  return path.resolve(process.env.UPLOADS_DIR || "./uploads");
}

function assertSubdir(subdir: string): string {
  if (!SUBDIR_RE.test(subdir)) {
    throw new FileValidationError("ชื่อโฟลเดอร์ปลายทางไม่ถูกต้อง");
  }
  return subdir;
}

function assertFileName(name: string): string {
  // ต้องเป็น basename ล้วน (ไม่มี path) + ผ่าน whitelist + ไม่มี ".."
  if (path.basename(name) !== name || name.includes("..") || !FILENAME_RE.test(name)) {
    throw new FileValidationError("ชื่อไฟล์ไม่ถูกต้อง");
  }
  return name;
}

export type SaveUploadResult = {
  /** ชื่อไฟล์ (basename เท่านั้น) — เก็บลง DB เช่น SchoolSetting.logoFileName / Student.photoFileName */
  fileName: string;
  /** นามสกุล "png" | "jpg" */
  ext: "png" | "jpg";
};

/**
 * บันทึกไฟล์อัปโหลด — validate ประเภท (png/jpg) + ขนาด (<= 2MB) แล้วตั้งชื่อสุ่ม
 * คืน { fileName } เพื่อเก็บลง DB (อย่าเก็บ path เต็ม — เก็บแค่ basename)
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

  const dir = path.join(baseDir(), safeSub);
  await fs.mkdir(dir, { recursive: true });

  const fileName = `${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(dir, fileName), buf);

  return { fileName, ext };
}

export type ReadUploadResult = {
  data: Buffer;
  contentType: "image/png" | "image/jpeg";
};

/**
 * อ่านไฟล์อัปโหลดกลับ (สำหรับ route ที่ serve รูป) — กัน path traversal
 * โยน FileValidationError ถ้าชื่อไม่ถูกต้อง / โยน error ปกติของ fs ถ้าไฟล์ไม่มี
 */
export async function readUpload(subdir: string, name: string): Promise<ReadUploadResult> {
  const safeSub = assertSubdir(subdir);
  const safeName = assertFileName(name);

  const dir = path.join(baseDir(), safeSub);
  const full = path.join(dir, safeName);

  // belt-and-suspenders: resolved path ต้องอยู่ใต้ dir เสมอ
  if (full !== path.join(dir, path.basename(full)) || !full.startsWith(dir + path.sep)) {
    throw new FileValidationError("ชื่อไฟล์ไม่ถูกต้อง");
  }

  const data = await fs.readFile(full);
  const contentType: "image/png" | "image/jpeg" = safeName.toLowerCase().endsWith(".png")
    ? "image/png"
    : "image/jpeg";
  return { data, contentType };
}
