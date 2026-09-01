// ---------------------------------------------------------------------------
// Scout — rule-based player recommendations driven by "intent".
// ---------------------------------------------------------------------------
// The user picks WHAT they want (cheap breakout, pure ceiling, best value/credit,
// safe floor, differential) and we rank players by a transparent fit score built
// from the existing Value Engine outputs. No AI, fully deterministic.
//
// Matchup-aware factors (next opponent, defense-vs-position, absences, real-vs-
// fantasy position mismatch) need data we don't ingest yet — see MATCHUP_FACTORS.
// ---------------------------------------------------------------------------

import type { PlayerDTO } from "./queries";

export type IntentKey = "gems" | "ceiling" | "value" | "safe" | "differential";

export interface Intent {
  key: IntentKey;
  label: string;
  hint: string;
}

export const INTENTS: Intent[] = [
  { key: "gems", label: "💎 Φθηνά διαμάντια", hint: "Φθηνοί παίκτες με upside να ανέβει η αξία τους — buy-low." },
  { key: "ceiling", label: "🚀 Καθαρά FFP", hint: "Ό,τι κι αν κοστίζει — μέγιστη προβλεπόμενη παραγωγή." },
  { key: "value", label: "⚖️ Value / credit", hint: "Καλύτερη απόδοση ανά credit (points per credit)." },
  { key: "safe", label: "🛡️ Σίγουρο flooring", hint: "Σταθεροί, με λεπτά & χαμηλό ρίσκο τραυματισμού." },
  { key: "differential", label: "🎯 Differential", hint: "Χαμηλό ownership αλλά καλή αξία — κρυφά χαρτιά." },
];

// Factors we WANT but can't compute until the data phase lands.
export const MATCHUP_FACTORS = [
  "Επόμενος αντίπαλος & πόσο FFP δίνει στη θέση",
  "Απουσίες που ανοίγουν λεπτά συμμετοχής",
  "Ασυμφωνία πραγματικής vs fantasy θέσης",
] as const;

const NEG = Number.NEGATIVE_INFINITY;

// Fit score for an intent — higher = better match. Players without a projection
// are excluded (NEG). Every branch reads only existing Value Engine fields.
export function fitScore(p: PlayerDTO, intent: IntentKey): number {
  const j = p.proj;
  if (!j) return NEG;
  switch (intent) {
    case "gems":
      // cheap + high upside + value, bonus for an active buy signal
      if (p.fantasyPrice > 8) return NEG;
      return j.upsideScore * 0.55 + j.valueScore * 0.35 + (j.signal === "buy" ? 12 : 0) + (p.age <= 24 ? 6 : 0);
    case "ceiling":
      // raw projected production, price ignored
      return j.projFantasyPoints;
    case "value":
      // best points-per-credit
      return j.valueScore + j.pointsPerCredit * 4;
    case "safe":
      // consistent, plays real minutes, low injury risk
      if (j.projMinutes < 16) return NEG;
      return j.consistencyScore * 0.55 + (100 - j.injuryRisk) * 0.3 + Math.min(j.projFantasyPoints, 30) * 0.5;
    case "differential":
      // good risk-adjusted value that the crowd is sleeping on
      return j.riskAdjustedValue - j.ownershipPrediction * 0.45;
    default:
      return NEG;
  }
}

// A short, intent-specific reason to surface next to the row.
export function intentReason(p: PlayerDTO, intent: IntentKey): string {
  const j = p.proj;
  if (!j) return "";
  switch (intent) {
    case "gems":
      return `${p.fantasyPrice.toFixed(1)}cr · upside ${j.upsideScore}${j.signal === "buy" ? " · BUY" : ""}`;
    case "ceiling":
      return `${j.projFantasyPoints.toFixed(1)} proj FP`;
    case "value":
      return `${j.pointsPerCredit.toFixed(2)} FP/cr · value ${j.valueScore}`;
    case "safe":
      return `consistency ${j.consistencyScore} · risk ${j.injuryRisk}`;
    case "differential":
      return `own ${j.ownershipPrediction}% · RAV ${j.riskAdjustedValue}`;
    default:
      return "";
  }
}

// Rank players for an intent (already-filtered list in), best first.
export function rankByIntent(players: PlayerDTO[], intent: IntentKey): PlayerDTO[] {
  return players
    .map((p) => ({ p, s: fitScore(p, intent) }))
    .filter((x) => x.s > NEG)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);
}
