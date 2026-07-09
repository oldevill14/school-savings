import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone" ใช้เฉพาะตอน build สำหรับ Docker (ตั้ง env DOCKER_BUILD=1)
  // สำหรับ Cloudflare (OpenNext) ต้องใช้ default output — อย่าตั้ง standalone
  ...(process.env.DOCKER_BUILD ? { output: "standalone" as const } : {}),
  // ให้ Prisma client ถูก include + patch สำหรับ workerd runtime (OpenNext) — กันปัญหา engine/wasm/fs
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;

// OpenNext (Cloudflare) — เปิดใช้ getCloudflareContext() ตอน next dev ในเครื่อง
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
