// ---------------------------------------------------------------------------
// Seed per-round injuries/absences. Run OFFLINE from here (not from the app):
//   npm run db:seed-injuries -- <matchdayId> <round>
// Pulls the official EuroLeague Fantasy availability flags (is_injured /
// probability_of_playing) as the reliable backbone, writes English notes, and
// replaces the notes for that round. Enrich individual notes by editing rows
// or extending EXTRA below with researched/translated context.
// ---------------------------------------------------------------------------
import { prisma } from "../src/lib/db";

const MATCHDAY = process.argv[2] || "1530";
const ROUND = Number(process.argv[3] || "2");

// Optional hand-written English context per player (from researched/translated
// domestic media). Keyed by normalized "first last". Extend from here.
const EXTRA: Record<string, string> = {
  // "player name": "Torn ACL — out for the season (source: ...)",
};
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

async function main() {
  const token = process.env.FANTAKING_TOKEN;
  if (!token) throw new Error("FANTAKING_TOKEN missing");
  const res = await fetch(
    `https://fantaking-api.dunkest.com/api/v1/players-lists/49/matchdays/${MATCHDAY}/players?per_page=-1&sort_by=quotation`,
    { headers: { Authorization: `Bearer ${token}`, Origin: "https://euroleaguefantasy.euroleaguebasketball.net", Accept: "application/json" } }
  );
  const d: any = await res.json();
  const arr: any[] = Array.isArray(d) ? d : d.data ?? [];

  const POS: Record<string, string> = { Guard: "G", Forward: "F", Center: "C" };
  const flagged = arr.filter(
    (p) => p.position?.name !== "Head Coach" && (p.is_injured || (p.probability_of_playing ?? 1) < 1)
  );

  const rows = flagged.map((p) => {
    const prob = p.probability_of_playing ?? 1;
    const status = p.is_injured || prob === 0 ? "out" : prob <= 0.5 ? "doubtful" : "questionable";
    const name = `${p.first_name} ${p.last_name}`;
    const extra = EXTRA[norm(name)];
    const note =
      extra ??
      (status === "out"
        ? "Ruled out — unavailable for this round."
        : status === "doubtful"
        ? "Game-time decision — roughly 50% to play."
        : `Questionable — ${Math.round(prob * 100)}% expected to play.`);
    return {
      playerName: name,
      position: POS[p.position?.name] ?? null,
      teamCode: p.team?.abbreviation ?? "?",
      teamName: p.team?.name ?? p.team?.abbreviation ?? "?",
      round: ROUND,
      opponent: p.opponent?.abbreviation ?? null,
      home: p.team?.position === "home",
      status,
      note,
      source: "EuroLeague Fantasy (official availability)",
    };
  });

  await prisma.injuryNote.deleteMany({ where: { round: ROUND } });
  await prisma.injuryNote.createMany({ data: rows });

  const byStatus = rows.reduce((a: Record<string, number>, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  console.log(`Seeded ${rows.length} injury notes for R${ROUND} (matchday ${MATCHDAY}):`, JSON.stringify(byStatus));
  const teams = [...new Set(rows.map((r) => r.teamCode))];
  console.log(`Teams with absences: ${teams.length}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
