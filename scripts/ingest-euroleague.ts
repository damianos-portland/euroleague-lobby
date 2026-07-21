// ---------------------------------------------------------------------------
// Live ingestion — pulls REAL EuroLeague 2025-26 stats from the official
// public API and loads them into the DB, replacing the synthetic seed data.
// Then it recomputes every projection + fantasy value via the same engines.
//
//   run with:  npm run db:ingest
//
// Data sources (public, no auth):
//   • v3 statistics ......... team offense, team opponent (allowed), player prod.
//   • feeds (incrowdsports) . club roster people -> position / height / country
// ---------------------------------------------------------------------------

import { PrismaClient } from "@prisma/client";
import { computeFantasyPoints, Position } from "../src/lib/types";
import { fantasyFriendliness } from "../src/lib/matchup";
import { recomputeAllProjections } from "../src/lib/recomputeAll";

const prisma = new PrismaClient();

const SEASON = "2025-26";
const SEASON_CODE = "E2025";
const V3 = "https://api-live.euroleague.net/v3/competitions/E/statistics";
const FEED =
  "https://feeds.incrowdsports.com/provider/euroleague-feeds/v2/competitions/E/seasons/" +
  SEASON_CODE;

// Static per-code metadata the stats API does not expose (city/country/colors).
const TEAM_META: Record<string, { city: string; country: string; c1: string; c2: string }> = {
  MAD: { city: "Madrid", country: "Spain", c1: "#e4e4e4", c2: "#0b0f1c" },
  BAR: { city: "Barcelona", country: "Spain", c1: "#a50044", c2: "#004d98" },
  PAN: { city: "Athens", country: "Greece", c1: "#0a6b34", c2: "#f2f2f2" },
  OLY: { city: "Piraeus", country: "Greece", c1: "#c8102e", c2: "#ffffff" },
  ULK: { city: "Istanbul", country: "Turkey", c1: "#f5d800", c2: "#0a1a4f" },
  IST: { city: "Istanbul", country: "Turkey", c1: "#0033a0", c2: "#ffffff" },
  MCO: { city: "Monaco", country: "Monaco", c1: "#c8102e", c2: "#ffffff" },
  ASV: { city: "Villeurbanne", country: "France", c1: "#c8102e", c2: "#1a1a1a" },
  PRS: { city: "Paris", country: "France", c1: "#e30613", c2: "#0b0f1c" },
  MIL: { city: "Milan", country: "Italy", c1: "#c8102e", c2: "#ffffff" },
  VIR: { city: "Bologna", country: "Italy", c1: "#0b0f1c", c2: "#ffffff" },
  RED: { city: "Belgrade", country: "Serbia", c1: "#c8102e", c2: "#ffffff" },
  PAR: { city: "Belgrade", country: "Serbia", c1: "#0b0f1c", c2: "#ffffff" },
  MUN: { city: "Munich", country: "Germany", c1: "#c8102e", c2: "#0b0f1c" },
  BAS: { city: "Vitoria-Gasteiz", country: "Spain", c1: "#00259d", c2: "#ffffff" },
  PAM: { city: "Valencia", country: "Spain", c1: "#f36f21", c2: "#0b0f1c" },
  ZAL: { city: "Kaunas", country: "Lithuania", c1: "#0a6b34", c2: "#ffffff" },
  TEL: { city: "Tel Aviv", country: "Israel", c1: "#f5d800", c2: "#00398f" },
  HTA: { city: "Tel Aviv", country: "Israel", c1: "#c8102e", c2: "#1a1a1a" },
  DUB: { city: "Dubai", country: "UAE", c1: "#0b0f1c", c2: "#e4b04a" },
};

async function getJson(url: string): Promise<any> {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function num(v: any, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
const round1 = (n: number) => Math.round(n * 10) / 10;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'.])([a-zà-ÿ])/g, (_m, b, c) => b + c.toUpperCase())
    // Keep Roman-numeral suffixes and "Mc"/"Mac" prefixes readable.
    .replace(/\b(Ii|Iii|Iv|Vi|Vii|Jr|Sr)\b/g, (m) => m.toUpperCase())
    .replace(/\bMc([a-z])/g, (_m, c) => "Mc" + c.toUpperCase());
}

// Split the stats "SURNAME, FIRSTNAME" common name into { first, last }.
function splitStatsName(name: string): { first: string; last: string } {
  const parts = String(name || "").split(",");
  return {
    last: titleCase((parts[0] || "").trim()),
    first: titleCase((parts[1] || "").trim()),
  };
}

// A possession estimate from a traditional box line (per game).
function possessions(o: any): number {
  const fga = num(o.twoPointersAttempted) + num(o.threePointersAttempted);
  return fga + 0.44 * num(o.freeThrowsAttempted) - num(o.offensiveRebounds) + num(o.turnovers);
}

function depthRole(min: number): string {
  if (min >= 24) return "starter";
  if (min >= 15) return "rotation";
  if (min >= 8) return "bench";
  return "deep_bench";
}

// Fantasy credit price derived from raw per-game production (~3-20 credits).
function priceFromFp(fp: number): number {
  return round1(Math.max(3, Math.min(20, 3 + fp * 0.5)));
}

// Coarse Guard/Forward/Center + stats/height -> PG/SG/SF/PF/C.
function refinePosition(coarse: string | null, s: any, heightCm: number): Position {
  const reb = num(s.totalRebounds);
  const ast = num(s.assists);
  const h = heightCm || 0;
  if (coarse === "Guard") return ast >= 3.5 || ast > reb ? "PG" : "SG";
  if (coarse === "Forward") return h >= 205 || reb >= 5.5 ? "PF" : "SF";
  if (coarse === "Center") return "C";
  // No roster position -> infer from height, fall back to stats.
  if (h >= 208) return "C";
  if (h >= 203) return "PF";
  if (h >= 198) return "SF";
  if (h >= 193) return "SG";
  if (h > 0) return "PG";
  if (reb >= 6) return "C";
  if (reb >= 4.5) return "PF";
  if (ast >= 3.5) return "PG";
  return "SG";
}

// Proper usage%: share of team plays a player uses while on the floor.
function usageRate(s: any, team: any): number {
  const min = num(s.minutesPlayed);
  if (!team || min <= 0) return 0;
  const pPlays = num(s.twoPointersAttempted) + num(s.threePointersAttempted) + 0.44 * num(s.freeThrowsAttempted) + num(s.turnovers);
  const tFga = num(team.twoPointersAttempted) + num(team.threePointersAttempted);
  const tPlays = tFga + 0.44 * num(team.freeThrowsAttempted) + num(team.turnovers);
  if (tPlays <= 0) return 0;
  return round1(Math.max(0, Math.min(60, (100 * pPlays * 40) / (min * tPlays))));
}

async function main() {
  console.log(`→ Fetching live ${SEASON} data from EuroLeague API…`);
  const mode = "SeasonMode=Single&SeasonCode=" + SEASON_CODE + "&statisticMode=perGame&limit=500";
  const [teamTradRaw, teamOppRaw, playerRaw, clubsRaw] = await Promise.all([
    getJson(`${V3}/teams/traditional?${mode}`),
    getJson(`${V3}/teams/opponentsTraditional?${mode}`),
    getJson(`${V3}/players/traditional?${mode}`),
    getJson(`${FEED}/clubs`),
  ]);

  const teamTrad: any[] = teamTradRaw.teams ?? [];
  const teamOpp: any[] = teamOppRaw.teams ?? [];
  const players: any[] = playerRaw.players ?? [];
  const clubs: any[] = clubsRaw.data ?? [];
  const oppByCode = new Map<string, any>(teamOpp.map((t) => [t.team.code, t]));
  console.log(`   teams=${teamTrad.length}  players=${players.length}  clubs=${clubs.length}`);

  // Roster people per club -> position / height / country / head coach.
  console.log("→ Fetching club rosters (position, height, nationality, coach)…");
  const personByCode = new Map<string, any>();
  const coachByTeam = new Map<string, string>();
  await Promise.all(
    clubs.map(async (c) => {
      try {
        const people: any[] = await getJson(`${FEED}/clubs/${c.code}/people`);
        for (const rec of people) {
          if (rec.typeName === "Player" && rec.person?.code) {
            personByCode.set(rec.person.code, { ...rec.person, positionName: rec.positionName });
          }
          if (rec.typeName === "Coach" && !coachByTeam.has(c.code)) {
            coachByTeam.set(c.code, titleCase(rec.person?.passportSurname || rec.person?.name || ""));
          }
        }
      } catch (e: any) {
        console.warn(`   ! roster ${c.code}: ${e.message}`);
      }
    })
  );
  console.log(`   matched ${personByCode.size} player records from rosters`);

  // ---- Wipe (mirror seed.ts order) --------------------------------------
  console.log("→ Wiping existing data…");
  await prisma.draftQueueItem.deleteMany();
  await prisma.draftPick.deleteMany();
  await prisma.draftParticipant.deleteMany();
  await prisma.draftRoom.deleteMany();
  await prisma.boxScore.deleteMany();
  await prisma.fantasyAlert.deleteMany();
  await prisma.injuryEvent.deleteMany();
  await prisma.watchlistItem.deleteMany();
  await prisma.rosterMove.deleteMany();
  await prisma.projection.deleteMany();
  await prisma.playerSeasonStat.deleteMany();
  await prisma.player.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();

  // ---- Users (kept so /admin + /draft demo still work) ------------------
  const admin = await prisma.user.create({
    data: { email: "admin@euroleaguelobby.dev", name: "Lobby Admin", role: "admin" },
  });
  const demo = await prisma.user.create({
    data: { email: "demo@euroleaguelobby.dev", name: "Demo Manager", role: "user" },
  });

  // ---- Teams -------------------------------------------------------------
  console.log("→ Loading teams…");
  const teamIdByCode = new Map<string, string>();
  const tradByCode = new Map<string, any>(teamTrad.map((t) => [t.team.code, t]));
  for (const t of teamTrad) {
    const code = t.team.code;
    const opp = oppByCode.get(code) ?? t;
    const meta = TEAM_META[code] ?? { city: "—", country: "—", c1: "#ff5a1f", c2: "#0b0f1c" };
    const pace = round1(possessions(t));
    const oppPace = Math.max(possessions(opp), 1);
    const offRating = round1((num(t.pointsScored) / Math.max(pace, 1)) * 100);
    const defRating = round1((num(opp.pointsScored) / oppPace) * 100);
    const profile = {
      pointsAllowed: round1(num(opp.pointsScored)),
      reboundsAllowed: round1(num(opp.totalRebounds)),
      assistsAllowed: round1(num(opp.assists)),
      turnoversForced: round1(num(opp.turnovers)),
      threePtAllowed: round1(num(opp.threePointersMade)),
    };
    const playstyle =
      `${pace >= 73 ? "Up-tempo" : pace >= 69 ? "Balanced pace" : "Half-court"}, ` +
      `${num(t.threePointersAttempted) >= 27 ? "3PT-heavy" : "inside-out"}`;

    const row = await prisma.team.create({
      data: {
        name: t.team.name,
        shortName: code,
        city: meta.city,
        country: meta.country,
        colorPrimary: meta.c1,
        colorSecondary: meta.c2,
        coach: coachByTeam.get(code) || "—",
        playstyle,
        pace,
        offRating,
        defRating,
        ...profile,
        fantasyFriendliness: fantasyFriendliness({ ...profile, defRating, pace }),
      },
    });
    teamIdByCode.set(code, row.id);
  }

  // ---- Players + 2025-26 season stat line --------------------------------
  console.log("→ Loading players + real season stats…");
  let created = 0,
    skipped = 0;
  for (const row of players) {
    const p = row.player;
    if (!p?.code) {
      skipped++;
      continue;
    }
    const person = personByCode.get(p.code);
    // Name: prefer the stats "common" name (jersey name), which is cleaner than
    // the full legal passport name; fall back to passport fields if missing.
    let { first: firstName, last: lastName } = splitStatsName(p.name);
    if (!lastName && (person?.passportName || person?.passportSurname)) {
      firstName = titleCase(person.passportName || "");
      lastName = titleCase(person.passportSurname || "");
    }
    if (!lastName) {
      skipped++;
      continue;
    }

    const teamCode = p.team?.code ?? null;
    const teamId = teamCode ? teamIdByCode.get(teamCode) ?? null : null;
    const heightCm = num(person?.height) || 0;
    const position = refinePosition(person?.positionName ?? null, row, heightCm);
    const nationality = person?.country?.name || p.team?.name || "—";

    const line = {
      points: round1(num(row.pointsScored)),
      rebounds: round1(num(row.totalRebounds)),
      assists: round1(num(row.assists)),
      steals: round1(num(row.steals)),
      blocks: round1(num(row.blocks)),
      turnovers: round1(num(row.turnovers)),
    };
    const fp = round1(computeFantasyPoints(line));
    const min = round1(num(row.minutesPlayed));

    await prisma.player.create({
      data: {
        firstName,
        lastName,
        position,
        nationality,
        age: num(p.age, 25),
        heightCm: heightCm > 0 ? heightCm : null,
        teamId,
        status: "signed",
        depthRole: depthRole(min),
        fantasyPrice: priceFromFp(fp),
        tags: "",
        seasonStats: {
          create: {
            season: SEASON,
            teamSnapshot: teamCode,
            games: Math.round(num(row.gamesPlayed)),
            minutes: min,
            ...line,
            usage: usageRate(row, teamCode ? tradByCode.get(teamCode) : null),
            pir: round1(num(row.pir)),
            fantasyPoints: fp,
            fpStdev: round1(Math.max(fp, 2) * 0.34),
          },
        },
      },
    });
    created++;
  }
  console.log(`   players created=${created}  skipped=${skipped}`);

  // ---- Projections + value from the real data ---------------------------
  console.log("→ Computing projections + fantasy value…");
  const n = await recomputeAllProjections();
  console.log(`   projections computed=${n}`);

  // ---- Demo draft room (so /draft keeps working) ------------------------
  const room = await prisma.draftRoom.create({
    data: {
      name: "EuroLeague Fantasy Draft 2026 — Demo League",
      ownerId: admin.id,
      status: "lobby",
      draftType: "snake",
      rounds: 10,
      pickSeconds: 60,
      season: SEASON,
    },
  });
  const teamNames = ["Hooping Spartans", "Aegean Ballers", "Piraeus Kings", "Belgrade Bombers", "Istanbul Heat", "Madrid Maestros"];
  for (let i = 0; i < teamNames.length; i++) {
    await prisma.draftParticipant.create({
      data: { roomId: room.id, teamName: teamNames[i], draftOrder: i, userId: i === 0 ? demo.id : null, isAutopick: i !== 0 },
    });
  }

  const counts = {
    teams: await prisma.team.count(),
    players: await prisma.player.count(),
    seasonStats: await prisma.playerSeasonStat.count(),
    projections: await prisma.projection.count(),
  };
  console.log("✓ Live ingest complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
