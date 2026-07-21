// ---------------------------------------------------------------------------
// Team context builder
// ---------------------------------------------------------------------------
// Derives the per-player environment inputs (positional competition + how much
// usage is realistically available) from a team's depth chart. Shared by the
// seed script and the runtime "recalculate projections" endpoint so seed and
// live recompute behave identically.
// ---------------------------------------------------------------------------

import { clamp, DepthRole, Position } from "./types";

export interface RosterMember {
  id: string;
  position: Position;
  depthRole: DepthRole;
  fantasyPrice: number;
}

export interface PlayerContext {
  positionCompetition: number; // 0-3, players ahead at the position
  availableUsageShare: number; // ~0.85 - 1.18
}

const ROLE_WEIGHT: Record<DepthRole, number> = {
  starter: 1,
  rotation: 0.6,
  bench: 0.3,
  deep_bench: 0.1,
  unknown: 0.5,
};

export function buildTeamContext(roster: RosterMember[]): Map<string, PlayerContext> {
  const out = new Map<string, PlayerContext>();

  for (const p of roster) {
    // Players at the same position who are plausibly ahead in the pecking order.
    const competitors = roster.filter(
      (q) =>
        q.id !== p.id &&
        q.position === p.position &&
        (q.depthRole === "starter" || q.depthRole === "rotation") &&
        q.fantasyPrice >= p.fantasyPrice * 0.9
    );
    const positionCompetition = Math.min(competitors.length, 3);

    let share = 1.0;
    share += p.depthRole === "starter" ? 0.06 : p.depthRole === "bench" ? -0.06 : 0;
    share -= 0.05 * positionCompetition;

    // Team-wide usage concentration: if few high-priced creators exist, a starter
    // inherits more usage; if the roster is star-stacked, everyone's share shrinks.
    const highUsageCore = roster.filter(
      (q) => q.fantasyPrice >= 8 && (q.depthRole === "starter" || q.depthRole === "rotation")
    ).length;
    if (highUsageCore <= 1 && p.depthRole === "starter") share += 0.06;
    if (highUsageCore >= 4) share -= 0.04;

    // Tiny weight so the function references role weighting (keeps model coherent).
    share += (ROLE_WEIGHT[p.depthRole] - 0.5) * 0.02;

    out.set(p.id, {
      positionCompetition,
      availableUsageShare: clamp(Math.round(share * 100) / 100, 0.85, 1.18),
    });
  }

  return out;
}
