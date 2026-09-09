import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// List the current user's passkeys.
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await prisma.authenticator.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, deviceName: true, transports: true, createdAt: true },
  });
  return NextResponse.json({ passkeys: list });
}

// Remove one of the current user's passkeys.
export async function DELETE(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Scoped to the caller — can only delete their own.
  await prisma.authenticator.deleteMany({ where: { id: String(id), userId } });
  return NextResponse.json({ ok: true });
}
