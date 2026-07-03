/**
 * /settings — ตั้งค่าโรงเรียน + โลโก้ (ADMIN เท่านั้น)
 *
 * Server Component: เช็คสิทธิ์ + อ่านค่าปัจจุบันจาก getSchoolSetting แล้วส่งเป็น prop
 * ให้ฟอร์ม (client) — สิทธิ์ถูกกันสองชั้น: middleware (/settings = ADMIN) + requireRole
 */
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { getSchoolSetting } from "@/lib/settings";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ตั้งค่าโรงเรียน",
};

export default async function SettingsPage() {
  await requireRole(["ADMIN"]);
  const setting = await getSchoolSetting();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">ตั้งค่าโรงเรียน</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          แก้ชื่อโรงเรียน สังกัด/เขตพื้นที่ และเปลี่ยนตราโรงเรียน (โลโก้) ที่แสดงทั่วทั้งระบบ
        </p>
      </div>

      <SettingsForm
        initialSchoolName={setting.schoolName}
        initialSchoolArea={setting.schoolArea}
        hasLogo={setting.logoFileName !== null}
      />
    </div>
  );
}
