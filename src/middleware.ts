/**
 * Middleware กัน route ตาม session + role (ทำงานบน edge — ใช้ jose ตรงๆ ห้าม import lib/auth)
 *
 * กติกา:
 * - ไม่มี session -> redirect /login (ถ้าเป็น /api -> 401 JSON)
 * - /users, /academic-years, /classrooms -> ADMIN เท่านั้น
 * - /my-child -> PARENT เท่านั้น
 * - PARENT เข้าหน้าได้แค่ /my-child และ /passbook
 * - matcher ยกเว้น /login, /api/auth, _next, ไฟล์ static
 *
 * หมายเหตุ: middleware เป็นด่านแรกเท่านั้น — ทุก API/Server Action ยังต้องเช็ค role
 * ฝั่ง server ด้วย requireRole / requireRoleApi เสมอ
 */
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

type Role = "ADMIN" | "TEACHER" | "PARENT";

const ADMIN_ONLY_PREFIXES = ["/users", "/academic-years", "/classrooms"];
const PARENT_ALLOWED_PREFIXES = ["/my-child", "/passbook"];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

async function readRole(req: NextRequest): Promise<Role | null> {
  const token = req.cookies.get("session")?.value;
  if (!token) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const role = payload.role;
    if (role === "ADMIN" || role === "TEACHER" || role === "PARENT") return role;
    return null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api");
  const role = await readRole(req);

  // 1) ไม่มี session
  if (!role) {
    if (isApi) {
      return NextResponse.json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2) PARENT เข้าหน้า (non-API) ได้แค่ /my-child และ /passbook
  if (role === "PARENT" && !isApi) {
    const allowed = PARENT_ALLOWED_PREFIXES.some((p) => matchesPrefix(pathname, p));
    if (!allowed) {
      return NextResponse.redirect(new URL("/my-child", req.url));
    }
  }

  // 3) โซน ADMIN เท่านั้น
  if (role !== "ADMIN" && ADMIN_ONLY_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
    if (isApi) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงส่วนนี้" }, { status: 403 });
    }
    return NextResponse.redirect(
      new URL(role === "PARENT" ? "/my-child" : "/dashboard", req.url)
    );
  }

  // 4) /my-child สำหรับ PARENT เท่านั้น
  if (role !== "PARENT" && matchesPrefix(pathname, "/my-child")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // ยกเว้น /login, /api/auth/*, _next, และไฟล์ static (มีนามสกุล)
  matcher: ["/((?!login|api/auth|_next|favicon\\.ico|.*\\..*).*)"],
};
