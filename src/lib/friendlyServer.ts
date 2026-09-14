// ---------------------------------------------------------------------------
// Server-side orchestration for friendly-match simulations (DB-backed).
// Wraps the pure sim engine in lib/friendly.ts with persistence, lineup
// validation, and web-push notifications.
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
} from "./friendly";

export type FriendlyAction = "accept" | "decline" | "cancel" | "setLineup" | "ready";

// Slim player row for lineup building — id, name, position, projection bits.
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

// The full pool a user picks a lineup from (all players, once, cached client-side).
export async function loadFriendlyPool(): Promise<PoolPlayer[]> {
  const rows = await prisma.player.findMany({ select: POOL_SELECT });
  return rows
    .map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      position: p.position,
      bucket: fantasyBucket(p.position),
      teamShort: p.team?.shortName ?? null,
      projFantasyPoints: p.projection?.projFantasyPoints ?? 0,
    }))
    .sort((a, b) => b.projFantasyPoints - a.projFantasyPoints);
}

// Resolve the SimPlayerInput[] for a set of player ids (order preserved).
async function simInputs(ids: string[]): Promise<SimPlayerInput[]> {
  const rows = await prisma.player.findMany({
    where: { id: { in: ids } },
    select: POOL_SELECT,
  });
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

// bucketOf lookup for lineup validation, backed by the DB.
async function bucketResolver(ids: string[]): Promise<(id: string) => FantasyBucket | null> {
  const rows = await prisma.player.findMany({
    where: { id: { in: ids } },
    select: { id: true, position: true },
  });
  const map = new Map(rows.map((r) => [r.id, fantasyBucket(r.position)]));
  return (id: string) => map.get(id) ?? null;
}

// Create a challenge (status "pending") and notify the opponent.
export async function createChallenge(challengerId: string, opponentId: string, mode: string) {
  if (challengerId === opponentId) throw new Error("Δεν μπορείς να προκαλέσεις τον εαυτό σου.");
  const safeMode = mode === "fantasy" ? "fantasy" : "score";
  const opp = await prisma.user.findUnique({ where: { id: opponentId }, select: { id: true } });
  if (!opp) throw new Error("Άγνωστος αντίπαλος.");

  const match = await prisma.friendlyMatch.create({
    data: { challengerId, opponentId, mode: safeMode, status: "pending" },
    include: { challenger: { select: { name: true } } },
  });

  await sendPushToUser(opponentId, {
    title: "🏀 Πρόκληση σε φιλικό!",
    body: `${match.challenger?.name ?? "Κάποιος"} σε προκαλεί σε ${safeMode === "fantasy" ? "μάχη fantasy πόντων" : "φιλικό αγώνα"}.`,
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
  me: { id: string; name: string; ready: boolean; lineup: LineupJSON | null };
  them: { id: string; name: string; ready: boolean; hasLineup: boolean };
  startedAt: string | null;
  durationMs: number;
  // Revealed only once the game is live/complete:
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

// Load a match from the perspective of `userId`. Lazily flips a finished
// playback to "complete". Returns null if the user isn't a participant.
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

  // Lazily complete a match whose playback window has elapsed.
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

  const meLineup = parseLineup(isChal ? m.challengerLineup : m.opponentLineup);
  const themLineupRaw = isChal ? m.opponentLineup : m.challengerLineup;

  const live = m.status === "live" || m.status === "complete";
  const timeline = live && m.timeline ? (JSON.parse(m.timeline) as MatchTimeline) : null;

  return {
    id: m.id,
    mode: m.mode,
    status: m.status,
    role,
    me: {
      id: userId,
      name: (isChal ? m.challenger?.name : m.opponent?.name) ?? "Εγώ",
      ready: isChal ? m.challengerReady : m.opponentReady,
      lineup: meLineup,
    },
    them: {
      id: isChal ? m.opponentId : m.challengerId,
      name: (isChal ? m.opponent?.name : m.challenger?.name) ?? "Αντίπαλος",
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
      winnerId: m.winnerId,
      iWon: m.status === "complete" && m.winnerId != null ? m.winnerId === userId : null,
      updatedAt: m.updatedAt.toISOString(),
    };
  });
}

// Users you can challenge (everyone except yourself).
export async function listOpponents(userId: string) {
  const rows = await prisma.user.findMany({
    where: { id: { not: userId } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return rows.map((u) => ({ id: u.id, name: u.name || u.email || "Παίκτης" }));
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
        body: "Φτιάξε τη σύνθεσή σου για το φιλικό.",
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
      const bucketOf = await bucketResolver([...(lineup.starters || []), ...(lineup.bench || [])]);
      const v = validateLineup(lineup, bucketOf);
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
      // Both ready → generate the timeline and tip off.
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

  const chalIds = [...chal.starters, ...chal.bench];
  const oppIds = [...opp.starters, ...opp.bench];
  const [chalInputs, oppInputs] = await Promise.all([simInputs(chalIds), simInputs(oppIds)]);

  const timeline = simulateMatch(
    chalInputs,
    oppInputs,
    new Set(chal.starters),
    new Set(opp.starters)
  );

  // Winner depends on the chosen mode.
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
