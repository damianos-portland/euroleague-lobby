// ---------------------------------------------------------------------------
// Projection Engine
// ---------------------------------------------------------------------------
// Produces a forward-looking stat line for the upcoming season from a player's
// historical production adjusted for their new environment. The model is
// deliberately transparent (explainable) rather than a black box: every
// adjustment is a named multiplier so the rationale can be surfaced in the UI
// and the engine can be re-tuned weekly as real box scores arrive
// (see lib/learning.ts).
// ---------------------------------------------------------------------------

import {
  ProjectionInput,
  ProjectionOutput,
  computeFantasyPoints,
  clamp,
  round1,
  DepthRole,
} from "./types";

// League-average context, used to normalise team effects.
const LEAGUE = {
  pace: 72, // possessions / 40
  offRating: 110,
  defRating: 110,
};

// Expected minutes ceiling per depth role.
const ROLE_MINUTES: Record<DepthRole, number> = {
  starter: 28,
  rotation: 20,
  bench: 12,
  deep_bench: 6,
  unknown: 16,
};

function blendSeasons(input: ProjectionInput) {
  const last = input.lastSeason;
  const prior = input.priorSeason;
  if (last && prior) {
    // Weight recent season 70/30; regression-to-mean dampener.
    const w = 0.7;
    const mix = (a: number, b: number) => a * w + b * (1 - w);
    return {
      minutes: mix(last.minutes, prior.minutes),
      points: mix(last.points, prior.points),
      rebounds: mix(last.rebounds, prior.rebounds),
      assists: mix(last.assists, prior.assists),
      steals: mix(last.steals, prior.steals),
      blocks: mix(last.blocks, prior.blocks),
      turnovers: mix(last.turnovers, prior.turnovers),
      usage: mix(last.usage, prior.usage),
      pir: mix(last.pir, prior.pir),
      fpStdev: last.fpStdev || prior.fpStdev,
    };
  }
  if (last) return { ...last };
  // No history (e.g. young import): synthesise a modest baseline from role.
  const base = ROLE_MINUTES[input.depthRole] ?? ROLE_MINUTES.unknown;
  return {
    minutes: base,
    points: base * 0.45,
    rebounds: base * 0.18,
    assists: base * 0.12,
    steals: base * 0.03,
    blocks: base * 0.02,
    turnovers: base * 0.08,
    usage: 18,
    pir: base * 0.5,
    fpStdev: 6,
  };
}

// Age curve: peak ~26-29, gentle decline after 32, growth for U23.
function ageMultiplier(age: number): number {
  if (age <= 21) return 1.06;
  if (age <= 24) return 1.03;
  if (age <= 29) return 1.0;
  if (age <= 32) return 0.98;
  if (age <= 35) return 0.94;
  return 0.88;
}

export function projectPlayer(input: ProjectionInput): ProjectionOutput {
  const base = blendSeasons(input);

  // --- Minutes projection ---
  const roleCeiling = ROLE_MINUTES[input.depthRole] ?? ROLE_MINUTES.unknown;
  // Anchor to history but pull toward role ceiling.
  let projMinutes = base.minutes * 0.6 + roleCeiling * 0.4;
  // Positional logjam reduces minutes (more bodies ahead -> fewer minutes).
  projMinutes *= clamp(1 - input.positionCompetition * 0.06, 0.6, 1);
  // New environment: small first-season adjustment downward (chemistry/role).
  if (input.changedTeam) projMinutes *= 0.95;
  if (input.status === "free_agent" || input.status === "rumored")
    projMinutes *= 0.85; // uncertainty discount
  projMinutes = clamp(projMinutes, 0, 34);

  const minutesRatio = base.minutes > 0 ? projMinutes / base.minutes : 1;

  // --- Pace & efficiency multipliers ---
  const paceMult = clamp(input.team.pace / LEAGUE.pace, 0.9, 1.12);
  const offMult = clamp(input.team.offRating / LEAGUE.offRating, 0.92, 1.1);

  // --- Usage projection ---
  // available usage share scales scoring/assist opportunity.
  const usageShare = input.team.availableUsageShare ?? 1;
  let projUsage = base.usage * usageShare;
  if (input.changedTeam) projUsage *= 0.96;
  projUsage = clamp(projUsage, 6, 38);
  const usageMult = base.usage > 0 ? projUsage / base.usage : 1;

  const age = ageMultiplier(input.age);

  // Per-minute production scaled by usage (scoring-heavy) and pace.
  const scoreMult = minutesRatio * usageMult * paceMult * offMult * age;
  const volumeMult = minutesRatio * paceMult * age; // rebs/stocks scale w/ minutes+pace

  const projPoints = base.points * scoreMult;
  const projAssists = base.assists * minutesRatio * usageMult * age;
  const projRebounds = base.rebounds * volumeMult;
  const projSteals = base.steals * volumeMult;
  const projBlocks = base.blocks * volumeMult;
  // Turnovers rise with usage but we keep them as a cost.
  const projTurnovers = base.turnovers * minutesRatio * usageMult;

  const projFantasyPoints = computeFantasyPoints({
    points: projPoints,
    rebounds: projRebounds,
    assists: projAssists,
    steals: projSteals,
    blocks: projBlocks,
    turnovers: projTurnovers,
  });

  // PIR projection scales with minutes & efficiency, anchored to history.
  const projPir = base.pir * minutesRatio * paceMult * age * (0.5 + usageShare * 0.5);

  const projectedRole = describeRole(input, projMinutes);

  return {
    projMinutes: round1(projMinutes),
    projUsage: round1(projUsage),
    projPoints: round1(projPoints),
    projRebounds: round1(projRebounds),
    projAssists: round1(projAssists),
    projSteals: round1(projSteals),
    projBlocks: round1(projBlocks),
    projTurnovers: round1(projTurnovers),
    projPir: round1(projPir),
    projFantasyPoints: round1(projFantasyPoints),
    projectedRole,
  };
}

function describeRole(input: ProjectionInput, minutes: number): string {
  const env = input.changedTeam ? "νέα ομάδα" : "ίδια ομάδα";
  let usage = "";
  const share = input.team.availableUsageShare ?? 1;
  if (share >= 1.08) usage = "αυξημένο usage (κενό στη ρακέτα/περιφέρεια)";
  else if (share <= 0.9) usage = "συμπιεσμένο usage (φορτωμένο roster)";
  else usage = "σταθερό usage";

  let mins = "";
  if (minutes >= 27) mins = "βασικός";
  else if (minutes >= 18) mins = "ισχυρή rotation";
  else if (minutes >= 10) mins = "rotation";
  else mins = "περιορισμένος χρόνος";

  const comp =
    input.positionCompetition >= 2
      ? `έντονος ανταγωνισμός στη θέση (${input.positionCompetition} παίκτες)`
      : "καθαρός δρόμος στη θέση";

  return `${mins} ρόλος, ${usage}, ${comp} (${env}).`;
}
