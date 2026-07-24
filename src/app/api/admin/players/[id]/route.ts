import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";

const PLAYER_FIELDS = ["firstName", "lastName", "position", "nationality", "age", "teamId", "status", "depthRole", "fantasyPrice", "tags"];

// Edit a player (team change, price, projected role, status, etc.). Admin-only.
// If a roster move is implied (team changed), log it.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const b = await req.json();
  const existing = await prisma.player.findUnique({ where: { id: params.id }, include: { team: true } });
  if (!existing) return NextResponse.json({ error: "Player not found" }, { status: 404 });

  const data: Record<string, any> = {};
  for (const f of PLAYER_FIELDS) if (f in b) data[f] = b[f];
  if ("teamId" in data && data.teamId === "") data.teamId = null;

  const player = await prisma.player.update({ where: { id: params.id }, data });

  // Log a roster move if the team actually changed.
  if ("teamId" in data && data.teamId !== existing.teamId) {
    await prisma.rosterMove.create({
      data: {
        playerId: player.id,
        type: data.teamId ? "transfer" : "release",
        fromTeamId: existing.teamId,
        toTeamId: data.teamId || null,
        reliability: "confirmed",
        note: b.moveNote ?? "Admin roster update.",
      },
    });
  }

  return NextResponse.json({ player });
}

// Manual projection override. Admin-only.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const b = await req.json();
  const proj = await prisma.projection.update({
    where: { playerId: params.id },
    data: { ...b, computedAt: new Date() },
  });
  return NextResponse.json({ projection: proj });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  await prisma.player.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
