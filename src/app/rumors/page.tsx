import { getNewsItems } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { RumorsFeed, RumorRow } from "@/components/RumorsFeed";

export const dynamic = "force-dynamic";

export default async function RumorsPage() {
  const items = await getNewsItems(80);
  const rows: RumorRow[] = items.map((i) => ({
    id: i.id,
    url: i.url,
    source: i.source,
    title: i.title,
    publishedAt: i.publishedAt.toISOString(),
    kind: i.kind,
    confidence: i.confidence,
    teamCodes: i.teamCodes ? i.teamCodes.split(",").filter(Boolean) : [],
    player: i.player ? { id: i.player.id, name: `${i.player.firstName} ${i.player.lastName}` } : null,
  }));
  const teams = [...new Set(rows.flatMap((r) => r.teamCodes))].sort();

  return (
    <>
      <PageHeader
        title="Rumor Mill"
        status="● FEED LIVE · ΑΝΑΝΕΩΣΗ ΚΑΘΗΜΕΡΙΝΑ 06:00 UTC"
        subtitle="Μεταγραφικά νέα & φήμες από Eurohoops/Sportando — αυτόματα ταξινομημένα, με confidence και matched παίκτες."
      />
      <RumorsFeed items={rows} teams={teams} />
    </>
  );
}
