import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Route-handler guard: returns null when the caller is an admin, otherwise a
// 401/403 NextResponse the handler should return immediately.
//   const denied = await requireAdmin();
//   if (denied) return denied;
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}
