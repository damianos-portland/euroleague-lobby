import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Toggle a player on/off the current user's watchlist.
export async function POST(req: NextRequest) {
  const { userId, playerId } = await req.json();
  if (!userId || !playerId) {
    return NextResponse.json({ error: "userId and playerId required" }, { status: 400 });
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
