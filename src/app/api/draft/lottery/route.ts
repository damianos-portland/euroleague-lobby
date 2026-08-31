import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { requireAdmin } from "@/lib/authz";

export const runtime = "nodejs";

// Create a draft lottery (admin-only). Body: { name, rounds?, pickSeconds?,
// teams: [{ name, weight? }] }. Participants start with draftOrder -1 (not yet
// drawn) and status "lottery".
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const session = await auth();

  const { name, rounds = 10, pickSeconds = 60, teams } = await req.json().catch(() => ({}));
  const list: { name: string; weight?: number }[] = Array.isArray(teams) ? teams : [];
  const clean = list
    .map((t) => ({ name: String(t?.name ?? "").trim(), weight: Math.max(1, Math.round(Number(t?.weight)) || 1) }))
    .filter((t) => t.name);
  if (!name || clean.length < 2) {
    return NextResponse.json({ error: "name and at least 2 teams required" }, { status: 400 });
  }

  const room = await prisma.draftRoom.create({
    data: {
      name,
      ownerId: session!.user.id,
      status: "lottery",
      rounds,
      pickSeconds,
      lotteryRevealed: 0,
      participants: {
        create: clean.map((t, i) => ({
          teamName: t.name,
          weight: t.weight,
          draftOrder: -1, // not yet drawn
          isAutopick: i !== 0,
        })),
      },
    },
  });
  return NextResponse.json({ roomId: room.id });
}
