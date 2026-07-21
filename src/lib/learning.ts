// ---------------------------------------------------------------------------
// Continuous Learning / In-Season Update logic
// ---------------------------------------------------------------------------
// As real box scores arrive each round, we (1) re-aggregate the player's
// current-season stat line, (2) blend it with the preseason projection using a
// confidence weight that grows with games played, and (3) flag trends. The
// recalculated projection then re-runs through the Value Engine.
//
// This module is pure so it can run in an API route, a cron job, or a worker.
// ---------------------------------------------------------------------------

import { SeasonStatLine, ProjectionOutput, round1, computeFantasyPoints } from "./types";

export interface BoxScoreLine {
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  pir: number;
}

// Aggregate raw box scores into a per-game season line + volatility.
export function aggregateBoxScores(
  boxes: BoxScoreLine[],
  season: string,
  teamSnapshot?: string
): SeasonStatLine | null {
  if (boxes.length === 0) return null;
  const n = boxes.length;
  const sum = boxes.reduce(
    (acc, b) => ({
      minutes: acc.minutes + b.minutes,
      points: acc.points + b.points,
      rebounds: acc.rebounds + b.rebounds,
      assists: acc.assists + b.assists,
      steals: acc.steals + b.steals,
      blocks: acc.blocks + b.blocks,
      turnovers: acc.turnovers + b.turnovers,
      pir: acc.pir + b.pir,
    }),
    { minutes: 0, points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, pir: 0 }
  );
  const avg = {
    minutes: sum.minutes / n,
    points: sum.points / n,
    rebounds: sum.rebounds / n,
    assists: sum.assists / n,
    steals: sum.steals / n,
    blocks: sum.blocks / n,
    turnovers: sum.turnovers / n,
    pir: sum.pir / n,
  };
  const perGameFp = boxes.map((b) => computeFantasyPoints(b));
  const meanFp = perGameFp.reduce((a, b) => a + b, 0) / n;
  const variance = perGameFp.reduce((a, b) => a + (b - meanFp) ** 2, 0) / n;
  const fpStdev = Math.sqrt(variance);

  return {
    season,
    teamSnapshot,
    games: n,
    minutes: round1(avg.minutes),
    points: round1(avg.points),
    rebounds: round1(avg.rebounds),
    assists: round1(avg.assists),
    steals: round1(avg.steals),
    blocks: round1(avg.blocks),
    turnovers: round1(avg.turnovers),
    usage: 0, // recomputed elsewhere if needed
    pir: round1(avg.pir),
    fantasyPoints: round1(meanFp),
    fpStdev: round1(fpStdev),
  };
}

// Confidence grows as the sample grows: 0 games -> trust preseason, ~20 games -> trust live.
export function liveConfidence(games: number): number {
  return Math.min(games / 20, 1) * 0.85;
}

// Blend preseason projection with the live per-game line.
export function blendWithLive(
  preseason: ProjectionOutput,
  live: SeasonStatLine
): ProjectionOutput {
  const w = liveConfidence(live.games);
  const mix = (proj: number, actual: number) => round1(proj * (1 - w) + actual * w);
  const blended = {
    ...preseason,
    projMinutes: mix(preseason.projMinutes, live.minutes),
    projPoints: mix(preseason.projPoints, live.points),
    projRebounds: mix(preseason.projRebounds, live.rebounds),
    projAssists: mix(preseason.projAssists, live.assists),
    projSteals: mix(preseason.projSteals, live.steals),
    projBlocks: mix(preseason.projBlocks, live.blocks),
    projTurnovers: mix(preseason.projTurnovers, live.turnovers),
    projPir: mix(preseason.projPir, live.pir),
  };
  blended.projFantasyPoints = computeFantasyPoints(blended as any);
  blended.projFantasyPoints = round1(blended.projFantasyPoints);
  return blended;
}

export type Trend = "rising" | "falling" | "stable";

// Detect a trend by comparing recent window vs earlier window of fantasy points.
export function detectTrend(recentFp: number[], windowSize = 5): Trend {
  if (recentFp.length < windowSize * 2) return "stable";
  const recent = recentFp.slice(-windowSize);
  const earlier = recentFp.slice(-windowSize * 2, -windowSize);
  const ra = recent.reduce((a, b) => a + b, 0) / recent.length;
  const ea = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  const delta = (ra - ea) / Math.max(ea, 1);
  if (delta >= 0.12) return "rising";
  if (delta <= -0.12) return "falling";
  return "stable";
}
