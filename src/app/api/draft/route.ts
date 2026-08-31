import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";

// List rooms. Each room is annotated with `mine` = the current user controls a
// slot in it, so the client can surface "my draft rooms".
export async function GET() {
  const session = await auth();
  const uid = session?.user?.id ?? null;

  const rooms = await prisma.draftRoom.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { participants: true, picks: true } },
      participants: { select: { userId: true } },
    },
  });

  const shaped = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    rounds: r.rounds,
    _count: r._count,
    mine: uid ? r.participants.some((p) => p.userId === uid) : false,
  }));
  return NextResponse.json({ rooms: shaped, isAdmin: session?.user?.role === "admin" });
}

// Create a room with a randomised draft order (the "lottery").
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, rounds = 10, pickSeconds = 60, teamNames = [], rosterSlots } = body;
  if (!name || !Array.isArray(teamNames) || teamNames.length < 2) {
    return NextResponse.json({ error: "name and at least 2 teamNames required" }, { status: 400 });
  }

  const owner = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!owner) return NextResponse.json({ error: "No owner user" }, { status: 500 });

  // Fisher-Yates lottery for draft order.
  const order = teamNames.map((_: string, i: number) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const room = await prisma.draftRoom.create({
    data: {
      name, ownerId: owner.id, rounds, pickSeconds, status: "lobby",
      ...(rosterSlots ? { rosterSlots } : {}),
      participants: {
        create: teamNames.map((teamName: string, i: number) => ({
          teamName,
          draftOrder: order.indexOf(i),
          isAutopick: i !== 0, // first team is "you"; others auto by default
        })),
      },
    },
  });
  return NextResponse.json({ roomId: room.id });
}
