import { getAllPlayers, getTeams } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { PlayerExplorer } from "@/components/PlayerExplorer";

export const dynamic = "force-dynamic";

export default async function ProjectionsPage() {
  const [players, teams] = await Promise.all([getAllPlayers(), getTeams()]);
  return (
    <>
      <PageHeader
        title="Player Projections — 2026-27"
        subtitle="Προβλεπόμενη απόδοση με βάση νέα ομάδα, playstyle, pace, διαθέσιμο usage, βάθος roster, ρόλο & περσινά στατιστικά. Ο μηχανισμός ξανατρέχει κάθε εβδομάδα με πραγματικά box scores."
      />
      <PlayerExplorer players={players} teams={teams} mode="projection" />
    </>
  );
}
