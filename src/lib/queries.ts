// ---------------------------------------------------------------------------
// Read-side query helpers + DTO shaping. Server components and API routes call
// these so the player shape is consistent everywhere.
// ---------------------------------------------------------------------------

import { prisma } from "./db";
import { Position } from "./types";

export interface PlayerDTO {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  position: Position;
  nationality: string;
  age: number;
  status: string;
  depthRole: string;
  fantasyPrice: number;
  tags: string[];
  teamId: string | null;
  teamShort: string | null;
  teamName: string | null;
  // last season
  last?: {
    season: string;
    games: number;
    minutes: number;
    points: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    turnovers: number;
    usage: number;
    pir: number;
    fantasyPoints: number;
    fpStdev: number;
    teamSnapshot: string | null;
  } | null;
  // projection + value
  proj?: {
    projMinutes: number;
    projUsage: number;
    projPoints: number;
    projRebounds: number;
    projAssists: number;
    projSteals: number;
    projBlocks: number;
    projTurnovers: number;
    projPir: number;
    projFantasyPoints: number;
    valueScore: number;
    pointsPerCredit: number;
    riskAdjustedValue: number;
    upsideScore: number;
    consistencyScore: number;
    injuryRisk: number;
    ownershipPrediction: number;
    recommendation: string;
    signal: string;
    rationale: string;
    projectedRole: string;
  } | null;
}

const playerInclude = {
  team: true,
  projection: true,
  seasonStats: { orderBy: { season: "desc" as const } },
};

export function toPlayerDTO(p: any): PlayerDTO {
  const last = p.seasonStats?.[0];
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    name: `${p.firstName} ${p.lastName}`,
    position: p.position,
    nationality: p.nationality,
    age: p.age,
    status: p.status,
    depthRole: p.depthRole,
    fantasyPrice: p.fantasyPrice,
    tags: (p.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean),
    teamId: p.teamId ?? null,
    teamShort: p.team?.shortName ?? null,
    teamName: p.team?.name ?? null,
    last: last
      ? {
          season: last.season, games: last.games, minutes: last.minutes,
          points: last.points, rebounds: last.rebounds, assists: last.assists,
          steals: last.steals, blocks: last.blocks, turnovers: last.turnovers,
          usage: last.usage, pir: last.pir, fantasyPoints: last.fantasyPoints,
          fpStdev: last.fpStdev, teamSnapshot: last.teamSnapshot ?? null,
        }
      : null,
    proj: p.projection
      ? {
          projMinutes: p.projection.projMinutes, projUsage: p.projection.projUsage,
          projPoints: p.projection.projPoints, projRebounds: p.projection.projRebounds,
          projAssists: p.projection.projAssists, projSteals: p.projection.projSteals,
          projBlocks: p.projection.projBlocks, projTurnovers: p.projection.projTurnovers,
          projPir: p.projection.projPir, projFantasyPoints: p.projection.projFantasyPoints,
          valueScore: p.projection.valueScore, pointsPerCredit: p.projection.pointsPerCredit,
          riskAdjustedValue: p.projection.riskAdjustedValue, upsideScore: p.projection.upsideScore,
          consistencyScore: p.projection.consistencyScore, injuryRisk: p.projection.injuryRisk,
          ownershipPrediction: p.projection.ownershipPrediction,
          recommendation: p.projection.recommendation, signal: p.projection.signal,
          rationale: p.projection.rationale, projectedRole: p.projection.projectedRole,
        }
      : null,
  };
}

export async function getAllPlayers(): Promise<PlayerDTO[]> {
  const rows = await prisma.player.findMany({ include: playerInclude, orderBy: { lastName: "asc" } });
  return rows.map(toPlayerDTO);
}

export async function getPlayer(id: string): Promise<PlayerDTO | null> {
  const row = await prisma.player.findUnique({ where: { id }, include: playerInclude });
  return row ? toPlayerDTO(row) : null;
}

export async function getTeams() {
  return prisma.team.findMany({ orderBy: { name: "asc" } });
}

export async function getTeamWithRoster(id: string) {
  const team = await prisma.team.findUnique({
    where: { id },
    include: { players: { include: playerInclude } },
  });
  if (!team) return null;
  return { team, roster: team.players.map(toPlayerDTO) };
}

export async function getRecentMoves(limit = 12) {
  return prisma.rosterMove.findMany({
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: { player: true, fromTeam: true, toTeam: true },
  });
}

export async function getAlerts(limit = 12) {
  return prisma.fantasyAlert.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { player: true },
  });
}

export async function getInjuries() {
  return prisma.injuryEvent.findMany({
    orderBy: { occurredAt: "desc" },
    include: { player: { include: { team: true } } },
  });
}

export async function getDemoUser() {
  return prisma.user.findFirst({ where: { role: "user" } });
}

export async function getWatchlist(userId: string) {
  const items = await prisma.watchlistItem.findMany({
    where: { userId },
    include: { player: { include: playerInclude } },
  });
  return items.map((i) => ({ note: i.note, player: toPlayerDTO(i.player) }));
}

// Top players by projected value (lobby ranking + projections tab default).
export async function getTopByValue(limit = 20): Promise<PlayerDTO[]> {
  const rows = await prisma.player.findMany({
    include: playerInclude,
    where: { projection: { isNot: null } },
  });
  return rows
    .map(toPlayerDTO)
    .sort((a, b) => (b.proj?.projFantasyPoints ?? 0) - (a.proj?.projFantasyPoints ?? 0))
    .slice(0, limit);
}

export async function getFreeAgents(): Promise<PlayerDTO[]> {
  const rows = await prisma.player.findMany({
    where: { OR: [{ status: "free_agent" }, { teamId: null }] },
    include: playerInclude,
  });
  return rows.map(toPlayerDTO);
}
