// ---------------------------------------------------------------------------
// Recompute service — single source of truth for turning stored data into
// Projection + Value rows. Used by the seed script and the admin recalc API.
// ---------------------------------------------------------------------------

import { projectPlayer } from "./projection";
import { evaluateValue } from "./value";
import { difficultyFromFriendliness } from "./matchup";
import {
  ProjectionOutput,
  ValueOutput,
  SeasonStatLine,
  Position,
  DepthRole,
  PlayerStatus,
} from "./types";

export interface ComputeArgs {
  position: Position;
  age: number;
  depthRole: DepthRole;
  status: PlayerStatus;
  fantasyPrice: number;
  changedTeam: boolean;
  positionCompetition: number;
  availableUsageShare: number;
  injuryRiskHint?: number;
  team: { pace: number; offRating: number; defRating: number; fantasyFriendliness?: number };
  last?: SeasonStatLine;
  prior?: SeasonStatLine;
}

export function computeForPlayer(args: ComputeArgs): {
  projection: ProjectionOutput;
  value: ValueOutput;
} {
  const projection = projectPlayer({
    position: args.position,
    age: args.age,
    depthRole: args.depthRole,
    status: args.status,
    fantasyPrice: args.fantasyPrice,
    changedTeam: args.changedTeam,
    positionCompetition: args.positionCompetition,
    team: {
      pace: args.team.pace,
      offRating: args.team.offRating,
      defRating: args.team.defRating,
      availableUsageShare: args.availableUsageShare,
    },
    lastSeason: args.last,
    priorSeason: args.prior,
    injuryRiskHint: args.injuryRiskHint,
  });

  // Use the player's own team friendliness as a rough season-long schedule proxy.
  const matchupDifficulty =
    args.team.fantasyFriendliness != null
      ? difficultyFromFriendliness(args.team.fantasyFriendliness)
      : 50;

  const value = evaluateValue({
    projection,
    fantasyPrice: args.fantasyPrice,
    lastSeason: args.last,
    age: args.age,
    changedTeam: args.changedTeam,
    injuryRiskHint: args.injuryRiskHint,
    matchupDifficulty,
  });

  return { projection, value };
}
