import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient singleton — กัน hot-reload ตอน dev สร้าง connection ใหม่ซ้ำๆ
 *
 * ใช้: import { prisma } from "@/lib/db";
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
