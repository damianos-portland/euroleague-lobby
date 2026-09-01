import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import {
  makePick,
  autoPickCurrent,
  undoLastPick,
  setStatus,
  loadDraftState,
  onClockParticipant,
} from "@/lib/draftServer";

// Consolidated draft actions: start | pause | resume | pick | autopick | undo |
// queueAdd | queueRemove | toggleAutopick
//
// Authorization:
//  - start/pause/resume/undo  → admin only (host controls)
//  - pick                     → admin, or the user whose slot is on the clock
//  - autopick                 → admin, or anyone when a CPU slot is on the clock
//  - queueAdd/Remove/toggle   → admin, or the owner of that participant slot
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const roomId = params.id;
  const body = await req.json();
  const action: string = body.action;

  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = session.user.role === "admin";
  const uid = session.user.id;
  const forbidden = () => NextResponse.json({ error: "Δεν έχεις δικαίωμα γι' αυτή την ενέργεια." }, { status: 403 });

  // Helper: does the current user own a given participant slot?
  async function ownsSlot(participantId: string) {
    const p = await prisma.draftParticipant.findFirst({ where: { id: participantId, roomId } });
    return !!p && p.userId === uid;
  }

  try {
    switch (action) {
      case "start":
      case "resume":
        if (!isAdmin) return forbidden();
        await setStatus(roomId, "drafting");
        break;
      case "pause":
        if (!isAdmin) return forbidden();
        await setStatus(roomId, "paused");
        break;
      case "pick": {
        if (!body.playerId) throw new Error("playerId required");
        if (!isAdmin) {
          const oc = await onClockParticipant(roomId);
          if (!oc || oc.userId !== uid) return forbidden();
        }
        await makePick(roomId, body.playerId);
        break;
      }
      case "autopick": {
        if (!isAdmin) {
          const oc = await onClockParticipant(roomId);
          // Non-admins may only advance a CPU (auto) slot, never a human's turn.
          if (!oc || !oc.isAutopick) return forbidden();
        }
        await autoPickCurrent(roomId);
        break;
      }
      case "undo":
        if (!isAdmin) return forbidden();
        await undoLastPick(roomId);
        break;
      case "queueAdd": {
        if (!body.participantId || !body.playerId) throw new Error("participantId & playerId required");
        if (!isAdmin && !(await ownsSlot(body.participantId))) return forbidden();
        const count = await prisma.draftQueueItem.count({ where: { participantId: body.participantId } });
        await prisma.draftQueueItem.upsert({
          where: { participantId_playerId: { participantId: body.participantId, playerId: body.playerId } },
          create: { roomId, participantId: body.participantId, playerId: body.playerId, rank: count },
          update: {},
        });
        break;
      }
      case "queueRemove":
        if (!isAdmin && !(await ownsSlot(body.participantId))) return forbidden();
        await prisma.draftQueueItem.deleteMany({
          where: { participantId: body.participantId, playerId: body.playerId },
        });
        break;
      case "toggleAutopick":
        if (!isAdmin && !(await ownsSlot(body.participantId))) return forbidden();
        await prisma.draftParticipant.update({
          where: { id: body.participantId },
          data: { isAutopick: !!body.value },
        });
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const state = await loadDraftState(roomId);
    return NextResponse.json({ ok: true, state });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Action failed" }, { status: 400 });
  }
}
