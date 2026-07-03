/**
 * ตั้งค่าโรงเรียน (SchoolSetting) — แถวเดียว (singleton id=1)
 *
 * ใช้แทนชื่อโรงเรียน/เขตพื้นที่ที่เคย hardcode — ทีมที่ต้องแสดงชื่อโรงเรียน/โลโก้
 * ให้เรียก getSchoolSetting() แทนการเขียนสตริงตายตัว
 *
 * ใช้ได้เฉพาะฝั่ง server (แตะ prisma) — ห้าม import จาก client component
 *
 * cache ในระดับ module (per server instance) — deploy โรงเรียนเป็น standalone
 * เครื่องเดียว จึงเพียงพอ; ทุกครั้งที่ updateSchoolSetting() จะ refresh cache ให้เอง
 * ถ้ามีจุดอื่นแก้แถวนี้ตรงๆ ให้เรียก invalidateSchoolSettingCache()
 */
import { prisma } from "@/lib/db";

export type SchoolSetting = {
  schoolName: string;
  schoolArea: string;
  logoFileName: string | null;
};

/** ค่า default เมื่อยังไม่มีแถวในตาราง (เช่น DB เพิ่ง migrate เปล่า) */
export const DEFAULT_SCHOOL_SETTING: SchoolSetting = {
  schoolName: "โรงเรียนบ้านกะดาด",
  schoolArea: "สพป.สุรินทร์ เขต 3",
  logoFileName: null,
};

const SETTING_ID = 1;

let cached: SchoolSetting | null = null;

/** อ่านตั้งค่าโรงเรียน (cache) — คืน DEFAULT ถ้ายังไม่มีแถว */
export async function getSchoolSetting(): Promise<SchoolSetting> {
  if (cached) return cached;
  const row = await prisma.schoolSetting.findUnique({ where: { id: SETTING_ID } });
  cached = row
    ? {
        schoolName: row.schoolName,
        schoolArea: row.schoolArea,
        logoFileName: row.logoFileName,
      }
    : { ...DEFAULT_SCHOOL_SETTING };
  return cached;
}

/**
 * อัปเดตตั้งค่าโรงเรียน (upsert แถว id=1) แล้ว refresh cache
 * ส่งเฉพาะฟิลด์ที่ต้องการแก้ — ฟิลด์ที่ไม่ส่งจะไม่ถูกเปลี่ยน
 */
export async function updateSchoolSetting(data: {
  schoolName?: string;
  schoolArea?: string;
  logoFileName?: string | null;
}): Promise<SchoolSetting> {
  const row = await prisma.schoolSetting.upsert({
    where: { id: SETTING_ID },
    update: {
      ...(data.schoolName !== undefined ? { schoolName: data.schoolName } : {}),
      ...(data.schoolArea !== undefined ? { schoolArea: data.schoolArea } : {}),
      ...(data.logoFileName !== undefined ? { logoFileName: data.logoFileName } : {}),
    },
    create: {
      id: SETTING_ID,
      schoolName: data.schoolName ?? DEFAULT_SCHOOL_SETTING.schoolName,
      schoolArea: data.schoolArea ?? DEFAULT_SCHOOL_SETTING.schoolArea,
      logoFileName: data.logoFileName ?? null,
    },
  });
  cached = {
    schoolName: row.schoolName,
    schoolArea: row.schoolArea,
    logoFileName: row.logoFileName,
  };
  return cached;
}

/** ล้าง cache — เรียกเมื่อมีการแก้แถว SchoolSetting นอก updateSchoolSetting() */
export function invalidateSchoolSettingCache(): void {
  cached = null;
}
