// ---------------------------------------------------------------------------
// Recompute every player's projection + value from current DB state.
//   run with:  npm run db:recompute
// Use after tuning the value engine (src/lib/value.ts) so stored recommendations
// reflect the new logic. Safe to re-run (upserts projections only).
// ---------------------------------------------------------------------------

import { prisma } from "../src/lib/db";
import { recomputeAllProjections } from "../src/lib/recomputeAll";

async function main() {
  const n = await recomputeAllProjections();
  const projs = await prisma.projection.groupBy({ by: ["recommendation"], _count: true });
  console.log(`Recomputed ${n} projections.`);
  console.log("Recommendation distribution:", JSON.stringify(projs));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
