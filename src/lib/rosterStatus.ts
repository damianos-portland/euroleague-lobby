// Classify a next-season roster entry relative to our current player DB.
export type RosterEntryStatus = "returning" | "transfer" | "new";

export function rosterStatus(
  matched: { teamSnapshot: string | null } | null,
  teamCode: string
): RosterEntryStatus {
  if (!matched) return "new";
  return matched.teamSnapshot === teamCode ? "returning" : "transfer";
}
