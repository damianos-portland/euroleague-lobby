import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { requireAdmin } from "@/lib/authz";

export const runtime = "nodejs";

// Change a user's role. Admin-only; an admin cannot demote themselves (avoids
// locking the last admin out).
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const session = await auth();
  const { userId, role } = await req.json().catch(() => ({}));
  if (!userId || (role !== "admin" && role !== "user")) {
    return NextResponse.json({ error: "userId and role ('admin'|'user') required" }, { status: 400 });
  }
  if (userId === session!.user.id && role !== "admin") {
    return NextResponse.json({ error: "Δεν μπορείς να αφαιρέσεις τον δικό σου ρόλο admin." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, role: true },
  });
  return NextResponse.json({ ok: true, ...updated });
}
