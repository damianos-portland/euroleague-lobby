// ---------------------------------------------------------------------------
// Draft logic (pure) — snake order, roster needs, auto-pick & advice.
// Used by the draft API routes and the draft board UI.
// ---------------------------------------------------------------------------

import { Position } from "./types";

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
