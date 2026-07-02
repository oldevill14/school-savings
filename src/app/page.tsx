import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

/**
 * หน้า root — redirect ตาม session:
 * - ไม่ login -> /login
 * - PARENT   -> /my-child
 * - อื่น      -> /dashboard
 */
export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "PARENT") redirect("/my-child");
  redirect("/dashboard");
}
