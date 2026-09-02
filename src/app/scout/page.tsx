import { getAllPlayers, getTeams } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { ScoutView } from "@/components/ScoutView";

export const dynamic = "force-dynamic";

export default async function ScoutPage() {
  const [players, teams, fixtures] = await Promise.all([
    getAllPlayers(),
    getTeams(),
    prisma.fixture.findMany({ orderBy: { date: "asc" } }),
  ]);
  const friendliness: Record<string, number> = {};
  for (const t of teams) friendliness[t.shortName.toUpperCase()] = t.fantasyFriendliness;
  const fixturesDTO = fixtures.map((f) => ({
    round: f.round,
    date: f.date.toISOString(),
    homeCode: f.homeCode,
    awayCode: f.awayCode,
  }));

  return (
    <>
      <PageHeader
        title="Scout — Διάγραμμα, Προτάσεις & Προβλέψεις"
        subtitle="FP×κόστος διάγραμμα, rule-based προτάσεις με intent, και προβλέψεις αναμενόμενων FFP + εύρους credit για τα επόμενα 3/5/10 παιχνίδια βάσει προγράμματος & αντιπάλων."
      />
      <ScoutView
        players={players}
        teams={teams}
        fixtures={fixturesDTO}
        friendliness={friendliness}
        nowMs={Date.now()}
      />
    </>
  );
}
