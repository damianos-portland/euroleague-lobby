// ---------------------------------------------------------------------------
// Server-side orchestration for friendly-match simulations (DB-backed).
// A friendly is scoped to ONE draft room: each side plays the roster it drafted
// there (its DraftParticipant's picks). Wraps the pure sim engine in
// lib/friendly.ts with persistence, lineup validation, and web-push.
// ---------------------------------------------------------------------------

import { prisma } from "./db";
import { sendPushToUser } from "./push";
import { fantasyBucket, FantasyBucket } from "./draft";
import {
  simulateMatch,
  validateLineup,
  LineupJSON,
  SimPlayerInput,
  MatchTimeline,
  MATCH_DURATION_MS,
  STARTER_QUOTA,
  BENCH_COUNT,
} from "./friendly";

export type FriendlyAction = "accept" | "decline" | "cancel" | "setLineup" | "ready";

// Minimum a drafted roster needs to field a legal 2G/2F/1C + 5 bench lineup.
const MIN_TEAM_TOTAL = STARTER_QUOTA.G + STARTER_QUOTA.F + STARTER_QUOTA.C + BENCH_COUNT; // 10

const POOL_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  position: true,
  team: { select: { shortName: true } },
  projection: {
    select: { projFantasyPoints: true, projUsage: true, projMinutes: true },
  },
} as const;

export interface PoolPlayer {
  id: string;
  name: string;
  position: string;
  bucket: FantasyBucket;
  teamShort: string | null;
  projFantasyPoints: number;
}

function rowToPool(p: any): PoolPlayer {
  return {
    id: p.id,
    name: `${p.firstName} ${p.lastName}`,
    position: p.position,
    bucket: fantasyBucket(p.position),
    teamShort: p.team?.shortName ?? null,
    projFantasyPoints: p.projection?.projFantasyPoints ?? 0,
  };
}

// The players a DraftParticipant drafted, as a lineup-selectable roster.
async function rosterOf(participantId: string): Promise<PoolPlayer[]> {
  const picks = await prisma.draftPick.findMany({
    where: { participantId },
    select: { player: { select: POOL_SELECT } },
  });
  return picks.map((p) => rowToPool(p.player)).sort((a, b) => b.projFantasyPoints - a.projFantasyPoints);
}

function bucketCounts(players: { bucket: FantasyBucket }[]): Record<FantasyBucket, number> {
  const c: Record<FantasyBucket, number> = { G: 0, F: 0, C: 0 };
  for (const p of players) c[p.bucket]++;
  return c;
}

// A roster can field a legal lineup only if it has enough at each position.
function rosterIsPlayable(players: PoolPlayer[]): boolean {
  if (players.length < MIN_TEAM_TOTAL) return false;
  const c = bucketCounts(players);
  return c.G >= STARTER_QUOTA.G && c.F >= STARTER_QUOTA.F && c.C >= STARTER_QUOTA.C;
}

export interface ChallengeableRoom {
  roomId: string;
  roomName: string;
  myParticipantId: string;
  myTeamName: string;
  opponents: { participantId: string; teamName: string; userId: string; userName: string }[];
}

// Rooms where the caller has a playable drafted team AND at least one other
// real user has a playable team to be challenged.
export async function listChallengeableRooms(userId: string): Promise<ChallengeableRoom[]> {
  const rooms = await prisma.draftRoom.findMany({
    where: { participants: { some: { userId } } },
    select: {
      id: true,
      name: true,
      participants: {
        select: {
          id: true,
          teamName: true,
          userId: true,
          user: { select: { name: true, email: true } },
          _count: { select: { picks: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const out: ChallengeableRoom[] = [];
  for (const room of rooms) {
    const mine = room.participants.find((p) => p.userId === userId);
    if (!mine) continue;
    const myRoster = await rosterOf(mine.id);
    if (!rosterIsPlayable(myRoster)) continue;

    const opponents: ChallengeableRoom["opponents"] = [];
    for (const p of room.participants) {
      if (!p.userId || p.userId === userId) continue;
      if (p._count.picks < MIN_TEAM_TOTAL) continue;
      const roster = await rosterOf(p.id);
      if (!rosterIsPlayable(roster)) continue;
      opponents.push({
        participantId: p.id,
        teamName: p.teamName,
        userId: p.userId,
        userName: p.user?.name || p.user?.email || "Παίκτης",
      });
    }
    if (opponents.length === 0) continue;
    out.push({
      roomId: room.id,
      roomName: room.name,
      myParticipantId: mine.id,
      myTeamName: mine.teamName,
      opponents,
    });
  }
  return out;
}

// Resolve SimPlayerInput[] for a set of player ids (order preserved).
async function simInputs(ids: string[]): Promise<SimPlayerInput[]> {
  const rows = await prisma.player.findMany({ where: { id: { in: ids } }, select: POOL_SELECT });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      position: p.position,
      projFantasyPoints: p.projection?.projFantasyPoints ?? 6,
      projUsage: p.projection?.projUsage ?? 18,
      projMinutes: p.projection?.projMinutes ?? 20,
    }));
}

// Create a room-scoped challenge (status "pending") and notify the opponent.
export async function createChallenge(
  challengerId: string,
  opts: { roomId: string; opponentParticipantId: string; mode: string }
) {
  const safeMode = opts.mode === "fantasy" ? "fantasy" : "score";
  const room = await prisma.draftRoom.findUnique({
    where: { id: opts.roomId },
    select: { id: true, name: true, participants: { select: { id: true, teamName: true, userId: true } } },
  });
  if (!room) throw new Error("Άγνωστο draft room.");

  const mine = room.participants.find((p) => p.userId === challengerId);
  if (!mine) throw new Error("Δεν έχεις ομάδα σε αυτό το room.");
  const opp = room.participants.find((p) => p.id === opts.opponentParticipantId);
  if (!opp || !opp.userId) throw new Error("Άγνωστος αντίπαλος.");
  if (opp.userId === challengerId) throw new Error("Δεν μπορείς να προκαλέσεις τον εαυτό σου.");

  const [myRoster, oppRoster] = await Promise.all([rosterOf(mine.id), rosterOf(opp.id)]);
  if (!rosterIsPlayable(myRoster)) throw new Error("Η ομάδα σου δεν έχει αρκετούς παίκτες (χρειάζεται 2G/2F/1C + πάγκο).");
  if (!rosterIsPlayable(oppRoster)) throw new Error("Η ομάδα του αντιπάλου δεν έχει αρκετούς παίκτες.");

  const match = await prisma.friendlyMatch.create({
    data: {
      challengerId,
      opponentId: opp.userId,
      mode: safeMode,
      status: "pending",
      roomId: room.id,
      roomName: room.name,
      challengerParticipantId: mine.id,
      opponentParticipantId: opp.id,
      challengerTeamName: mine.teamName,
      opponentTeamName: opp.teamName,
    },
    include: { challenger: { select: { name: true } } },
  });

  await sendPushToUser(opp.userId, {
    title: "🏀 Πρόκληση σε φιλικό!",
    body: `${match.challenger?.name ?? "Κάποιος"} (${mine.teamName}) σε προκαλεί σε ${
      safeMode === "fantasy" ? "μάχη fantasy πόντων" : "φιλικό αγώνα"
    }.`,
    url: `/friendly/${match.id}`,
    tag: `friendly-${match.id}`,
  }).catch(() => {});

  return match;
}

interface MatchView {
  id: string;
  mode: string;
  status: string;
  role: "challenger" | "opponent";
  roomName: string | null;
  me: { id: string; name: string; teamName: string | null; ready: boolean; lineup: LineupJSON | null; roster: PoolPlayer[] };
  them: { id: string; name: string; teamName: string | null; ready: boolean; hasLineup: boolean };
  startedAt: string | null;
  durationMs: number;
  timeline: MatchTimeline | null;
  sides: { challengerId: string; opponentId: string } | null;
  result: {
    challengerScore: number | null;
    opponentScore: number | null;
    challengerFp: number | null;
    opponentFp: number | null;
    winnerId: string | null;
    mvpPlayerId: string | null;
  } | null;
}

const parseLineup = (s: string | null): LineupJSON | null => {
  if (!s) return null;
  try {
    return JSON.parse(s) as LineupJSON;
  } catch {
    return null;
  }
};

// Load a match from `userId`'s perspective. Lazily flips finished playback to
// "complete". Returns null if the user isn't a participant.
export async function loadMatchView(matchId: string, userId: string): Promise<MatchView | null> {
  let m = await prisma.friendlyMatch.findUnique({
    where: { id: matchId },
    include: {
      challenger: { select: { id: true, name: true } },
      opponent: { select: { id: true, name: true } },
    },
  });
  if (!m) return null;
  if (m.challengerId !== userId && m.opponentId !== userId) return null;

  if (m.status === "live" && m.startedAt && Date.now() - m.startedAt.getTime() >= MATCH_DURATION_MS + 1500) {
    m = await prisma.friendlyMatch.update({
      where: { id: matchId },
      data: { status: "complete" },
      include: {
        challenger: { select: { id: true, name: true } },
        opponent: { select: { id: true, name: true } },
      },
    });
  }

  const role: "challenger" | "opponent" = m.challengerId === userId ? "challenger" : "opponent";
  const isChal = role === "challenger";

  const myParticipantId = isChal ? m.challengerParticipantId : m.opponentParticipantId;
  // Only load the roster while still building — after tip-off it's not needed.
  const roster =
    m.status === "building" && myParticipantId ? await rosterOf(myParticipantId) : [];

  const meLineup = parseLineup(isChal ? m.challengerLineup : m.opponentLineup);
  const themLineupRaw = isChal ? m.opponentLineup : m.challengerLineup;

  const live = m.status === "live" || m.status === "complete";
  const timeline = live && m.timeline ? (JSON.parse(m.timeline) as MatchTimeline) : null;

  return {
    id: m.id,
    mode: m.mode,
    status: m.status,
    role,
    roomName: m.roomName,
    me: {
      id: userId,
      name: (isChal ? m.challenger?.name : m.opponent?.name) ?? "Εγώ",
      teamName: isChal ? m.challengerTeamName : m.opponentTeamName,
      ready: isChal ? m.challengerReady : m.opponentReady,
      lineup: meLineup,
      roster,
    },
    them: {
      id: isChal ? m.opponentId : m.challengerId,
      name: (isChal ? m.opponent?.name : m.challenger?.name) ?? "Αντίπαλος",
      teamName: isChal ? m.opponentTeamName : m.challengerTeamName,
      ready: isChal ? m.opponentReady : m.challengerReady,
      hasLineup: !!themLineupRaw,
    },
    startedAt: m.startedAt ? m.startedAt.toISOString() : null,
    durationMs: MATCH_DURATION_MS,
    timeline,
    sides: live ? { challengerId: m.challengerId, opponentId: m.opponentId } : null,
    result: live
      ? {
          challengerScore: m.challengerScore,
          opponentScore: m.opponentScore,
          challengerFp: m.challengerFp,
          opponentFp: m.opponentFp,
          winnerId: m.winnerId,
          mvpPlayerId: m.mvpPlayerId,
        }
      : null,
  };
}

// List a user's matches (both sides) for the lobby, newest first.
export async function listMatches(userId: string) {
  const rows = await prisma.friendlyMatch.findMany({
    where: { OR: [{ challengerId: userId }, { opponentId: userId }] },
    orderBy: { updatedAt: "desc" },
    take: 40,
    include: {
      challenger: { select: { id: true, name: true } },
      opponent: { select: { id: true, name: true } },
    },
  });
  return rows.map((m) => {
    const isChal = m.challengerId === userId;
    return {
      id: m.id,
      mode: m.mode,
      status: m.status,
      role: isChal ? "challenger" : "opponent",
      opponentName: (isChal ? m.opponent?.name : m.challenger?.name) ?? "—",
      opponentTeam: (isChal ? m.opponentTeamName : m.challengerTeamName) ?? null,
      myTeam: (isChal ? m.challengerTeamName : m.opponentTeamName) ?? null,
      roomName: m.roomName,
      winnerId: m.winnerId,
      iWon: m.status === "complete" && m.winnerId != null ? m.winnerId === userId : null,
      updatedAt: m.updatedAt.toISOString(),
    };
  });
}

// Handle an action on a match. Returns the fresh view for the caller.
export async function actOnMatch(
  matchId: string,
  userId: string,
  action: FriendlyAction,
  payload?: { lineup?: LineupJSON }
): Promise<MatchView> {
  const m = await prisma.friendlyMatch.findUnique({ where: { id: matchId } });
  if (!m) throw new Error("Το φιλικό δεν βρέθηκε.");
  if (m.challengerId !== userId && m.opponentId !== userId) throw new Error("Δεν συμμετέχεις σε αυτό το φιλικό.");
  const isChal = m.challengerId === userId;

  switch (action) {
    case "accept": {
      if (isChal) throw new Error("Μόνο ο αντίπαλος αποδέχεται.");
      if (m.status !== "pending") throw new Error("Η πρόκληση δεν είναι πλέον διαθέσιμη.");
      await prisma.friendlyMatch.update({ where: { id: matchId }, data: { status: "building" } });
      await sendPushToUser(m.challengerId, {
        title: "✅ Η πρόκληση έγινε δεκτή!",
        body: "Στήσε τη σύνθεσή σου για το φιλικό.",
        url: `/friendly/${matchId}`,
        tag: `friendly-${matchId}`,
      }).catch(() => {});
      break;
    }
    case "decline": {
      if (isChal) throw new Error("Μόνο ο αντίπαλος απορρίπτει.");
      if (m.status !== "pending") throw new Error("Η πρόκληση δεν είναι πλέον διαθέσιμη.");
      await prisma.friendlyMatch.update({ where: { id: matchId }, data: { status: "declined" } });
      await sendPushToUser(m.challengerId, {
        title: "❌ Η πρόκληση απορρίφθηκε",
        body: "Ο αντίπαλος δεν αποδέχτηκε το φιλικό.",
        url: `/friendly`,
        tag: `friendly-${matchId}`,
      }).catch(() => {});
      break;
    }
    case "cancel": {
      if (m.status === "live" || m.status === "complete") throw new Error("Το φιλικό έχει ήδη ξεκινήσει.");
      await prisma.friendlyMatch.update({ where: { id: matchId }, data: { status: "cancelled" } });
      break;
    }
    case "setLineup": {
      if (m.status !== "building") throw new Error("Δεν μπορείς να αλλάξεις σύνθεση τώρα.");
      const lineup = payload?.lineup;
      if (!lineup) throw new Error("Λείπει η σύνθεση.");
      const participantId = isChal ? m.challengerParticipantId : m.opponentParticipantId;
      if (!participantId) throw new Error("Δεν βρέθηκε η ομάδα σου.");
      const roster = await rosterOf(participantId);
      const bucketOf = (id: string) => roster.find((p) => p.id === id)?.bucket ?? null;
      const allowed = new Set(roster.map((p) => p.id));
      const v = validateLineup(lineup, bucketOf, allowed);
      if (!v.ok) throw new Error(v.error);
      await prisma.friendlyMatch.update({
        where: { id: matchId },
        data: isChal
          ? { challengerLineup: JSON.stringify(lineup), challengerReady: false }
          : { opponentLineup: JSON.stringify(lineup), opponentReady: false },
      });
      break;
    }
    case "ready": {
      if (m.status !== "building") throw new Error("Δεν είναι η ώρα για ετοιμότητα.");
      const myLineup = parseLineup(isChal ? m.challengerLineup : m.opponentLineup);
      if (!myLineup) throw new Error("Πρώτα δήλωσε σύνθεση.");
      const updated = await prisma.friendlyMatch.update({
        where: { id: matchId },
        data: isChal ? { challengerReady: true } : { opponentReady: true },
      });
      if (updated.challengerReady && updated.opponentReady && updated.status === "building") {
        await generateAndStart(matchId);
      }
      break;
    }
  }

  const view = await loadMatchView(matchId, userId);
  if (!view) throw new Error("Αποτυχία φόρτωσης.");
  return view;
}

// Simulate the match, persist the timeline + result, flip to live, notify both.
async function generateAndStart(matchId: string) {
  const m = await prisma.friendlyMatch.findUnique({ where: { id: matchId } });
  if (!m || m.status !== "building") return;
  const chal = parseLineup(m.challengerLineup);
  const opp = parseLineup(m.opponentLineup);
  if (!chal || !opp) return;

  const [chalInputs, oppInputs] = await Promise.all([
    simInputs([...chal.starters, ...chal.bench]),
    simInputs([...opp.starters, ...opp.bench]),
  ]);

  const timeline = simulateMatch(chalInputs, oppInputs, new Set(chal.starters), new Set(opp.starters));

  let winnerId: string | null;
  if (m.mode === "fantasy") {
    winnerId =
      timeline.fp.home > timeline.fp.away ? m.challengerId : timeline.fp.away > timeline.fp.home ? m.opponentId : null;
  } else {
    winnerId =
      timeline.final.home > timeline.final.away
        ? m.challengerId
        : timeline.final.away > timeline.final.home
        ? m.opponentId
        : null;
  }

  await prisma.friendlyMatch.update({
    where: { id: matchId },
    data: {
      status: "live",
      startedAt: new Date(),
      timeline: JSON.stringify(timeline),
      challengerScore: timeline.final.home,
      opponentScore: timeline.final.away,
      challengerFp: timeline.fp.home,
      opponentFp: timeline.fp.away,
      winnerId,
      mvpPlayerId: timeline.mvpPlayerId,
    },
  });

  for (const uid of [m.challengerId, m.opponentId]) {
    sendPushToUser(uid, {
      title: "🔴 Το φιλικό ξεκίνησε!",
      body: "Μπες τώρα να δεις τον αγώνα ζωντανά.",
      url: `/friendly/${matchId}`,
      tag: `friendly-${matchId}`,
    }).catch(() => {});
  }
}
