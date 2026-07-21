import { getAllPlayers, getTeams } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { PlayerExplorer } from "@/components/PlayerExplorer";

export const dynamic = "force-dynamic";

export default async function ValuePage() {
  const [players, teams] = await Promise.all([getAllPlayers(), getTeams()]);
  return (
    <>
      <PageHeader
        title="Fantasy Value Engine"
        subtitle="Value score, points-per-credit, risk-adjusted value, upside, consistency, ownership prediction & buy/sell/hold — όλα από projected FP, τιμή, σταθερότητα, matchup difficulty και injury risk."
      />
      <PlayerExplorer players={players} teams={teams} mode="value" />
    </>
  );
}
