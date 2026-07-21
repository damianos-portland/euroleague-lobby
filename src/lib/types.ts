// Shared domain types and constants for the EuroLeague Lobby.

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export type Position = (typeof POSITIONS)[number];

export type PlayerStatus =
  | "signed"
  | "rumored"
  | "free_agent"
  | "injured"
  | "departing";

export type DepthRole =
  | "starter"
  | "rotation"
  | "bench"
  | "deep_bench"
  | "unknown";

export type Recommendation =
  | "avoid"
  | "watchlist"
  | "value_pick"
  | "premium_pick";

export type Signal = "buy" | "sell" | "hold";

export type RiskLevel = "low" | "medium" | "high";

// Raw per-season stat line used as projection input.
export interface SeasonStatLine {
  season: string;
  teamSnapshot?: string;
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
}

// Team context that influences a projection.
export interface TeamContext {
  pace: number;
  offRating: number;
  defRating: number;
  // available usage on the team for this player (0-1), computed from depth chart
  availableUsageShare?: number;
}

export interface ProjectionInput {
  position: Position;
  age: number;
  depthRole: DepthRole;
  status: PlayerStatus;
  fantasyPrice: number;
  changedTeam: boolean; // moved to a new environment this offseason
  // positional competition on the new team: # of players ahead/equal at the position
  positionCompetition: number;
  team: TeamContext;
  lastSeason?: SeasonStatLine;
  priorSeason?: SeasonStatLine;
  injuryRiskHint?: number; // 0-100 prior from injury history
}

export interface ProjectionOutput {
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
  projectedRole: string;
}

export interface ValueOutput {
  valueScore: number;
  pointsPerCredit: number;
  riskAdjustedValue: number;
  upsideScore: number;
  consistencyScore: number;
  injuryRisk: number;
  ownershipPrediction: number;
  recommendation: Recommendation;
  signal: Signal;
  rationale: string;
}

// EuroLeague fantasy scoring is built around PIR-like contribution. We use a
// transparent linear scoring model so projections are explainable.
export const FANTASY_WEIGHTS = {
  points: 1,
  rebounds: 1,
  assists: 1.5,
  steals: 2,
  blocks: 2,
  turnovers: -1,
} as const;

export function computeFantasyPoints(line: {
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
}): number {
  return (
    line.points * FANTASY_WEIGHTS.points +
    line.rebounds * FANTASY_WEIGHTS.rebounds +
    line.assists * FANTASY_WEIGHTS.assists +
    line.steals * FANTASY_WEIGHTS.steals +
    line.blocks * FANTASY_WEIGHTS.blocks +
    line.turnovers * FANTASY_WEIGHTS.turnovers
  );
}

export function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
