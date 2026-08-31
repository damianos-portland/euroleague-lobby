// Preseason transition: rebuild the Player base from the new season's rosters
// (returning players keep last-season stats, newcomers become "unproven",
// departed players are marked). Run once when the new season's rosters are set.
//   run with:  npm run db:season-open
import { prisma } from "../src/lib/db";
import { ingestPreseasonRoster } from "../src/lib/ingest";

async function main() {
  console.log("→ Opening season: rebuilding Player base from new-season rosters…");
  const r = await ingestPreseasonRoster();
  console.log("✓ Season opened:", r);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
