// ---------------------------------------------------------------------------
// Live ingestion engine — pulls REAL EuroLeague stats from the official public
// API and REFRESHES the DB (upsert, never wipes users/drafts/watchlists), then
// recomputes every projection + fantasy value via the same engines.
//
// Used by:
//   • scripts/ingest-euroleague.ts  (npm run db:ingest — manual/full refresh)
//   • src/app/api/cron/ingest       (daily Vercel Cron)
//
// Data sources (public, no auth):
//   • v3 statistics ......... team offense, team opponent (allowed), player prod.
//   • feeds (incrowdsports) . club roster people -> position / height / country
// ---------------------------------------------------------------------------

import { prisma } from "./db";
import { computeFantasyPoints, Position } from "./types";
import { fantasyFriendliness } from "./matchup";
import { recomputeAllProjections } from "./recomputeAll";
import { titleCase, splitStatsName } from "./names";
import { rosterStatus } from "./rosterStatus";

const V3 = "https://api-live.euroleague.net/v3/competitions/E/statistics";

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
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function num(v: any, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
const round1 = (n: number) => Math.round(n * 10) / 10;

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

// "E2025" -> "2025-26"
export function seasonLabel(seasonCode: string): string {
  const y = num(seasonCode.replace(/\D/g, ""), 2025);
  return `${y}-${String(y + 1).slice(2)}`;
}

export interface IngestResult {
  season: string;
  teams: number;
  players: number;
  projections: number;
  skipped: number;
}

// -----------------------------------------------------------------------------
// Refresh the DB from the live API. Upserts teams + players + season stats and
// recomputes projections. Does NOT delete users, draft rooms, or watchlists.
// -----------------------------------------------------------------------------
export async function ingestLiveSeason(
  seasonCode = process.env.EL_SEASON_CODE || "E2025"
): Promise<IngestResult> {
  const SEASON = seasonLabel(seasonCode);
  const FEED =
    "https://feeds.incrowdsports.com/provider/euroleague-feeds/v2/competitions/E/seasons/" +
    seasonCode;
  const mode = `SeasonMode=Single&SeasonCode=${seasonCode}&statisticMode=perGame&limit=500`;

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
  const tradByCode = new Map<string, any>(teamTrad.map((t) => [t.team.code, t]));

  // Roster people per club -> position / height / country / head coach.
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
      } catch {
        /* a missing roster is non-fatal — position falls back to inference */
      }
    })
  );

  // ---- Teams (upsert by shortName) --------------------------------------
  const teamIdByCode = new Map<string, string>();
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
    const data = {
      name: t.team.name,
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
    };

    const existing = await prisma.team.findFirst({ where: { shortName: code } });
    if (existing) {
      await prisma.team.update({ where: { id: existing.id }, data });
      teamIdByCode.set(code, existing.id);
    } else {
      const row = await prisma.team.create({ data: { shortName: code, ...data } });
      teamIdByCode.set(code, row.id);
    }
  }

  // ---- Players + season stat line (upsert by first+last name) ------------
  let players_ = 0,
    skipped = 0;
  for (const row of players) {
    const p = row.player;
    if (!p?.code) {
      skipped++;
      continue;
    }
    const person = personByCode.get(p.code);
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

    const playerData = {
      position,
      nationality,
      age: num(p.age, 25),
      heightCm: heightCm > 0 ? heightCm : null,
      teamId,
      status: "signed",
      depthRole: depthRole(min),
      fantasyPrice: priceFromFp(fp),
    };
    const statLine = {
      teamSnapshot: teamCode,
      games: Math.round(num(row.gamesPlayed)),
      minutes: min,
      ...line,
      usage: usageRate(row, teamCode ? tradByCode.get(teamCode) : null),
      pir: round1(num(row.pir)),
      fantasyPoints: fp,
      fpStdev: round1(Math.max(fp, 2) * 0.34),
    };

    const existing = await prisma.player.findFirst({ where: { firstName, lastName } });
    const playerId = existing
      ? (await prisma.player.update({ where: { id: existing.id }, data: playerData })).id
      : (await prisma.player.create({ data: { firstName, lastName, tags: "", ...playerData } })).id;

    await prisma.playerSeasonStat.upsert({
      where: { playerId_season: { playerId, season: SEASON } },
      create: { playerId, season: SEASON, ...statLine },
      update: statLine,
    });
    players_++;
  }

  const projections = await recomputeAllProjections();
  return { season: SEASON, teams: teamTrad.length, players: players_, projections, skipped };
}

// ---------------------------------------------------------------------------
// Next-season roster ingest ("Roster Race"): who has signed where for the
// upcoming season. Source: feeds clubs/{code}/people for EL_NEXT_SEASON_CODE.
// ---------------------------------------------------------------------------
export async function ingestRosters(
  seasonCode = process.env.EL_NEXT_SEASON_CODE || "E2026"
): Promise<{ season: string; teams: number; entries: number }> {
  const SEASON = seasonLabel(seasonCode);
  const FEED =
    "https://feeds.incrowdsports.com/provider/euroleague-feeds/v2/competitions/E/seasons/" +
    seasonCode;

  const clubsRaw = await getJson(`${FEED}/clubs`);
  const clubs: any[] = clubsRaw.data ?? [];

  // Players with their latest season snapshot, for returning/transfer matching.
  const dbPlayers = await prisma.player.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      seasonStats: { orderBy: { season: "desc" }, take: 1, select: { teamSnapshot: true } },
    },
  });
  // Fallback: a stats-name that doesn't exactly match a DB player falls
  // through to status "new" with playerId null — acceptable, since the
  // rosterEntry upsert key is (season, teamCode, personCode), not this match.
  const byName = new Map(
    dbPlayers.map((p) => [`${p.firstName.toLowerCase()}|${p.lastName.toLowerCase()}`, p])
  );

  // Fetch every club's roster people in parallel first. A failed fetch
  // resolves to `null` (distinct from a successful-but-empty `[]`) so it can
  // be excluded from the stale-entry sweep below.
  const peopleByClub = await Promise.all(
    clubs.map(async (c) => {
      try {
        const people: any[] = await getJson(`${FEED}/clubs/${c.code}/people`);
        return { club: c, people };
      } catch {
        return { club: c, people: null as any[] | null }; // clubs without a published roster yet are fine
      }
    })
  );

  // Sequential upsert loop (safe for the connection pool), tracking every
  // personCode touched per club that had a successful fetch.
  let entries = 0;
  const touchedByClub = new Map<string, string[]>();
  for (const { club: c, people } of peopleByClub) {
    if (!people || people.length === 0) continue; // no evidence of a real roster this run; don't sweep
    const touched: string[] = [];
    for (const rec of people) {
      if (rec.typeName !== "Player" || !rec.person?.code) continue;
      const { first, last } = splitStatsName(rec.person.name || "");
      if (!last) continue;
      const matched = byName.get(`${first.toLowerCase()}|${last.toLowerCase()}`) ?? null;
      const status = rosterStatus(
        matched ? { teamSnapshot: matched.seasonStats[0]?.teamSnapshot ?? null } : null,
        c.code
      );
      const data = {
        teamName: c.name ?? c.code,
        name: `${first} ${last}`.trim(),
        position: rec.positionName ?? "",
        dorsal: rec.dorsal ?? "",
        status,
        playerId: matched?.id ?? null,
      };
      await prisma.rosterEntry.upsert({
        where: { season_teamCode_personCode: { season: SEASON, teamCode: c.code, personCode: rec.person.code } },
        update: data,
        create: { season: SEASON, teamCode: c.code, personCode: rec.person.code, ...data },
      });
      entries++;
      touched.push(rec.person.code);
    }
    touchedByClub.set(c.code, touched);
  }

  // Stale-entry sweep: drop RosterEntry rows for this season that weren't
  // touched this run, but only for clubs whose fetch succeeded.
  for (const [code, codes] of touchedByClub) {
    await prisma.rosterEntry.deleteMany({
      where: { season: SEASON, teamCode: code, personCode: { notIn: [...codes] } },
    });
  }

  return { season: SEASON, teams: clubs.length, entries };
}

// ---------------------------------------------------------------------------
// Daily projection snapshot (feeds the "Movers" board: Δ value vs yesterday).
// ---------------------------------------------------------------------------
export async function snapshotProjections(): Promise<{ date: string; count: number }> {
  const date = new Date().toISOString().slice(0, 10);
  const projections = await prisma.projection.findMany({
    select: { playerId: true, valueScore: true, projFantasyPoints: true },
  });
  for (const p of projections) {
    await prisma.projectionSnapshot.upsert({
      where: { playerId_date: { playerId: p.playerId, date } },
      update: { valueScore: p.valueScore, projFantasyPoints: p.projFantasyPoints },
      create: { playerId: p.playerId, date, valueScore: p.valueScore, projFantasyPoints: p.projFantasyPoints },
    });
  }
  return { date, count: projections.length };
}
