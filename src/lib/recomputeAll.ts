// Recompute every player's projection + value from current DB state.
// Called by the admin "Recalculate projections" action and usable from a
// weekly cron once live box scores arrive.

import { prisma } from "./db";
import { buildTeamContext, RosterMember } from "./context";
import { computeForPlayer } from "./recompute";
import { Position, DepthRole, PlayerStatus, SeasonStatLine } from "./types";

const PROJ_SEASON = "2025-26";
const LEAGUE_AVG = { pace: 72, offRating: 110, defRating: 110, fantasyFriendliness: 50 };

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
    // Unproven players (no EuroLeague stat history) get no projection — they
    // must not appear in value rankings until they have real data.
    if (p.seasonStats.length === 0) continue;
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
