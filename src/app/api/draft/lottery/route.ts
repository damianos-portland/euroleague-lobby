import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { requireAdmin } from "@/lib/authz";
import { nbaLotteryWeights } from "@/lib/draft";

export const runtime = "nodejs";

// Create a draft lottery (admin-only). Body: { name, rounds?, pickSeconds?,
// mode: "nba"|"equal"|"manual", teams: [{ name, weight? }] }. Team order = seed
// (worst last season first → best odds). Participants start draftOrder -1
// (not yet drawn), status "lottery".
export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const session = await auth();

  const { name, rounds = 10, pickSeconds = 60, mode = "nba", roundMode: rawRoundMode = "snake", teams } =
    await req.json().catch(() => ({}));
  const roundMode = rawRoundMode === "relottery" ? "relottery" : "snake";
  const list: { name: string; weight?: number }[] = Array.isArray(teams) ? teams : [];
  let clean = list
    .map((t) => ({ name: String(t?.name ?? "").trim(), weight: Math.max(1, Math.round(Number(t?.weight)) || 1) }))
    .filter((t) => t.name);
  if (!name || clean.length < 2) {
    return NextResponse.json({ error: "name and at least 2 teams required" }, { status: 400 });
  }

  // Assign weights by lottery mode. Team order is the seed (index 0 = worst).
  if (mode === "nba") {
    const w = nbaLotteryWeights(clean.length);
    clean = clean.map((t, i) => ({ ...t, weight: w[i] }));
  } else if (mode === "equal") {
    clean = clean.map((t) => ({ ...t, weight: 1 }));
  }
  // mode "manual" keeps the parsed per-team weights.

  const room = await prisma.draftRoom.create({
    data: {
      name,
      ownerId: session!.user.id,
      status: "lottery",
      rounds,
      pickSeconds,
      roundMode,
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
