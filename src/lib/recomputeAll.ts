// Recompute every player's projection + value from current DB state.
// Called by the admin "Recalculate projections" action and usable from a
// weekly cron once live box scores arrive.

import { prisma } from "./db";
import { buildTeamContext, RosterMember } from "./context";
import { computeForPlayer } from "./recompute";
import { Position, DepthRole, PlayerStatus, SeasonStatLine } from "./types";

const PROJ_SEASON = "2025-26";
const LEAGUE_AVG = { pace: 72, offRating: 110, defRating: 110, fantasyFriendliness: 50 };

// Synthesise a plausible per-game line from a fantasy credit, for newcomers
// with no EuroLeague history. impliedFP = credit × 1.2 (the fair anchor), split
// into components by position so player pages look sensible; moderate variance.
function creditBaselineLine(credit: number, position: Position): SeasonStatLine {
  const fp = Math.round(credit * 1.2 * 10) / 10;
  const minutes = Math.max(12, Math.min(30, Math.round(credit * 1.5)));
  const isC = position === "C" || position === "PF";
  const isG = position === "PG" || position === "SG";
  return {
    season: "credit-est",
    games: 20,
    minutes,
    points: Math.round(fp * (isG ? 0.5 : 0.48) * 10) / 10,
    rebounds: Math.round(fp * (isC ? 0.3 : 0.16) * 10) / 10,
    assists: Math.round(fp * (isG ? 0.2 : 0.1) * 10) / 10,
    steals: Math.round(fp * 0.04 * 10) / 10,
    blocks: Math.round(fp * (isC ? 0.05 : 0.02) * 10) / 10,
    turnovers: Math.round(fp * 0.1 * 10) / 10,
    usage: Math.max(14, Math.min(30, Math.round(12 + credit))),
    pir: Math.round(fp * 0.95 * 10) / 10,
    fantasyPoints: fp,
    fpStdev: Math.round(fp * 0.35 * 10) / 10,
  };
}

function toLine(s: any): SeasonStatLine | undefined {
  if (!s) return undefined;
  return {
    season: s.season, teamSnapshot: s.teamSnapshot ?? undefined, games: s.games,
    minutes: s.minutes, points: s.points, rebounds: s.rebounds, assists: s.assists,
    steals: s.steals, blocks: s.blocks, turnovers: s.turnovers, usage: s.usage,
    pir: s.pir, fantasyPoints: s.fantasyPoints, fpStdev: s.fpStdev,
  };
}

export async function recomputeAllProjections(): Promise<number> {
  const players = await prisma.player.findMany({
    include: { team: true, seasonStats: { orderBy: { season: "desc" } } },
  });

  // Group for context.
  const byTeam = new Map<string, RosterMember[]>();
  for (const p of players) {
    const key = p.teamId ?? "FA";
    if (!byTeam.has(key)) byTeam.set(key, []);
    byTeam.get(key)!.push({
      id: p.id, position: p.position as Position,
      depthRole: p.depthRole as DepthRole, fantasyPrice: p.fantasyPrice,
    });
  }
  const ctxById = new Map<string, { positionCompetition: number; availableUsageShare: number }>();
  for (const [, roster] of byTeam) for (const [id, c] of buildTeamContext(roster)) ctxById.set(id, c);

  let count = 0;
  for (const p of players) {
    // Newcomers with no EuroLeague history but a real fantasy credit get a
    // CREDIT-BASED baseline: the game's price already encodes the market's
    // expectation (e.g. Valančiūnas at 15.5cr), so we synthesise a stat line
    // from the credit and run it through the same engine — flagged as an
    // estimate. Departed / rosterless statless players stay projection-less.
    if (p.seasonStats.length === 0) {
      if (p.status === "departed" || !p.teamId || p.fantasyPrice < 4.5) continue;
      const ctx = ctxById.get(p.id) ?? { positionCompetition: 1, availableUsageShare: 0.95 };
      const line = creditBaselineLine(p.fantasyPrice, p.position as Position);
      const team = p.team
        ? { pace: p.team.pace, offRating: p.team.offRating, defRating: p.team.defRating, fantasyFriendliness: p.team.fantasyFriendliness }
        : LEAGUE_AVG;
      const { projection, value } = computeForPlayer({
        position: p.position as Position, age: p.age, depthRole: p.depthRole as DepthRole,
        status: p.status as PlayerStatus, fantasyPrice: p.fantasyPrice, changedTeam: true,
        positionCompetition: ctx.positionCompetition, availableUsageShare: ctx.availableUsageShare,
        team, last: line, prior: undefined,
      });
      projection.projectedRole = "Credit-based · χωρίς EL ιστορικό";
      await prisma.projection.upsert({
        where: { playerId: p.id },
        create: { playerId: p.id, season: PROJ_SEASON, ...projectionData(projection, value) },
        update: { ...projectionData(projection, value), computedAt: new Date() },
      });
      count++;
      continue;
    }
    const ctx = ctxById.get(p.id) ?? { positionCompetition: 1, availableUsageShare: 0.95 };
    const last = toLine(p.seasonStats[0]);
    const prior = toLine(p.seasonStats[1]);
    const team = p.team
      ? { pace: p.team.pace, offRating: p.team.offRating, defRating: p.team.defRating, fantasyFriendliness: p.team.fantasyFriendliness }
      : LEAGUE_AVG;

    const { projection, value } = computeForPlayer({
      position: p.position as Position, age: p.age, depthRole: p.depthRole as DepthRole,
      status: p.status as PlayerStatus, fantasyPrice: p.fantasyPrice,
      changedTeam: p.status === "free_agent" || (last?.teamSnapshot ? last.teamSnapshot !== p.team?.shortName : false),
      positionCompetition: ctx.positionCompetition, availableUsageShare: ctx.availableUsageShare,
      team, last, prior,
    });

    await prisma.projection.upsert({
      where: { playerId: p.id },
      create: {
        playerId: p.id, season: PROJ_SEASON,
        ...projectionData(projection, value),
      },
      update: { ...projectionData(projection, value), computedAt: new Date() },
    });
    count++;
  }
  return count;
}

function projectionData(projection: any, value: any) {
  return {
    projMinutes: projection.projMinutes, projUsage: projection.projUsage,
    projPoints: projection.projPoints, projRebounds: projection.projRebounds,
    projAssists: projection.projAssists, projSteals: projection.projSteals,
    projBlocks: projection.projBlocks, projTurnovers: projection.projTurnovers,
    projPir: projection.projPir, projFantasyPoints: projection.projFantasyPoints,
    valueScore: value.valueScore, pointsPerCredit: value.pointsPerCredit,
    riskAdjustedValue: value.riskAdjustedValue, upsideScore: value.upsideScore,
    consistencyScore: value.consistencyScore, injuryRisk: value.injuryRisk,
    ownershipPrediction: value.ownershipPrediction, recommendation: value.recommendation,
    signal: value.signal, rationale: value.rationale, projectedRole: projection.projectedRole,
  };
}
