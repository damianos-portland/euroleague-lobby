import { getAllPlayers } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { RangeView } from "@/components/RangeView";

export const dynamic = "force-dynamic";

export default async function RangePage() {
  const players = await getAllPlayers();
  return (
    <>
      <PageHeader
        title="Hot / Cold — Εύρος FP"
        subtitle="Πόσα fantasy points (PIR) προβλέπεται να κάνει κάθε παίκτης σε hot μέρα (ceiling) και σε cold μέρα (floor), γύρω από τον μέσο όρο. Η διακύμανση είναι μεγαλύτερη για streaky προφίλ (ψηλό usage, νεαροί) και μικρότερη για σταθερούς παίκτες με πολλά λεπτά."
      />
      <RangeView players={players} />
    </>
  );
}
