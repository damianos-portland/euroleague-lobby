// ---------------------------------------------------------------------------
// Fantasy Value Engine
// ---------------------------------------------------------------------------
// Turns a projection + context into the fantasy decision metrics that drive
// the lobby: value score, points-per-credit, risk-adjusted value, upside,
// consistency, injury risk, ownership prediction and a buy/sell/hold +
// avoid/watch/value/premium recommendation.
// ---------------------------------------------------------------------------

import {
  ProjectionOutput,
  ValueOutput,
  Recommendation,
  Signal,
  clamp,
  round1,
  SeasonStatLine,
} from "./types";

export interface ValueInput {
  projection: ProjectionOutput;
  fantasyPrice: number; // credits
  lastSeason?: SeasonStatLine;
  age: number;
  changedTeam: boolean;
  injuryRiskHint?: number; // 0-100
  matchupDifficulty?: number; // 0-100, higher = tougher schedule (lowers value)
}

// Normalisation anchor, calibrated to the actual league distribution of
// projected FP-per-credit (median ≈ 1.0, p90 ≈ 1.6). Anchoring "fair" at the
// median so an average player scores ~50 and elites (≈1.8) score ~90 — the old
// 2.2 anchor was unreachable and labelled almost everyone "avoid".
const FAIR_PPC = 1.0; // projected FP per credit = an average value play

export function evaluateValue(input: ValueInput): ValueOutput {
  const fp = input.projection.projFantasyPoints;
  const price = Math.max(input.fantasyPrice, 1);

  const pointsPerCredit = round1(fp / price);

  // valueScore: 0-100, centred so FAIR_PPC (the median) -> 50.
  const valueScore = clamp(round1((pointsPerCredit / FAIR_PPC) * 50), 0, 100);

  // --- Consistency (from last season's per-game stdev relative to mean) ---
  let consistencyScore = 60;
  if (input.lastSeason && input.lastSeason.fantasyPoints > 0) {
    const cv = input.lastSeason.fpStdev / input.lastSeason.fantasyPoints; // coeff. of variation
    consistencyScore = clamp(round1(100 - cv * 140), 10, 98);
  }

  // --- Injury risk (prior + age load) ---
  let injuryRisk = input.injuryRiskHint ?? 20;
  if (input.age >= 34) injuryRisk += 12;
  else if (input.age >= 31) injuryRisk += 6;
  injuryRisk = clamp(round1(injuryRisk), 0, 100);

  // --- Matchup adjustment ---
  const matchup = input.matchupDifficulty ?? 50;
  const matchupMult = clamp(1 - (matchup - 50) / 200, 0.85, 1.15);

  // --- Upside: minutes headroom + usage + youth + new-team breakout chance ---
  const minutesHeadroom = clamp((34 - input.projection.projMinutes) / 34, 0, 1);
  let upsideScore =
    valueScore * 0.45 +
    input.projection.projUsage * 1.1 +
    (input.age <= 24 ? 18 : input.age <= 28 ? 8 : 0) +
    (input.changedTeam ? 8 : 0) +
    minutesHeadroom * 12;
  upsideScore = clamp(round1(upsideScore), 0, 100);

  // --- Risk-adjusted value ---
  const riskPenalty = (injuryRisk / 100) * 0.35 + ((100 - consistencyScore) / 100) * 0.25;
  const riskAdjustedValue = clamp(
    round1(valueScore * matchupMult * (1 - riskPenalty)),
    0,
    100
  );

  // --- Ownership prediction: stars + great value get rostered more ---
  const ownershipPrediction = clamp(
    round1(
      valueScore * 0.4 +
        Math.min(fp, 30) * 1.4 +
        (input.fantasyPrice >= 9 ? 18 : 0) +
        consistencyScore * 0.15
    ),
    1,
    99
  );

  const recommendation = recommend(
    valueScore,
    riskAdjustedValue,
    upsideScore,
    input.fantasyPrice,
    fp,
    input.projection.projMinutes
  );
  const signal = buySellHold(valueScore, riskAdjustedValue, upsideScore, injuryRisk);

  const rationale = buildRationale({
    pointsPerCredit,
    valueScore,
    riskAdjustedValue,
    upsideScore,
    consistencyScore,
    injuryRisk,
    matchup,
    recommendation,
    signal,
  });

  return {
    valueScore,
    pointsPerCredit,
    riskAdjustedValue,
    upsideScore,
    consistencyScore,
    injuryRisk,
    ownershipPrediction,
    recommendation,
    signal,
    rationale,
  };
}

function recommend(
  valueScore: number,
  rav: number,
  upside: number,
  price: number,
  fp: number,
  projMinutes: number
): Recommendation {
  // Won't see the floor → not a fantasy asset, regardless of efficiency.
  if (projMinutes < 12 || fp < 6) return "avoid";
  // Premium: elite production is a roster anchor even at a premium price —
  // a big scorer with at-least-fair value is never an "avoid".
  if (fp >= 24 || (fp >= 19 && valueScore >= 48)) return "premium_pick";
  // Value: efficient points-per-credit, or a solid producer at good value.
  if (valueScore >= 62 || (valueScore >= 50 && fp >= 12)) return "value_pick";
  // Watchlist: real role with upside or above-average value.
  if (upside >= 58 || valueScore >= 45 || fp >= 12) return "watchlist";
  return "avoid";
}

function buySellHold(
  valueScore: number,
  rav: number,
  upside: number,
  injuryRisk: number
): Signal {
  if (valueScore >= 60 && upside >= 55 && injuryRisk < 55) return "buy";
  if (valueScore < 40 || (injuryRisk >= 70 && rav < 45)) return "sell";
  return "hold";
}

function buildRationale(x: {
  pointsPerCredit: number;
  valueScore: number;
  riskAdjustedValue: number;
  upsideScore: number;
  consistencyScore: number;
  injuryRisk: number;
  matchup: number;
  recommendation: Recommendation;
  signal: Signal;
}): string {
  const parts: string[] = [];
  parts.push(`${x.pointsPerCredit} FP/credit (value ${x.valueScore}/100)`);
  if (x.upsideScore >= 65) parts.push(`υψηλό upside ${x.upsideScore}`);
  if (x.consistencyScore >= 75) parts.push(`σταθερός (${x.consistencyScore})`);
  else if (x.consistencyScore <= 45) parts.push(`ασταθής (${x.consistencyScore})`);
  if (x.injuryRisk >= 55) parts.push(`injury risk ${x.injuryRisk}`);
  const labelMap: Record<Recommendation, string> = {
    avoid: "AVOID",
    watchlist: "WATCHLIST",
    value_pick: "VALUE PICK",
    premium_pick: "PREMIUM PICK",
  };
  return `${labelMap[x.recommendation]} · ${x.signal.toUpperCase()} — ${parts.join(", ")}.`;
}

// Convenience: derive a simple risk level bucket for badges.
export function riskLevel(injuryRisk: number, consistencyScore: number): "low" | "medium" | "high" {
  const composite = injuryRisk * 0.6 + (100 - consistencyScore) * 0.4;
  if (composite >= 60) return "high";
  if (composite >= 38) return "medium";
  return "low";
}
