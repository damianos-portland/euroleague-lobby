import { getAllPlayers, getTeams } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { ScoutView } from "@/components/ScoutView";

export const dynamic = "force-dynamic";

export default async function ScoutPage() {
  const [players, teams] = await Promise.all([getAllPlayers(), getTeams()]);
  return (
    <>
      <PageHeader
        title="Scout — Διάγραμμα & Προτάσεις"
        subtitle="Fantasy points × κόστος σε διάγραμμα (όσο πιο πάνω-δεξιά, τόσο καλύτερα) και rule-based προτάσεις με βάση το τι ψάχνεις: φθηνά διαμάντια, καθαρά FFP, value/credit, σιγουριά ή differential."
      />
      <ScoutView players={players} teams={teams} />
    </>
  );
}
