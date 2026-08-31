// ---------------------------------------------------------------------------
// Draft logic (pure) — snake order, roster needs, auto-pick & advice.
// Used by the draft API routes and the draft board UI.
// ---------------------------------------------------------------------------

import { Position } from "./types";

// ---------------------------------------------------------------------------
// Draft lottery: draw a pick order weighted by each entry's tickets. Higher
// weight → more likely to draw an early pick (NBA-style; give the worst team
// the most tickets). Equal weights → a uniform (pure random) shuffle.
// Returns the participant indices in pick order: result[0] gets pick #1.
// ---------------------------------------------------------------------------
// NBA draft-lottery odds for the 14 lottery teams, as ticket combinations out
// of 1000 (worst team first). The real NBA distribution: the bottom 3 teams are
// tied at the top, then a steady taper, steeper at the very end.
const NBA_14 = [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5];

// Produce NBA-style lottery weights for `n` teams (seed 1 = worst = best odds),
// by resampling the real 14-team odds curve to n points. Preserves the NBA
// shape whatever the league size. Returned as integer "tickets".
export function nbaLotteryWeights(n: number): number[] {
  if (n <= 1) return [1];
  const src = NBA_14;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i * (src.length - 1)) / (n - 1); // map 0..n-1 → 0..13
    const lo = Math.floor(x);
    const hi = Math.min(lo + 1, src.length - 1);
    const frac = x - lo;
    out.push(Math.max(1, Math.round(src[lo] * (1 - frac) + src[hi] * frac)));
  }
  return out;
}

// Convert weights into #1-pick odds percentages (rounded to 1 decimal).
export function oddsPercent(weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + Math.max(1, w), 0) || 1;
  return weights.map((w) => Math.round((Math.max(1, w) / total) * 1000) / 10);
}

export function drawLotteryOrder(weights: number[]): number[] {
  const pool = weights.map((w, i) => ({ i, w: Math.max(1, Math.round(w) || 1) }));
  const order: number[] = [];
  while (pool.length > 0) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let k = 0; k < pool.length; k++) {
      r -= pool[k].w;
      if (r <= 0) {
        idx = k;
        break;
      }
    }
    order.push(pool[idx].i);
    pool.splice(idx, 1);
  }
  return order;
}

export interface DraftablePlayer {
  id: string;
  name: string;
  position: Position;
  teamShort: string | null;
  fantasyPrice: number;
  projFantasyPoints: number;
  valueScore: number;
  upsideScore: number;
  consistencyScore: number;
  riskAdjustedValue: number;
  recommendation: string;
}

// Snake order: which participant draftOrder is on the clock for an overall pick.
export function orderIndexForPick(overall: number, numParticipants: number): number {
  const round = Math.floor(overall / numParticipants);
  const pos = overall % numParticipants;
  return round % 2 === 0 ? pos : numParticipants - 1 - pos;
}

// "Re-lottery" order matrix. Round 1 keeps the lottery result (seats 0..n-1 in
// pick order). Each later round is re-drawn with weights derived from the
// PREVIOUS round's order: the team that picked first last round is seeded worst
// (smallest weight → lowest odds for the next round's #1 pick), and vice-versa.
// Returns rounds×n where result[r][pos] = the draftOrder-seat picking at `pos`.
export function chainedRoundOrders(rounds: number, n: number): number[][] {
  const round1 = Array.from({ length: n }, (_, i) => i); // seat s picks at pos s
  const orders: number[][] = [round1];
  for (let r = 1; r < rounds; r++) {
    const prev = orders[r - 1];
    const reversed = [...prev].reverse(); // reversed[0] = last picker last round
    const curve = nbaLotteryWeights(n); // curve[0] = biggest
    const weights = new Array<number>(n).fill(1);
    for (let k = 0; k < n; k++) weights[reversed[k]] = curve[k]; // worst→best odds
    orders.push(drawLotteryOrder(weights));
  }
  return orders;
}

// Parse the stored roundOrders JSON; null/invalid ⇒ null (snake fallback).
export function parseRoundOrders(raw: string | null | undefined): number[][] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v) && v.every((row) => Array.isArray(row))) return v as number[][];
  } catch {
    /* fall through */
  }
  return null;
}

// Which draftOrder-seat is on the clock at `overall`, honoring the round mode.
// With a roundOrders matrix (re-lottery) it looks up the cached seat; otherwise
// it falls back to the snake formula.
export function seatForPick(
  overall: number,
  n: number,
  roundOrders?: number[][] | null
): number {
  const round = Math.floor(overall / n);
  const pos = overall % n;
  const row = roundOrders?.[round];
  if (row && row.length === n) return row[pos];
  return orderIndexForPick(overall, n);
}

export function roundAndPick(overall: number, numParticipants: number) {
  return {
    round: Math.floor(overall / numParticipants) + 1,
    pickInRound: (overall % numParticipants) + 1,
  };
}

export function totalPicks(numParticipants: number, rounds: number): number {
  return numParticipants * rounds;
}

// Parse roster slot template, e.g. "PG,SG,SF,PF,C,FLEX,FLEX,BENCH,BENCH,BENCH".
export function parseSlots(template: string): string[] {
  return template.split(",").map((s) => s.trim()).filter(Boolean);
}

const FLEX_OK: Position[] = ["PG", "SG", "SF", "PF", "C"];

// Given a participant's drafted positions and the slot template, compute which
// required slots remain unfilled (BENCH/FLEX absorb anyone).
export function rosterNeeds(template: string, draftedPositions: Position[]): {
  filled: Record<string, number>;
  missing: string[];
} {
  const slots = parseSlots(template);
  const pool = [...draftedPositions];
  const filled: Record<string, number> = {};
  const missing: string[] = [];

  // Fill specific position slots first.
  for (const slot of slots) {
    if (slot === "FLEX" || slot === "BENCH") continue;
    const idx = pool.indexOf(slot as Position);
    if (idx >= 0) {
      pool.splice(idx, 1);
      filled[slot] = (filled[slot] ?? 0) + 1;
    } else {
      missing.push(slot);
    }
  }
  // FLEX/BENCH absorb leftovers.
  for (const slot of slots) {
    if (slot !== "FLEX" && slot !== "BENCH") continue;
    if (pool.length > 0) {
      pool.shift();
      filled[slot] = (filled[slot] ?? 0) + 1;
    } else {
      missing.push(slot);
    }
  }
  return { filled, missing };
}

// Position groups still required (ignoring flex/bench) — used for warnings.
export function requiredPositionsRemaining(
  template: string,
  draftedPositions: Position[]
): Position[] {
  const { missing } = rosterNeeds(template, draftedPositions);
  return missing.filter((m): m is Position => FLEX_OK.includes(m as Position));
}

export type AdviceKind = "best" | "fit" | "upside" | "safe" | "avoid";

// Rank available players for a participant under a given lens.
export function advise(
  available: DraftablePlayer[],
  draftedPositions: Position[],
  template: string,
  kind: AdviceKind,
  limit = 10
): DraftablePlayer[] {
  const needs = requiredPositionsRemaining(template, draftedPositions);
  const scored = available.map((p) => {
    let score = 0;
    switch (kind) {
      case "best":
        score = p.projFantasyPoints * 2 + p.valueScore;
        break;
      case "fit": {
        const needBonus = needs.includes(p.position) ? 35 : 0;
        score = p.projFantasyPoints * 1.5 + p.valueScore + needBonus;
        break;
      }
      case "upside":
        score = p.upsideScore * 2 + p.projFantasyPoints * 0.5;
        break;
      case "safe":
        score = p.consistencyScore * 1.4 + p.riskAdjustedValue;
        break;
      case "avoid":
        // Surface the worst values (lowest), so invert.
        score = -(p.valueScore + p.riskAdjustedValue);
        break;
    }
    return { p, score };
  });
  const sorted = scored.sort((a, b) => b.score - a.score).map((s) => s.p);
  return sorted.slice(0, limit);
}

// Auto-pick: best available that also fills a need if one exists, else BPA.
export function autoPick(
  available: DraftablePlayer[],
  draftedPositions: Position[],
  template: string
): DraftablePlayer | null {
  if (available.length === 0) return null;
  const fit = advise(available, draftedPositions, template, "fit", 1);
  return fit[0] ?? null;
}

// Post-draft grade for a roster (A+..F) based on total projected FP + balance.
export function gradeRoster(players: DraftablePlayer[]): { grade: string; score: number } {
  if (players.length === 0) return { grade: "—", score: 0 };
  const totalFp = players.reduce((a, p) => a + p.projFantasyPoints, 0);
  const avgValue = players.reduce((a, p) => a + p.valueScore, 0) / players.length;
  const positions = new Set(players.map((p) => p.position));
  const balanceBonus = positions.size * 4; // reward positional coverage
  const score = totalFp * 1.2 + avgValue * 0.6 + balanceBonus;

  // Buckets tuned for a ~10-man roster.
  const grade =
    score >= 320 ? "A+" :
    score >= 295 ? "A" :
    score >= 275 ? "A-" :
    score >= 255 ? "B+" :
    score >= 235 ? "B" :
    score >= 215 ? "B-" :
    score >= 195 ? "C+" :
    score >= 175 ? "C" :
    score >= 150 ? "C-" : "D";
  return { grade, score: Math.round(score) };
}
