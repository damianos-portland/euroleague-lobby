// ---------------------------------------------------------------------------
// Seed per-round injuries/absences. Run OFFLINE from here (not from the app):
//   npm run db:seed-injuries
// Data is CURATED by hand from every available source (Eurohoops official
// injury reports, EuroLeague/Greek media, verified against who actually played
// R1) and translated to English. The fantaking availability flags alone are
// incomplete, so we do not rely on them. Update CURATED each round.
// ---------------------------------------------------------------------------
import { prisma } from "../src/lib/db";

const ROUND = 2;
type Row = { team: string; teamName: string; player: string; pos: string; status: "out" | "doubtful" | "questionable"; note: string };

// team = our Team.shortName (matches Fixture codes). Sources merged 2026-09-28.
const CURATED: Row[] = [
  // Panathinaikos — 4 confirmed out (Eurohoops R1 injury report)
  { team: "PAN", teamName: "Panathinaikos AKTOR Athens", player: "Kendrick Nunn", pos: "G", status: "out", note: "Knee surgery — could miss the start of the season." },
  { team: "PAN", teamName: "Panathinaikos AKTOR Athens", player: "Kostas Sloukas", pos: "G", status: "out", note: "Knee injury (missed the 2026 postseason)." },
  { team: "PAN", teamName: "Panathinaikos AKTOR Athens", player: "Nigel Hayes-Davis", pos: "F", status: "out", note: "Broken finger — ~6-week recovery." },
  { team: "PAN", teamName: "Panathinaikos AKTOR Athens", player: "Moustapha Fall", pos: "C", status: "out", note: "Hamstring strain." },

  // Olympiacos — reported absence (user report; played R1 but flagged out for R2)
  { team: "OLY", teamName: "Olympiacos Piraeus", player: "Nikola Milutinov", pos: "C", status: "out", note: "Reported out — to be confirmed (played R1 but limited)." },

  // Barcelona
  { team: "BAR", teamName: "FC Barcelona", player: "Josh Nebo", pos: "C", status: "out", note: "Sidelined up to 3 weeks." },
  { team: "BAR", teamName: "FC Barcelona", player: "Tosan Evbuomwan", pos: "F", status: "out", note: "Shoulder injury — out at least 3 weeks." },
  { team: "BAR", teamName: "FC Barcelona", player: "Yoan Makoundou", pos: "C", status: "out", note: "Knee injury — out ~6 weeks." },

  // Anadolu Efes
  { team: "IST", teamName: "Anadolu Efes Istanbul", player: "Isaia Cordinier", pos: "G", status: "out", note: "Post-surgery — ~4-month recovery." },
  { team: "IST", teamName: "Anadolu Efes Istanbul", player: "Georgios Papagiannis", pos: "C", status: "out", note: "ACL (Oct 2025) — long-term, ~8 months." },
  { team: "IST", teamName: "Anadolu Efes Istanbul", player: "Mike James", pos: "G", status: "doubtful", note: "Game-time decision — status uncertain." },

  // Crvena Zvezda
  { team: "RED", teamName: "Crvena Zvezda Meridianbet Belgrade", player: "Nikola Djurisic", pos: "G", status: "out", note: "Thigh injury — 3-4 week timeline." },
  { team: "RED", teamName: "Crvena Zvezda Meridianbet Belgrade", player: "Aleksej Nedeljkovic", pos: "F", status: "out", note: "Ruled out." },
  { team: "RED", teamName: "Crvena Zvezda Meridianbet Belgrade", player: "Patrick Baldwin Jr", pos: "C", status: "doubtful", note: "Game-time decision." },

  // Zalgiris
  { team: "ZAL", teamName: "Zalgiris Kaunas", player: "Nigel Williams-Goss", pos: "G", status: "out", note: "Injured in R1 — out around 2 weeks." },
  { team: "ZAL", teamName: "Zalgiris Kaunas", player: "Saben Lee", pos: "G", status: "doubtful", note: "Hamstring — game-time decision." },

  // Partizan
  { team: "PAR", teamName: "Partizan Mozzart Bet Belgrade", player: "Derek Willis", pos: "F", status: "out", note: "Ankle injury — sidelined several weeks." },
  { team: "PAR", teamName: "Partizan Mozzart Bet Belgrade", player: "Vanja Marinkovic", pos: "G", status: "out", note: "Ruled out." },
  { team: "PAR", teamName: "Partizan Mozzart Bet Belgrade", player: "Joffrey Lauvergne", pos: "C", status: "doubtful", note: "Game-time decision." },

  // Besiktas
  { team: "BES", teamName: "Besiktas Istanbul", player: "DaQuan Jeffries", pos: "F", status: "out", note: "Wrist fracture (injured vs Valencia)." },
  { team: "BES", teamName: "Besiktas Istanbul", player: "Mady Sissoko", pos: "C", status: "out", note: "Frozen contract due to a health issue." },

  // Hapoel Tel Aviv
  { team: "HTA", teamName: "Hapoel IBI Tel Aviv", player: "Tamir Blatt", pos: "G", status: "out", note: "~2 more weeks to recover; future uncertain." },
  { team: "HTA", teamName: "Hapoel IBI Tel Aviv", player: "Amir Coffey", pos: "F", status: "out", note: "Ruled out." },
  { team: "HTA", teamName: "Hapoel IBI Tel Aviv", player: "Tyler Ennis", pos: "G", status: "out", note: "Ruled out." },
  { team: "HTA", teamName: "Hapoel IBI Tel Aviv", player: "Tomer Ginat", pos: "F", status: "doubtful", note: "Game-time decision." },

  // Bayern Munich (roster/availability)
  { team: "MUN", teamName: "FC Bayern Munich", player: "Duane Washington", pos: "G", status: "doubtful", note: "Availability/roster question." },
  { team: "MUN", teamName: "FC Bayern Munich", player: "Kamar Baldwin", pos: "G", status: "doubtful", note: "Availability/roster question." },
  { team: "MUN", teamName: "FC Bayern Munich", player: "Niels Giffey", pos: "F", status: "doubtful", note: "Availability/roster question." },

  // Valencia
  { team: "PAM", teamName: "Valencia Basket", player: "Neal Sako", pos: "C", status: "out", note: "Groin injury (as of Sept 22)." },
  { team: "PAM", teamName: "Valencia Basket", player: "Nikola Mirotic", pos: "F", status: "doubtful", note: "Game-time decision." },

  // Dubai (Bacon EXCLUDED — played R1 & starred 34.1)
  { team: "DUB", teamName: "Dubai Basketball", player: "Dzanan Musa", pos: "G", status: "out", note: "Ruled out." },
  { team: "DUB", teamName: "Dubai Basketball", player: "Mam Jaiteh", pos: "C", status: "out", note: "Ruled out." },

  // Fenerbahce
  { team: "ULK", teamName: "Fenerbahce Tarfin Istanbul", player: "Shane Larkin", pos: "G", status: "doubtful", note: "Game-time decision." },
  { team: "ULK", teamName: "Fenerbahce Tarfin Istanbul", player: "Marcus Bingham", pos: "C", status: "doubtful", note: "Game-time decision." },

  // Milan
  { team: "MIL", teamName: "Armani Olimpia Milan", player: "Lorenzo Brown", pos: "G", status: "out", note: "Off the roster." },
  { team: "MIL", teamName: "Armani Olimpia Milan", player: "Garrison Mathews", pos: "G", status: "doubtful", note: "Game-time decision." },

  // Virtus
  { team: "VIR", teamName: "Virtus Bologna", player: "Kevin Kokila", pos: "C", status: "doubtful", note: "Game-time decision." },
];

const SOURCE = "Eurohoops injury report + EuroLeague/Greek media (curated 2026-09-28)";

async function main() {
  const rows = CURATED.map((c) => ({
    playerName: c.player,
    position: c.pos,
    teamCode: c.team,
    teamName: c.teamName,
    round: ROUND,
    opponent: null as string | null, // page derives fixture/opponent from Fixture table
    home: true,
    status: c.status,
    note: c.note,
    source: SOURCE,
  }));
  await prisma.injuryNote.deleteMany({ where: { round: ROUND } });
  await prisma.injuryNote.createMany({ data: rows });
  const byStatus = rows.reduce((a: Record<string, number>, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  const teams = [...new Set(rows.map((r) => r.teamCode))];
  console.log(`Seeded ${rows.length} curated injury notes for R${ROUND}:`, JSON.stringify(byStatus));
  console.log(`Teams with absences: ${teams.length} (${teams.sort().join(", ")})`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
