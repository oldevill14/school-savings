import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // สำหรับ deploy แบบ self-host / Docker — ได้ .next/standalone
  output: "standalone",
};

export default nextConfig;
