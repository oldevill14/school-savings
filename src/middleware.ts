/**
 * Middleware กัน route ตาม session + role (ทำงานบน edge — ใช้ jose ตรงๆ ห้าม import lib/auth)
 *
 * กติกา (ด่านแรก — ทุก API/Server Action ยังต้องเช็ค role ซ้ำด้วย requireRole/requireRoleApi):
 * - ไม่มี session -> redirect /login (ถ้าเป็น /api -> 401 JSON)
 * - ADMIN เท่านั้น: /users /academic-years /classrooms /settings /interest /audit
 * - ADMIN + TEACHER เท่านั้น: /cash-closing (ครูดูได้ / ผู้บริหาร-ผู้ปกครองเข้าไม่ได้)
 * - PARENT: เข้าได้แค่ /my-child /passbook /account
 * - EXECUTIVE (read-only): เข้าได้แค่ /dashboard /transactions /students /reports /passbook /account
 *     และห้าม /transactions/new (เป็นการเขียน)
 * - ทุก role ที่ล็อกอิน: เข้า /account ได้
 * - matcher ยกเว้น /login, /api/auth, /api/line/webhook, _next, ไฟล์ static
 *   (webhook LINE ยิงมาโดยไม่มี cookie — ตรวจ HMAC signature เองใน route จึงปลอดภัย)
 */
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

type Role = "ADMIN" | "TEACHER" | "PARENT" | "EXECUTIVE";

// เข้าถึงได้เฉพาะ ADMIN (บังคับทั้งหน้าและ API)
const ADMIN_ONLY_PREFIXES = [
  "/users",
  "/academic-years",
  "/classrooms",
  "/settings",
  "/interest",
  "/audit",
];
// เข้าถึงได้เฉพาะ ADMIN + TEACHER (ครูดูปิดยอดเงินสดได้)
const STAFF_ONLY_PREFIXES = ["/cash-closing"];
// PARENT เข้าหน้า (non-API) ได้แค่กลุ่มนี้
const PARENT_ALLOWED_PREFIXES = ["/my-child", "/passbook", "/account"];
// EXECUTIVE (read-only) เข้าหน้า (non-API) ได้แค่กลุ่มนี้
const EXECUTIVE_ALLOWED_PREFIXES = [
  "/dashboard",
  "/transactions",
  "/students",
  "/reports",
  "/passbook",
  "/account",
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/** หน้าหลักของแต่ละ role (ใช้ตอน redirect เมื่อเข้าหน้าไม่มีสิทธิ์) */
function homeFor(role: Role): string {
  return role === "PARENT" ? "/my-child" : "/dashboard";
}

async function readRole(req: NextRequest): Promise<Role | null> {
  const token = req.cookies.get("session")?.value;
  if (!token) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    const role = payload.role;
    if (role === "ADMIN" || role === "TEACHER" || role === "PARENT" || role === "EXECUTIVE") {
      return role;
    }
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

  // 2) โซน ADMIN เท่านั้น (บังคับทั้งหน้าและ API)
  if (role !== "ADMIN" && ADMIN_ONLY_PREFIXES.some((p) => matchesPrefix(pathname, p))) {
    if (isApi) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงส่วนนี้" }, { status: 403 });
    }
    return NextResponse.redirect(new URL(homeFor(role), req.url));
  }

  // 3) โซน ADMIN + TEACHER เท่านั้น (ปิดยอดเงินสด — บังคับทั้งหน้าและ API)
  if (
    role !== "ADMIN" &&
    role !== "TEACHER" &&
    STAFF_ONLY_PREFIXES.some((p) => matchesPrefix(pathname, p))
  ) {
    if (isApi) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงส่วนนี้" }, { status: 403 });
    }
    return NextResponse.redirect(new URL(homeFor(role), req.url));
  }

  // 4) PARENT เข้าหน้า (non-API) ได้แค่กลุ่มที่อนุญาต
  if (role === "PARENT" && !isApi) {
    const allowed = PARENT_ALLOWED_PREFIXES.some((p) => matchesPrefix(pathname, p));
    if (!allowed) {
      return NextResponse.redirect(new URL("/my-child", req.url));
    }
  }

  // 5) EXECUTIVE (read-only) เข้าหน้า (non-API) ได้แค่กลุ่มที่อนุญาต และห้าม /transactions/new
  if (role === "EXECUTIVE" && !isApi) {
    if (matchesPrefix(pathname, "/transactions/new")) {
      return NextResponse.redirect(new URL("/transactions", req.url));
    }
    const allowed = EXECUTIVE_ALLOWED_PREFIXES.some((p) => matchesPrefix(pathname, p));
    if (!allowed) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  // 6) /my-child สำหรับ PARENT เท่านั้น
  if (role !== "PARENT" && matchesPrefix(pathname, "/my-child")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // ยกเว้น /login, /api/auth/*, /api/line/webhook, _next, และไฟล์ static (มีนามสกุล)
  // เฉพาะ webhook เท่านั้น — /api/line/link-code ยังคง session gate (PARENT) ไว้
  matcher: ["/((?!login|api/auth|api/line/webhook|_next|favicon\\.ico|.*\\..*).*)"],
};
