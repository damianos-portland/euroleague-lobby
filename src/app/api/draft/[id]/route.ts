import { NextRequest, NextResponse } from "next/server";
import { loadDraftState, adviceFor } from "@/lib/draftServer";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";

// Full draft state (+ optional advice for ?participant=ID).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const state = await loadDraftState(params.id);
  if (!state) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const participantId = req.nextUrl.searchParams.get("participant");
  const advice = participantId ? adviceFor(state, participantId) : null;
  return NextResponse.json({ state, advice });
}

// Delete a draft room (admin-only). Cascades to participants/picks/queue.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  await prisma.draftRoom.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
