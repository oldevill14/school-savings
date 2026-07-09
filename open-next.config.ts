import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// ค่าเริ่มต้น — ไม่ใช้ R2 incremental cache (app ส่วนใหญ่เป็น dynamic/force-dynamic อยู่แล้ว)
// ถ้าต้องการ ISR cache ค่อยเพิ่ม r2IncrementalCache + ผูก R2 bucket ทีหลัง
export default defineCloudflareConfig();
