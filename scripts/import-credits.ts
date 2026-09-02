// ---------------------------------------------------------------------------
// Import announced fantasy credits for the new season, then re-tune.
//   run with:  npm run db:import-credits -- <path-to-file>
//
// Accepts JSON or CSV. Flexible keys:
//   JSON: [{ name|player|full_name, credit|cr|price|value, team? }, ...]
//   CSV : a header row containing a name column and a credit column.
//
// Matches each row to a Player by normalised name (accent/'.'-insensitive,
// order-agnostic on tokens; last-name fallback). Updates fantasyPrice, reports
// unmatched rows, then recomputes every projection so value/recommendations
// reflect the real prices.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import { prisma } from "../src/lib/db";
import { recomputeAllProjections } from "../src/lib/recomputeAll";

interface CreditRow { name: string; credit: number; team?: string }

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
const tokenKey = (s: string) => norm(s).split(" ").filter(Boolean).sort().join(" ");

function parseFile(path: string): CreditRow[] {
  const raw = fs.readFileSync(path, "utf8").trim();
  if (raw[0] === "[" || raw[0] === "{") {
    const j = JSON.parse(raw);
    const arr: any[] = Array.isArray(j) ? j : j.players || j.data || j.rows || [];
    return arr
      .map((r) => ({
        name: String(r.name ?? r.player ?? r.full_name ?? r.playerName ?? "").trim(),
        credit: Number(r.credit ?? r.cr ?? r.price ?? r.value ?? r.fantasyPrice),
        team: r.team ?? r.team_code ?? r.club,
      }))
      .filter((r) => r.name && Number.isFinite(r.credit));
  }
  // CSV
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(/[,;\t]/).map((h) => norm(h));
  const nameIdx = header.findIndex((h) => /(name|player)/.test(h));
  const crIdx = header.findIndex((h) => /(credit|cr|price|value|cost)/.test(h));
  if (nameIdx < 0 || crIdx < 0) throw new Error(`CSV needs a name column and a credit column. Got header: ${header.join(", ")}`);
  return lines.slice(1)
    .map((l) => l.split(/[,;\t]/))
    .map((c) => ({ name: (c[nameIdx] ?? "").trim(), credit: Number(c[crIdx]) }))
    .filter((r) => r.name && Number.isFinite(r.credit));
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: npm run db:import-credits -- <path-to-file.json|.csv>");
  const rows = parseFile(path);
  console.log(`Parsed ${rows.length} credit rows from ${path}.`);

  const players = await prisma.player.findMany({ select: { id: true, firstName: true, lastName: true } });
  // Build lookups: full-name token set, and lastName -> [players].
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
      // last-name fallback (only if unambiguous)
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
    console.log(`\n⚠ ${unmatched.length} unmatched (fix names or add manual map):`);
    unmatched.forEach((u) => console.log("  - " + u));
  }

  console.log("\nRecomputing projections with the new credits…");
  const n = await recomputeAllProjections();
  const dist = await prisma.projection.groupBy({ by: ["recommendation"], _count: true });
  const ppc = (await prisma.projection.findMany({ select: { pointsPerCredit: true } }))
    .map((x) => x.pointsPerCredit).sort((a, b) => a - b);
  const q = (f: number) => ppc[Math.floor(ppc.length * f)]?.toFixed(2);
  console.log(`Recomputed ${n} projections.`);
  console.log("Recommendation distribution:", JSON.stringify(dist));
  console.log(`pointsPerCredit p10/median/p90: ${q(0.1)} / ${q(0.5)} / ${q(0.9)}  (re-check FAIR_PPC if median drifts from 1.0)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
