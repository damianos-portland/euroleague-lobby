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

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export type IntentKey = "faststart" | "gems" | "ceiling" | "value" | "safe" | "differential";

export interface Intent {
  key: IntentKey;
  label: string;
  hint: string;
}

export const INTENTS: Intent[] = [
  { key: "faststart", label: "🔥 Δυνατή εκκίνηση", hint: "Offseason value: αποδεδειγμένοι παίκτες με σίγουρο ρόλο από την 1η αγωνιστική, που κοστίζουν λίγο — η τιμή δεν τους έχει προλάβει." },
  { key: "gems", label: "💎 Φθηνά διαμάντια", hint: "Φθηνοί παίκτες με upside να ανέβει η αξία τους — buy-low (πιο μακροπρόθεσμο)." },
  { key: "ceiling", label: "🚀 Καθαρά FFP", hint: "Ό,τι κι αν κοστίζει — μέγιστη προβλεπόμενη παραγωγή." },
  { key: "value", label: "⚖️ Value / credit", hint: "Καλύτερη απόδοση ανά credit (points per credit)." },
  { key: "safe", label: "🛡️ Σίγουρο flooring", hint: "Σταθεροί, με λεπτά & χαμηλό ρίσκο τραυματισμού." },
  { key: "differential", label: "🎯 Differential", hint: "Χαμηλό ownership αλλά καλή αξία — κρυφά χαρτιά." },
];

// Eligibility gate for "fast start": will this player credibly produce from
// game 1? Must be proven (real last-season sample), in a secure role, with real
// minutes. Kept as a GATE (not a multiplier) so it doesn't distort the value
// ranking toward expensive max-minute studs.
export function fastStartEligible(p: PlayerDTO): boolean {
  const j = p.proj;
  if (!j) return false;
  if (p.status === "unproven") return false; // no track record → slow ramp
  if (!p.last || p.last.games < 10) return false; // too small a sample
  if (p.depthRole !== "starter" && p.depthRole !== "rotation") return false;
  if (j.projMinutes < 18) return false; // has a real day-1 role
  return j.projFantasyPoints >= 10; // production floor — must actually contribute
}

// Expected early per-game output, trusting proven recent form over projection,
// lightly weighted by sample size. No role/minutes multiplier here — those are
// the eligibility gate above.
export function fastStartReadyFP(p: PlayerDTO): number {
  const j = p.proj;
  if (!j) return 0;
  const last = p.last;
  const reliability = last ? clamp(last.games / 22, 0.5, 1) : 0.4;
  const base = last ? last.fantasyPoints * 0.6 + j.projFantasyPoints * 0.4 : j.projFantasyPoints * 0.5;
  return base * reliability;
}

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
    case "faststart": {
      // Among eligible early producers (proven, secure role, ≥10 proj FP), reward
      // production but with a super-linear price penalty (price^1.3) so genuinely
      // CHEAP contributors rise over expensive studs — the offseason bargains.
      // Fantasy pricing here is ~flat on FP/credit, so plain value wouldn't
      // separate cheap from pricey; the exponent is the explicit "cheap matters".
      if (!fastStartEligible(p)) return NEG;
      const consistency = 0.9 + 0.2 * (j.consistencyScore / 100);
      const avail = clamp(1 - j.injuryRisk / 300, 0.85, 1);
      return (fastStartReadyFP(p) / Math.pow(Math.max(p.fantasyPrice, 1), 1.3)) * consistency * avail;
    }
    case "gems":
      // cheap + high upside + value, bonus for an active buy signal. A diamond
      // must actually get court time — no minutes, no breakout.
      if (p.fantasyPrice > 8) return NEG;
      if (j.projMinutes < 15 || p.depthRole === "deep_bench") return NEG;
      return j.upsideScore * 0.55 + j.valueScore * 0.35 + (j.signal === "buy" ? 12 : 0) + (p.age <= 24 ? 6 : 0);
    case "ceiling":
      // raw projected production, price ignored (low minutes ⇒ low FP already)
      return j.projFantasyPoints;
    case "value":
      // best points-per-credit — but only players who see the floor
      if (j.projMinutes < 12) return NEG;
      return j.valueScore + j.pointsPerCredit * 4;
    case "safe":
      // consistent, plays real minutes, low injury risk
      if (j.projMinutes < 16) return NEG;
      return j.consistencyScore * 0.55 + (100 - j.injuryRisk) * 0.3 + Math.min(j.projFantasyPoints, 30) * 0.5;
    case "differential":
      // good risk-adjusted value that the crowd is sleeping on
      if (j.projMinutes < 12) return NEG;
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
    case "faststart": {
      const role = p.depthRole === "starter" ? "starter" : p.depthRole === "rotation" ? "rotation" : "bench";
      const proven = p.last ? `${p.last.fantasyPoints.toFixed(1)} FP πέρσι` : "unproven";
      return `${proven} · ${role} · ${p.fantasyPrice.toFixed(1)}cr`;
    }
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
