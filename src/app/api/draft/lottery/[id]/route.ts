import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { drawLotteryOrder, chainedRoundOrders } from "@/lib/draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read lottery state — any logged-in user (so the group can watch the reveal).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const room = await prisma.draftRoom.findUnique({
    where: { id: params.id },
    include: { participants: { orderBy: { teamName: "asc" } } },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    isAdmin: session.user.role === "admin",
    room: {
      id: room.id,
      name: room.name,
      status: room.status,
      rounds: room.rounds,
      roundMode: room.roundMode,
      roundOrders: room.roundOrders,
      lotteryRevealed: room.lotteryRevealed,
      drawn: room.participants.every((p) => p.draftOrder >= 0),
      participants: room.participants.map((p) => ({
        id: p.id,
        teamName: p.teamName,
        weight: p.weight,
        draftOrder: p.draftOrder,
      })),
    },
  });
}

// Lottery actions (admin-only): run | revealNext | reset | finish.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { action } = await req.json().catch(() => ({}));
  const room = await prisma.draftRoom.findUnique({
    where: { id: params.id },
    include: { participants: true },
  });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const n = room.participants.length;

  if (action === "run") {
    // Weighted draw → assign each participant its 0-based pick position.
    const weights = room.participants.map((p) => p.weight);
    const order = drawLotteryOrder(weights); // order[0] = participant idx that picks #1
    // Re-lottery mode: pre-draw every round's order now (chained off round 1).
    const roundOrders =
      room.roundMode === "relottery"
        ? JSON.stringify(chainedRoundOrders(room.rounds, n))
        : null;
    await prisma.$transaction([
      ...order.map((partIdx, pickPos) =>
        prisma.draftParticipant.update({
          where: { id: room.participants[partIdx].id },
          data: { draftOrder: pickPos },
        })
      ),
      prisma.draftRoom.update({
        where: { id: room.id },
        data: { lotteryRevealed: 0, status: "lottery", roundOrders },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (action === "revealNext") {
    const next = Math.min(room.lotteryRevealed + 1, n);
    await prisma.draftRoom.update({ where: { id: room.id }, data: { lotteryRevealed: next } });
    return NextResponse.json({ ok: true, lotteryRevealed: next });
  }

  if (action === "reset") {
    await prisma.$transaction([
      prisma.draftParticipant.updateMany({ where: { roomId: room.id }, data: { draftOrder: -1 } }),
      prisma.draftRoom.update({
        where: { id: room.id },
        data: { lotteryRevealed: 0, status: "lottery", roundOrders: null },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (action === "finish") {
    if (room.lotteryRevealed < n || room.participants.some((p) => p.draftOrder < 0)) {
      return NextResponse.json({ error: "Η κλήρωση δεν έχει αποκαλυφθεί πλήρως." }, { status: 400 });
    }
    await prisma.draftRoom.update({ where: { id: room.id }, data: { status: "lobby" } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
