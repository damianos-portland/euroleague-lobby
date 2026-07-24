import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

// Toggle a player on/off the CURRENT user's watchlist. The user id comes from
// the session — never trust a client-supplied userId.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { playerId } = await req.json().catch(() => ({}));
  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  const existing = await prisma.watchlistItem.findUnique({
    where: { userId_playerId: { userId, playerId } },
  });
  if (existing) {
    await prisma.watchlistItem.delete({ where: { id: existing.id } });
    return NextResponse.json({ watched: false });
  }
  await prisma.watchlistItem.create({ data: { userId, playerId } });
  return NextResponse.json({ watched: true });
}
