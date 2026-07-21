// ---------------------------------------------------------------------------
// Matchup Engine
// ---------------------------------------------------------------------------
// Scores how "fantasy-friendly" a defense is to face, overall and per
// statistical category, from what a team ALLOWS to opponents. Used on the
// Teams tab and to feed matchupDifficulty into the Value Engine.
// ---------------------------------------------------------------------------

import { clamp, round1 } from "./types";

export interface TeamDefensiveProfile {
  pointsAllowed: number;
  reboundsAllowed: number;
  assistsAllowed: number;
  turnoversForced: number;
  threePtAllowed: number;
  defRating: number;
  pace: number;
}

// League reference points for normalisation.
// Calibrated to real EuroLeague 2025-26 league averages (20-team season) so
// fantasyFriendliness centres around 50 with genuine spread across defenses.
const REF = {
  pointsAllowed: 86,
  reboundsAllowed: 34.8,
  assistsAllowed: 18.9,
  turnoversForced: 12.4,
  threePtAllowed: 9.6,
  defRating: 116,
  pace: 74.2,
};

// 0-100 where 100 = most fantasy-friendly to oppose (bleeds production).
export function fantasyFriendliness(t: TeamDefensiveProfile): number {
  const ptsF = (t.pointsAllowed / REF.pointsAllowed) * 100;
  const rebF = (t.reboundsAllowed / REF.reboundsAllowed) * 100;
  const astF = (t.assistsAllowed / REF.assistsAllowed) * 100;
  // Forcing turnovers SUPPRESSES opponent fantasy -> invert.
  const toF = (REF.turnoversForced / Math.max(t.turnoversForced, 1)) * 100;
  const threeF = (t.threePtAllowed / REF.threePtAllowed) * 100;
  const paceF = (t.pace / REF.pace) * 100;

  // Each factor is 100 at the league average, so the weighted sum is ~100 for
  // an average defense. Recentre to 50 (grade thresholds treat 50 as neutral)
  // and amplify the deviation so real spread reads across the 0-100 scale.
  const raw =
    ptsF * 0.3 + rebF * 0.15 + astF * 0.15 + toF * 0.15 + threeF * 0.1 + paceF * 0.15;
  return clamp(round1(50 + (raw - 100) * 2.2), 0, 100);
}

export type MatchupGrade = "smash" | "good" | "neutral" | "tough" | "fade";

export function gradeFromFriendliness(f: number): MatchupGrade {
  if (f >= 60) return "smash";
  if (f >= 53) return "good";
  if (f >= 47) return "neutral";
  if (f >= 40) return "tough";
  return "fade";
}

// Convert friendliness to a difficulty value for the Value Engine (higher = tougher).
export function difficultyFromFriendliness(f: number): number {
  return clamp(round1(100 - f), 0, 100);
}

export function categoryBreakdown(t: TeamDefensiveProfile) {
  return {
    points: round1((t.pointsAllowed / REF.pointsAllowed) * 50 + 25),
    rebounds: round1((t.reboundsAllowed / REF.reboundsAllowed) * 50 + 25),
    assists: round1((t.assistsAllowed / REF.assistsAllowed) * 50 + 25),
    threes: round1((t.threePtAllowed / REF.threePtAllowed) * 50 + 25),
    ballSecurity: round1((REF.turnoversForced / Math.max(t.turnoversForced, 1)) * 50 + 25),
  };
}
