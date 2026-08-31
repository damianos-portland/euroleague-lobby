// ---------------------------------------------------------------------------
// Server-side draft orchestration (DB-backed). Wraps the pure logic in
// lib/draft.ts with persistence + validation.
// ---------------------------------------------------------------------------

import { prisma } from "./db";
import { Position } from "./types";
import {
  DraftablePlayer,
  seatForPick,
  parseRoundOrders,
  roundAndPick,
  totalPicks,
  requiredPositionsRemaining,
  advise,
  autoPick as pickBest,
  gradeRoster,
  rosterNeeds,
} from "./draft";

function toDraftable(p: any): DraftablePlayer {
  return {
    id: p.id,
    name: `${p.firstName} ${p.lastName}`,
    position: p.position as Position,
    teamShort: p.team?.shortName ?? null,
    fantasyPrice: p.fantasyPrice,
    projFantasyPoints: p.projection?.projFantasyPoints ?? 0,
    valueScore: p.projection?.valueScore ?? 0,
    upsideScore: p.projection?.upsideScore ?? 0,
    consistencyScore: p.projection?.consistencyScore ?? 0,
    riskAdjustedValue: p.projection?.riskAdjustedValue ?? 0,
    recommendation: p.projection?.recommendation ?? "",
  };
}

export async function loadDraftState(roomId: string) {
  const room = await prisma.draftRoom.findUnique({
    where: { id: roomId },
    include: {
      participants: { orderBy: { draftOrder: "asc" } },
      picks: {
        orderBy: { overall: "asc" },
        include: { player: { include: { team: true, projection: true } }, participant: true },
      },
      queueItems: {
        orderBy: { rank: "asc" },
        include: { player: { include: { team: true, projection: true } } },
      },
    },
  });
  if (!room) return null;

  const allPlayers = await prisma.player.findMany({ include: { team: true, projection: true } });
  const draftedIds = new Set(room.picks.map((p) => p.playerId));
  const available = allPlayers
    .filter((p) => !draftedIds.has(p.id))
    .map(toDraftable)
    .sort((a, b) => b.projFantasyPoints - a.projFantasyPoints);

  const n = room.participants.length;
  const tp = totalPicks(n, room.rounds);
  const complete = room.currentPickIndex >= tp || room.status === "complete";

  // Picks grouped by participant.
  const picksByParticipant = new Map<string, DraftablePlayer[]>();
  for (const part of room.participants) picksByParticipant.set(part.id, []);
  for (const pick of room.picks) {
    picksByParticipant.get(pick.participantId)?.push(toDraftable(pick.player));
  }

  const roundOrders = room.roundMode === "relottery" ? parseRoundOrders(room.roundOrders) : null;
  const onTheClockOrder = complete ? -1 : seatForPick(room.currentPickIndex, n, roundOrders);
  const onTheClock = room.participants.find((p) => p.draftOrder === onTheClockOrder) ?? null;
  const { round, pickInRound } = roundAndPick(room.currentPickIndex, n);

  const queueByParticipant = new Map<string, DraftablePlayer[]>();
  for (const q of room.queueItems) {
    if (draftedIds.has(q.playerId)) continue;
    const arr = queueByParticipant.get(q.participantId) ?? [];
    arr.push(toDraftable(q.player));
    queueByParticipant.set(q.participantId, arr);
  }

  const participants = room.participants.map((part) => {
    const roster = picksByParticipant.get(part.id) ?? [];
    const positions = roster.map((r) => r.position);
    const needs = rosterNeeds(room.rosterSlots, positions);
    const missingRequired = requiredPositionsRemaining(room.rosterSlots, positions);
    return {
      id: part.id,
      teamName: part.teamName,
      draftOrder: part.draftOrder,
      userId: part.userId,
      isAutopick: part.isAutopick,
      roster,
      queue: queueByParticipant.get(part.id) ?? [],
      filled: needs.filled,
      missing: needs.missing,
      missingRequired,
      grade: gradeRoster(roster),
      onClock: onTheClock?.id === part.id,
    };
  });

  return {
    room: {
      id: room.id, name: room.name, status: room.status, rounds: room.rounds,
      pickSeconds: room.pickSeconds, rosterSlots: room.rosterSlots,
      currentPickIndex: room.currentPickIndex, season: room.season,
    },
    participants,
    picks: room.picks.map((p) => ({
      overall: p.overall, round: p.round, pickInRound: p.pickInRound, auto: p.auto,
      teamName: p.participant.teamName, player: toDraftable(p.player),
    })),
    available,
    onTheClock: onTheClock ? { id: onTheClock.id, teamName: onTheClock.teamName } : null,
    round, pickInRound, totalPicks: tp, complete,
  };
}

export type DraftState = NonNullable<Awaited<ReturnType<typeof loadDraftState>>>;

// Make a pick for the participant currently on the clock (or a specified one).
export async function makePick(roomId: string, playerId: string, opts: { auto?: boolean } = {}) {
  const room = await prisma.draftRoom.findUnique({
    where: { id: roomId },
    include: { participants: { orderBy: { draftOrder: "asc" } }, picks: true },
  });
  if (!room) throw new Error("Room not found");
  if (room.status !== "drafting") throw new Error("Draft is not active");

  const n = room.participants.length;
  const tp = totalPicks(n, room.rounds);
  if (room.currentPickIndex >= tp) throw new Error("Draft complete");

  if (room.picks.some((p) => p.playerId === playerId)) throw new Error("Player already drafted");

  const roundOrders = room.roundMode === "relottery" ? parseRoundOrders(room.roundOrders) : null;
  const orderIdx = seatForPick(room.currentPickIndex, n, roundOrders);
  const participant = room.participants.find((p) => p.draftOrder === orderIdx);
  if (!participant) throw new Error("No participant on the clock");

  const { round, pickInRound } = roundAndPick(room.currentPickIndex, n);
  await prisma.draftPick.create({
    data: {
      roomId, participantId: participant.id, playerId,
      overall: room.currentPickIndex, round, pickInRound, auto: !!opts.auto,
    },
  });

  // Clean any queue entries for this player.
  await prisma.draftQueueItem.deleteMany({ where: { roomId, playerId } });

  const nextIndex = room.currentPickIndex + 1;
  await prisma.draftRoom.update({
    where: { id: roomId },
    data: { currentPickIndex: nextIndex, status: nextIndex >= tp ? "complete" : "drafting" },
  });
}

export async function autoPickCurrent(roomId: string) {
  const state = await loadDraftState(roomId);
  if (!state || state.complete || !state.onTheClock) return;
  const part = state.participants.find((p) => p.id === state.onTheClock!.id)!;

  // Respect the participant's queue first if it has an available player.
  const queue = await prisma.draftQueueItem.findMany({
    where: { roomId, participantId: part.id },
    orderBy: { rank: "asc" },
  });
  const availIds = new Set(state.available.map((a) => a.id));
  const queued = queue.find((q) => availIds.has(q.playerId));

  const choice = queued
    ? state.available.find((a) => a.id === queued.playerId)!
    : pickBest(state.available, part.roster.map((r) => r.position), state.room.rosterSlots);

  if (choice) await makePick(roomId, choice.id, { auto: true });
}

export async function undoLastPick(roomId: string) {
  const last = await prisma.draftPick.findFirst({ where: { roomId }, orderBy: { overall: "desc" } });
  if (!last) return;
  await prisma.draftPick.delete({ where: { id: last.id } });
  await prisma.draftRoom.update({
    where: { id: roomId },
    data: { currentPickIndex: last.overall, status: "drafting" },
  });
}

export async function setStatus(roomId: string, status: "drafting" | "paused" | "lobby" | "complete") {
  await prisma.draftRoom.update({ where: { id: roomId }, data: { status } });
}

// Advice lenses for the on-the-clock (or given) participant.
export function adviceFor(state: DraftState, participantId: string) {
  const part = state.participants.find((p) => p.id === participantId);
  if (!part) return null;
  const positions = part.roster.map((r) => r.position);
  const slots = state.room.rosterSlots;
  return {
    best: advise(state.available, positions, slots, "best", 6),
    fit: advise(state.available, positions, slots, "fit", 6),
    upside: advise(state.available, positions, slots, "upside", 6),
    safe: advise(state.available, positions, slots, "safe", 6),
    avoid: advise(state.available, positions, slots, "avoid", 6),
  };
}
