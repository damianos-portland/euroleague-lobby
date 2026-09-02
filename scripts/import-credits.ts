// ---------------------------------------------------------------------------
// Import the official EuroLeague Fantasy credits, then re-tune.
//   run with:  npm run db:import-credits
//
// Pulls credits live from the fantaking API when FANTAKING_TOKEN is set,
// otherwise from the committed seed (data/fantasy-credits-2026-27.json).
// Matches each to a Player by normalised name, updates fantasyPrice, reports
// unmatched rows, then recomputes every projection.
// ---------------------------------------------------------------------------

import { prisma } from "../src/lib/db";
import { recomputeAllProjections } from "../src/lib/recomputeAll";
import { getFantasyCredits } from "../src/lib/fantasyCredits";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
const tokenKey = (s: string) => norm(s).split(" ").filter(Boolean).sort().join(" ");

async function main() {
  const { rows, source } = await getFantasyCredits();
  console.log(`Loaded ${rows.length} credit rows (source: ${source}).`);

  const players = await prisma.player.findMany({ select: { id: true, firstName: true, lastName: true } });
  const byTokens = new Map<string, string>();
  const byLast = new Map<string, string[]>();
  for (const p of players) {
    byTokens.set(tokenKey(`${p.firstName} ${p.lastName}`), p.id);
    const lk = norm(p.lastName);
    (byLast.get(lk) ?? byLast.set(lk, []).get(lk)!).push(p.id);
  }

  let matched = 0;
  const unmatched: string[] = [];
  for (const r of rows) {
    let id = byTokens.get(tokenKey(r.name));
    if (!id) {
      const last = norm(r.name).split(" ").filter(Boolean).pop() ?? "";
      const cands = byLast.get(last);
      if (cands && cands.length === 1) id = cands[0];
    }
    if (!id) { unmatched.push(`${r.name} (${r.credit})`); continue; }
    await prisma.player.update({ where: { id }, data: { fantasyPrice: r.credit } });
    matched++;
  }

  console.log(`Updated fantasyPrice for ${matched}/${rows.length} players.`);
  if (unmatched.length) {
    console.log(`\n${unmatched.length} unmatched (likely not in our roster / deep bench):`);
    unmatched.slice(0, 40).forEach((u) => console.log("  - " + u));
    if (unmatched.length > 40) console.log(`  … and ${unmatched.length - 40} more`);
  }

  console.log("\nRecomputing projections with the new credits…");
  const n = await recomputeAllProjections();
  const dist = await prisma.projection.groupBy({ by: ["recommendation"], _count: true });
  const ppc = (await prisma.projection.findMany({ select: { pointsPerCredit: true } }))
    .map((x) => x.pointsPerCredit).sort((a, b) => a - b);
  const q = (f: number) => ppc[Math.floor(ppc.length * f)]?.toFixed(2);
  console.log(`Recomputed ${n} projections.`);
  console.log("Recommendation distribution:", JSON.stringify(dist));
  console.log(`pointsPerCredit p10/p25/median/p75/p90: ${q(0.1)} / ${q(0.25)} / ${q(0.5)} / ${q(0.75)} / ${q(0.9)}`);
  console.log("→ if median drifts far from 1.0, adjust FAIR_PPC in src/lib/value.ts and re-run db:recompute.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
