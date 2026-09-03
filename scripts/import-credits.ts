// ---------------------------------------------------------------------------
// Sync the official EuroLeague Fantasy roster + credits, then re-tune.
//   run with:  npm run db:import-credits
//
// Pulls the game's player list live from the fantaking API when FANTAKING_TOKEN
// is set, otherwise from the committed seed. For every game player it refreshes
// fantasyPrice AND team, creating any player we don't have (credit-based), then
// recomputes all projections.
// ---------------------------------------------------------------------------

import { prisma } from "../src/lib/db";
import { applyFantasyCredits } from "../src/lib/ingest";

async function main() {
  const res = await applyFantasyCredits();
  console.log(
    `Roster sync (source: ${res.source}): ${res.total} game players → updated ${res.updated}, ` +
      `created ${res.created}, deleted ${res.deleted} (not in game list).`
  );
  if (res.unknownTeams.length) console.log("Unmapped team codes:", res.unknownTeams.join(", "));

  const dist = await prisma.projection.groupBy({ by: ["recommendation"], _count: true });
  const total = await prisma.player.count({ where: { projection: { isNot: null }, teamId: { not: null } } });
  console.log("Projected players with a team:", total);
  console.log("Recommendation distribution:", JSON.stringify(dist));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
