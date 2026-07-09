import { cache } from "react";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * PrismaClient ผ่าน @prisma/adapter-pg (node-postgres over TCP)
 *
 * รองรับ Cloudflare Workers: OpenNext patch @prisma/client (ผ่าน serverExternalPackages ใน
 * next.config) ให้รันบน workerd ได้ + adapter-pg ต่อ Postgres ผ่าน TCP (Workers รองรับ) —
 * เลี่ยงปัญหา Rust engine/wasm ที่ต้องอ่านไฟล์ผ่าน fs. ใช้ DATABASE_URL = Neon pooled (-pooler).
 *
 * cache() (React) = client ตัวเดียวต่อ 1 request; maxUses:1 = ไม่ reuse connection ข้าม request
 * (สอดคล้อง execution model ของ Workers). ใช้: import { prisma } from "@/lib/db";
 */
const getDb = cache((): PrismaClient => {
  const connectionString = process.env.DATABASE_URL ?? "";
  const adapter = new PrismaPg({ connectionString, maxUses: 1 });
  return new PrismaClient({ adapter });
});

/** Proxy บาง ๆ — ให้ `import { prisma }` ใช้ได้เหมือนเดิม โดย resolve client (per-request) ตอนเข้าถึง */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getDb();
    const value = Reflect.get(client as object, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export default prisma;
