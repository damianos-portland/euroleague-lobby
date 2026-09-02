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
import { getFantasyCredits } from "./fantasyCredits";
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

// Convert an ACCUMULATED (season-total) player stat row into per-game by
// dividing every numeric field by gamesPlayed. Percentage fields are strings
// and left untouched; gamesPlayed itself is preserved as the count.
function toPerGame(row: any): any {
  const g = Math.max(num(row.gamesPlayed), 1);
  const pg: any = { ...row };
  for (const k of Object.keys(row)) {
    if (typeof row[k] === "number" && k !== "gamesPlayed" && k !== "playerRanking") {
      pg[k] = row[k] / g;
    }
  }
  return pg;
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
  const base = `SeasonMode=Single&SeasonCode=${seasonCode}&limit=1000`;
  const teamMode = `${base}&statisticMode=perGame`;
  // Players: use the ACCUMULATED set (broader coverage than perGame's
  // minutes-thresholded ~208) and convert to per-game via toPerGame() below.
  const playerMode = `${base}&statisticMode=accumulated`;

  const [teamTradRaw, teamOppRaw, playerRaw, clubsRaw] = await Promise.all([
    getJson(`${V3}/teams/traditional?${teamMode}`),
    getJson(`${V3}/teams/opponentsTraditional?${teamMode}`),
    getJson(`${V3}/players/traditional?${playerMode}`),
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
  for (const rawRow of players) {
    const p = rawRow.player;
    if (!p?.code) {
      skipped++;
      continue;
    }
    const personCode = String(p.code);
    const row = toPerGame(rawRow); // accumulated totals -> per-game
    const person = personByCode.get(personCode);
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
      personCode,
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
      games: Math.round(num(rawRow.gamesPlayed)),
      minutes: min,
      ...line,
      usage: usageRate(row, teamCode ? tradByCode.get(teamCode) : null),
      pir: round1(num(row.pir)),
      fantasyPoints: fp,
      fpStdev: round1(Math.max(fp, 2) * 0.34),
    };

    // Match by stable person code first, then fall back to name.
    const existing =
      (await prisma.player.findUnique({ where: { personCode } })) ??
      (await prisma.player.findFirst({ where: { firstName, lastName } }));
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

// ---------------------------------------------------------------------------
// Schedule ingest — pull the full season fixture list from the EuroLeague feed
// and upsert Fixture rows (powers the Scout Predictions matchup forecasts).
// ---------------------------------------------------------------------------
const SCHEDULE_SEASON = process.env.EL_SCHEDULE_SEASON || "E2026";

export async function ingestSchedule(
  season: string = SCHEDULE_SEASON
): Promise<{ season: string; count: number }> {
  const url = `https://feeds.incrowdsports.com/provider/euroleague-feeds/v2/competitions/E/seasons/${season}/games?limit=400`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`schedule fetch ${res.status}`);
  const json = await res.json();
  const games: any[] = json?.data ?? [];
  let count = 0;
  for (const g of games) {
    const home = (g?.home?.tla ?? g?.home?.code ?? "").toUpperCase();
    const away = (g?.away?.tla ?? g?.away?.code ?? "").toUpperCase();
    const round = Number(g?.round?.round);
    const date = g?.date ? new Date(g.date) : null;
    if (!home || !away || !round || !date) continue;
    await prisma.fixture.upsert({
      where: { season_round_homeCode_awayCode: { season, round, homeCode: home, awayCode: away } },
      create: { season, round, date, homeCode: home, awayCode: away, status: g?.status ?? "confirmed" },
      update: { date, status: g?.status ?? "confirmed" },
    });
    count++;
  }
  return { season, count };
}

// ---------------------------------------------------------------------------
// Apply the official EuroLeague Fantasy credits (live via FANTAKING_TOKEN, else
// the committed seed) onto Player.fantasyPrice by normalised-name match, then
// recompute so value/recommendations reflect the real prices. Runs in the daily
// cron AFTER stats/rosters (which reset price to the derived fallback).
// ---------------------------------------------------------------------------
const _norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
const _tok = (s: string) => _norm(s).split(" ").filter(Boolean).sort().join(" ");

export async function applyFantasyCredits(): Promise<{ source: string; matched: number; total: number }> {
  const { rows, source } = await getFantasyCredits();
  const players = await prisma.player.findMany({ select: { id: true, firstName: true, lastName: true } });
  const byTok = new Map<string, string>();
  const byLast = new Map<string, string[]>();
  for (const p of players) {
    byTok.set(_tok(`${p.firstName} ${p.lastName}`), p.id);
    const lk = _norm(p.lastName);
    (byLast.get(lk) ?? byLast.set(lk, []).get(lk)!).push(p.id);
  }
  let matched = 0;
  for (const r of rows) {
    let id = byTok.get(_tok(r.name));
    if (!id) {
      const cands = byLast.get(_norm(r.name).split(" ").filter(Boolean).pop() ?? "");
      if (cands && cands.length === 1) id = cands[0];
    }
    if (!id) continue;
    await prisma.player.update({ where: { id }, data: { fantasyPrice: r.credit } });
    matched++;
  }
  await recomputeAllProjections();
  return { source, matched, total: rows.length };
}

// ---------------------------------------------------------------------------
// Preseason roster transition: rebuild the Player base from the NEW season's
// club rosters BEFORE any games are played. Returning players keep their last
// season's stats (→ real projections); newcomers with no EuroLeague history
// enter as "unproven" (no projection/value); players no longer rostered are
// marked "departed". Teams carry last season's ratings until real stats arrive.
// Once games are played, switch to the normal ingestLiveSeason(EL_SEASON_CODE).
// ---------------------------------------------------------------------------
export async function ingestPreseasonRoster(
  seasonCode = process.env.EL_NEXT_SEASON_CODE || "E2026"
): Promise<{ season: string; teams: number; returning: number; unproven: number; departed: number }> {
  const SEASON = seasonLabel(seasonCode);
  const FEED =
    "https://feeds.incrowdsports.com/provider/euroleague-feeds/v2/competitions/E/seasons/" +
    seasonCode;

  const clubsRaw = await getJson(`${FEED}/clubs`);
  const clubs: any[] = clubsRaw.data ?? [];

  // Fetch every club's people in parallel (players + coach).
  const peopleByClub = await Promise.all(
    clubs.map(async (c) => {
      try {
        return { club: c, people: (await getJson(`${FEED}/clubs/${c.code}/people`)) as any[] };
      } catch {
        return { club: c, people: null as any[] | null };
      }
    })
  );
  const coachByClub = new Map<string, string>();
  for (const { club: c, people } of peopleByClub) {
    if (!people) continue;
    const coach = people.find((r) => r.typeName === "Coach");
    if (coach) coachByClub.set(c.code, titleCase(coach.person?.passportSurname || coach.person?.name || ""));
  }

  // Ensure a Team row exists for every club in the new season. Keep existing
  // ratings (carried from last season); create missing clubs with league-avg
  // placeholders so their players still have a team + matchup context.
  const existingTeams = await prisma.team.findMany();
  const avg = (k: keyof (typeof existingTeams)[number]) =>
    existingTeams.length ? existingTeams.reduce((s, t) => s + Number(t[k] || 0), 0) / existingTeams.length : 0;
  const placeholders = {
    pace: round1(avg("pace")) || 74, offRating: round1(avg("offRating")) || 110, defRating: round1(avg("defRating")) || 110,
    reboundsAllowed: round1(avg("reboundsAllowed")) || 34, assistsAllowed: round1(avg("assistsAllowed")) || 18,
    turnoversForced: round1(avg("turnoversForced")) || 12, pointsAllowed: round1(avg("pointsAllowed")) || 84,
    threePtAllowed: round1(avg("threePtAllowed")) || 9, fantasyFriendliness: 50,
  };
  const teamByCode = new Map(existingTeams.map((t) => [t.shortName, t]));
  const teamIdByCode = new Map<string, string>();
  for (const c of clubs) {
    const coach = coachByClub.get(c.code) || "—";
    const existing = teamByCode.get(c.code);
    if (existing) {
      teamIdByCode.set(c.code, existing.id);
      await prisma.team.update({ where: { id: existing.id }, data: { name: c.name ?? existing.name, coach } });
    } else {
      const meta = TEAM_META[c.code] ?? { city: "—", country: "—", c1: "#ff5a1f", c2: "#0b0f1c" };
      const row = await prisma.team.create({
        data: {
          name: c.name ?? c.code, shortName: c.code, city: meta.city, country: meta.country,
          colorPrimary: meta.c1, colorSecondary: meta.c2, coach, playstyle: "—", ...placeholders,
        },
      });
      teamIdByCode.set(c.code, row.id);
    }
  }

  // Existing players indexed by stable person code (robust) + name (fallback),
  // with whether they have any stat line (returning vs unproven).
  const dbPlayers = await prisma.player.findMany({
    select: { id: true, personCode: true, firstName: true, lastName: true, seasonStats: { take: 1, select: { id: true } } },
  });
  const byCode = new Map(dbPlayers.filter((p) => p.personCode).map((p) => [p.personCode as string, p]));
  const byName = new Map(dbPlayers.map((p) => [`${p.firstName.toLowerCase()}|${p.lastName.toLowerCase()}`, p]));

  const touchedIds = new Set<string>();
  let returning = 0;
  let unproven = 0;

  for (const { club: c, people } of peopleByClub) {
    if (!people || people.length === 0) continue; // incomplete fetch — don't touch this club's players
    const teamId = teamIdByCode.get(c.code) ?? null;
    for (const rec of people) {
      if (rec.typeName !== "Player" || !rec.person?.code) continue;
      const { first, last } = splitStatsName(rec.person.name || "");
      if (!last) continue;
      const person = rec.person;
      const personCode = String(person.code);
      const heightCm = num(person.height) || 0;
      const position = refinePosition(person.positionName ?? null, {}, heightCm);
      const nationality = person.country?.name || "—";
      // Match by stable person code first, then fall back to name.
      const matched = byCode.get(personCode) ?? byName.get(`${first.toLowerCase()}|${last.toLowerCase()}`);

      if (matched) {
        const hasStats = matched.seasonStats.length > 0;
        await prisma.player.update({
          where: { id: matched.id },
          data: {
            personCode, // backfill the code onto legacy rows
            teamId, position, nationality,
            heightCm: heightCm > 0 ? heightCm : undefined,
            status: hasStats ? "signed" : "unproven",
          },
        });
        touchedIds.add(matched.id);
        hasStats ? returning++ : unproven++;
      } else {
        const p = await prisma.player.create({
          data: {
            personCode,
            firstName: first, lastName: last, position, nationality,
            age: num(person.age, 24), heightCm: heightCm > 0 ? heightCm : null,
            teamId, status: "unproven", depthRole: "rotation", fantasyPrice: 5, tags: "unproven",
          },
        });
        touchedIds.add(p.id);
        unproven++;
      }
    }
  }

  // Players who were on a team last season but aren't on any new-season roster
  // → left the league. Mark departed (keep the row for FK safety). Only run
  // this sweep when EVERY club's roster fetched successfully — otherwise a
  // failed club fetch would wrongly mark its whole roster as departed.
  const allFetched = peopleByClub.every((x) => x.people && x.people.length > 0);
  let departedCount = 0;
  if (allFetched) {
    const departedRes = await prisma.player.updateMany({
      where: { id: { notIn: [...touchedIds] }, teamId: { not: null } },
      data: { teamId: null, status: "departed" },
    });
    departedCount = departedRes.count;
  }

  // Recompute projections (skips statless players); then drop any lingering
  // projection for a statless player so unproven never surface in value.
  await recomputeAllProjections();
  const statless = await prisma.player.findMany({
    where: { seasonStats: { none: {} } },
    select: { id: true },
  });
  if (statless.length) {
    await prisma.projection.deleteMany({ where: { playerId: { in: statless.map((s) => s.id) } } });
  }

  return { season: SEASON, teams: clubs.length, returning, unproven, departed: departedCount };
}
