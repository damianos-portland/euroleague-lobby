import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  makePick,
  autoPickCurrent,
  undoLastPick,
  setStatus,
  loadDraftState,
} from "@/lib/draftServer";

// Consolidated draft actions: start | pause | resume | pick | autopick | undo |
// queueAdd | queueRemove | toggleAutopick
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const roomId = params.id;
  const body = await req.json();
  const action: string = body.action;

  try {
    switch (action) {
      case "start":
      case "resume":
        await setStatus(roomId, "drafting");
        break;
      case "pause":
        await setStatus(roomId, "paused");
        break;
      case "pick":
        if (!body.playerId) throw new Error("playerId required");
        await makePick(roomId, body.playerId);
        break;
      case "autopick":
        await autoPickCurrent(roomId);
        break;
      case "undo":
        await undoLastPick(roomId);
        break;
      case "queueAdd": {
        if (!body.participantId || !body.playerId) throw new Error("participantId & playerId required");
        const count = await prisma.draftQueueItem.count({ where: { participantId: body.participantId } });
        await prisma.draftQueueItem.upsert({
          where: { participantId_playerId: { participantId: body.participantId, playerId: body.playerId } },
          create: { roomId, participantId: body.participantId, playerId: body.playerId, rank: count },
          update: {},
        });
        break;
      }
      case "queueRemove":
        await prisma.draftQueueItem.deleteMany({
          where: { participantId: body.participantId, playerId: body.playerId },
        });
        break;
      case "toggleAutopick":
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
