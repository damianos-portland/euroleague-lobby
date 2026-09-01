import { NextRequest, NextResponse } from "next/server";
import { loadDraftState, adviceFor } from "@/lib/draftServer";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { requireAdmin } from "@/lib/authz";

// Full draft state (+ optional advice for ?participant=ID). `viewer` tells the
// client who is watching, so it can show controls only for their own slot.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const state = await loadDraftState(params.id);
  if (!state) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const session = await auth();
  const participantId = req.nextUrl.searchParams.get("participant");
  const advice = participantId ? adviceFor(state, participantId) : null;
  return NextResponse.json({
    state,
    advice,
    viewer: session?.user ? { id: session.user.id, role: session.user.role } : null,
  });
}

// Assign (or clear) the user that controls a participant slot (admin-only).
// Body: { participantId, userId }  — userId null/"" clears it (CPU / auto-pick).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { participantId, userId } = await req.json().catch(() => ({}));
  if (!participantId) return NextResponse.json({ error: "participantId required" }, { status: 400 });

  const participant = await prisma.draftParticipant.findFirst({
    where: { id: participantId, roomId: params.id },
  });
  if (!participant) return NextResponse.json({ error: "Participant not found" }, { status: 404 });

  const uid = userId ? String(userId) : null;
  if (uid) {
    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    // A user can hold only one slot per room.
    const clash = await prisma.draftParticipant.findFirst({
      where: { roomId: params.id, userId: uid, NOT: { id: participantId } },
    });
    if (clash) {
      return NextResponse.json({ error: "Ο χρήστης είναι ήδη σε άλλη θέση αυτού του room." }, { status: 409 });
    }
  }

  await prisma.draftParticipant.update({
    where: { id: participantId },
    // A human-controlled slot shouldn't auto-pick; a cleared slot goes back to CPU.
    data: { userId: uid, isAutopick: uid ? false : true },
  });
  return NextResponse.json({ ok: true });
}

// Delete a draft room (admin-only). Cascades to participants/picks/queue.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  await prisma.draftRoom.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
