import { getAllPlayers, getTeams } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { PlayerExplorer } from "@/components/PlayerExplorer";

export const dynamic = "force-dynamic";

export default async function PlayersPage() {
  const [players, teams] = await Promise.all([getAllPlayers(), getTeams()]);
  return (
    <>
      <PageHeader
        title="Players — Στατιστικά Σεζόν"
        subtitle="Περσινά per-game στατιστικά + fantasy τιμή & value per credit. Φίλτρα ανά ομάδα, θέση, τιμή. Κλικ στη στήλη για ταξινόμηση."
      />
      <PlayerExplorer players={players} teams={teams} mode="stats" />
    </>
  );
}
