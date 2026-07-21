// ---------------------------------------------------------------------------
// Seed script — populates SQLite with realistic 2025-26 preseason data and
// computes projections + fantasy value via the same engines the app uses.
//   run with: npm run db:seed   (or npm run db:reset to wipe + reseed)
// ---------------------------------------------------------------------------

import { PrismaClient } from "@prisma/client";
import { TEAMS, PLAYERS, SeedStat } from "../src/data/seed-data";
import { fantasyFriendliness } from "../src/lib/matchup";
import { buildTeamContext, RosterMember } from "../src/lib/context";
import { computeForPlayer } from "../src/lib/recompute";
import { SeasonStatLine, Position, DepthRole, PlayerStatus } from "../src/lib/types";

const prisma = new PrismaClient();

const PROJ_SEASON = "2025-26";
const LEAGUE_AVG_TEAM = { pace: 72, offRating: 110, defRating: 110, fantasyFriendliness: 50 };

function toStatLine(s: SeedStat): SeasonStatLine {
  return { ...s };
}

async function main() {
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

  console.log("→ Creating users…");
  const admin = await prisma.user.create({
    data: { email: "admin@euroleaguelobby.dev", name: "Lobby Admin", role: "admin" },
  });
  const demo = await prisma.user.create({
    data: { email: "demo@euroleaguelobby.dev", name: "Demo Manager", role: "user" },
  });

  console.log("→ Creating teams…");
  const teamIdByShort = new Map<string, string>();
  const teamRowByShort = new Map<string, (typeof TEAMS)[number] & { friendliness: number }>();
  for (const t of TEAMS) {
    const friendliness = fantasyFriendliness({
      pointsAllowed: t.pointsAllowed,
      reboundsAllowed: t.reboundsAllowed,
      assistsAllowed: t.assistsAllowed,
      turnoversForced: t.turnoversForced,
      threePtAllowed: t.threePtAllowed,
      defRating: t.defRating,
      pace: t.pace,
    });
    const row = await prisma.team.create({
      data: {
        name: t.name, shortName: t.shortName, city: t.city, country: t.country,
        colorPrimary: t.colorPrimary, colorSecondary: t.colorSecondary, coach: t.coach,
        playstyle: t.playstyle, pace: t.pace, offRating: t.offRating, defRating: t.defRating,
        reboundsAllowed: t.reboundsAllowed, assistsAllowed: t.assistsAllowed,
        turnoversForced: t.turnoversForced, pointsAllowed: t.pointsAllowed,
        threePtAllowed: t.threePtAllowed, fantasyFriendliness: friendliness,
      },
    });
    teamIdByShort.set(t.shortName, row.id);
    teamRowByShort.set(t.shortName, { ...t, friendliness });
  }

  console.log("→ Creating players + season stats…");
  // First create players so we have ids for context building.
  const playerIdByName = new Map<string, string>();
  const createdPlayers: { id: string; seed: (typeof PLAYERS)[number] }[] = [];
  for (const p of PLAYERS) {
    const row = await prisma.player.create({
      data: {
        firstName: p.firstName, lastName: p.lastName, position: p.position,
        nationality: p.nationality, age: p.age,
        teamId: p.teamShort ? teamIdByShort.get(p.teamShort) ?? null : null,
        status: p.status, depthRole: p.depthRole, fantasyPrice: p.fantasyPrice, tags: p.tags,
      },
    });
    playerIdByName.set(`${p.firstName} ${p.lastName}`, row.id);
    createdPlayers.push({ id: row.id, seed: p });

    if (p.last) {
      await prisma.playerSeasonStat.create({ data: { playerId: row.id, ...statData(p.last) } });
    }
    if (p.prior) {
      await prisma.playerSeasonStat.create({ data: { playerId: row.id, ...statData(p.prior) } });
    }
  }

  console.log("→ Building team context + computing projections…");
  // Group players by team (free agents grouped under "FA").
  const byTeam = new Map<string, RosterMember[]>();
  for (const { id, seed } of createdPlayers) {
    const key = seed.teamShort ?? "FA";
    if (!byTeam.has(key)) byTeam.set(key, []);
    byTeam.get(key)!.push({
      id, position: seed.position as Position, depthRole: seed.depthRole as DepthRole,
      fantasyPrice: seed.fantasyPrice,
    });
  }
  const contextById = new Map<string, { positionCompetition: number; availableUsageShare: number }>();
  for (const [, roster] of byTeam) {
    const ctx = buildTeamContext(roster);
    for (const [pid, c] of ctx) contextById.set(pid, c);
  }

  for (const { id, seed } of createdPlayers) {
    const team = seed.teamShort ? teamRowByShort.get(seed.teamShort)! : null;
    const ctx = contextById.get(id) ?? { positionCompetition: 1, availableUsageShare: 0.95 };
    const { projection, value } = computeForPlayer({
      position: seed.position as Position,
      age: seed.age,
      depthRole: seed.depthRole as DepthRole,
      status: seed.status as PlayerStatus,
      fantasyPrice: seed.fantasyPrice,
      changedTeam: !!seed.changedTeam || seed.status === "free_agent",
      positionCompetition: ctx.positionCompetition,
      availableUsageShare: ctx.availableUsageShare,
      injuryRiskHint: seed.injuryRiskHint,
      team: team
        ? { pace: team.pace, offRating: team.offRating, defRating: team.defRating, fantasyFriendliness: team.friendliness }
        : LEAGUE_AVG_TEAM,
      last: seed.last ? toStatLine(seed.last) : undefined,
      prior: seed.prior ? toStatLine(seed.prior) : undefined,
    });

    await prisma.projection.create({
      data: {
        playerId: id, season: PROJ_SEASON,
        projMinutes: projection.projMinutes, projUsage: projection.projUsage,
        projPoints: projection.projPoints, projRebounds: projection.projRebounds,
        projAssists: projection.projAssists, projSteals: projection.projSteals,
        projBlocks: projection.projBlocks, projTurnovers: projection.projTurnovers,
        projPir: projection.projPir, projFantasyPoints: projection.projFantasyPoints,
        valueScore: value.valueScore, pointsPerCredit: value.pointsPerCredit,
        riskAdjustedValue: value.riskAdjustedValue, upsideScore: value.upsideScore,
        consistencyScore: value.consistencyScore, injuryRisk: value.injuryRisk,
        ownershipPrediction: value.ownershipPrediction,
        recommendation: value.recommendation, signal: value.signal,
        rationale: value.rationale, projectedRole: projection.projectedRole,
      },
    });
  }

  console.log("→ Creating roster moves, injuries, alerts…");
  // Roster moves from offseason changes.
  for (const { id, seed } of createdPlayers) {
    if (seed.status === "free_agent") {
      const from = seed.last?.teamSnapshot ? teamIdByShort.get(seed.last.teamSnapshot) ?? null : null;
      await prisma.rosterMove.create({
        data: {
          playerId: id, type: "release", fromTeamId: from, toTeamId: null,
          reliability: "confirmed",
          note: `${seed.firstName} ${seed.lastName} χωρίς ομάδα — ελεύθερος (free agent).`,
        },
      });
    } else if (seed.changedTeam && seed.last?.teamSnapshot && seed.teamShort) {
      const from = teamIdByShort.get(seed.last.teamSnapshot) ?? null;
      const to = teamIdByShort.get(seed.teamShort) ?? null;
      await prisma.rosterMove.create({
        data: {
          playerId: id, type: "transfer", fromTeamId: from, toTeamId: to,
          reliability: "confirmed",
          note: `Μεταγραφή: ${seed.last.teamSnapshot} → ${seed.teamShort}.`,
        },
      });
    }
  }

  // A couple of rumored moves to show "rumored" status handling.
  const guduric = playerIdByName.get("Marko Guduric");
  if (guduric) {
    await prisma.player.update({ where: { id: guduric }, data: { status: "rumored" } });
    await prisma.rosterMove.create({
      data: {
        playerId: guduric, type: "rumor", toTeamId: teamIdByShort.get("MIL") ?? null,
        reliability: "rumor", note: "Φήμη: συζητήσεις με Milano για επιστροφή στην EuroLeague.",
      },
    });
  }

  // Injuries (mark a few players).
  const injuryTargets = [
    { name: "Shane Larkin", severity: "moderate", status: "questionable", desc: "Χρόνιο πρόβλημα στη μέση — load management." },
    { name: "Kemba Walker", severity: "major", status: "doubtful", desc: "Ιστορικό τραυματισμών γόνατος, αβέβαιη συνέχεια." },
  ];
  for (const inj of injuryTargets) {
    const pid = playerIdByName.get(inj.name);
    if (pid) {
      await prisma.injuryEvent.create({
        data: { playerId: pid, severity: inj.severity, status: inj.status, description: inj.desc },
      });
    }
  }

  // Fantasy alerts (lobby feed).
  const alerts: { name?: string; kind: string; severity: string; title: string; body: string }[] = [
    { name: "T.J. Shorts", kind: "transfer", severity: "critical", title: "T.J. Shorts → Panathinaikos", body: "Τεράστια μεταγραφή. Σε up-tempo σύστημα Αταμάν το usage και τα assists του ανεβαίνουν — value spike." },
    { name: "Tornike Shengelia", kind: "transfer", severity: "warning", title: "Shengelia σε Barcelona", body: "Από πρώτη επιλογή στη Virtus σε φορτωμένο roster — πιθανή συμπίεση usage." },
    { name: "Sasha Vezenkov", kind: "buy_low", severity: "info", title: "Vezenkov full season", body: "Ολόκληρη σεζόν στον Ολυμπιακό μετά το NBA — premium production σε λογική τιμή." },
    { name: "Nadir Hifi", kind: "breakout", severity: "info", title: "Hifi breakout watch", body: "23χρονος scorer με τεράστιο usage σε high-pace Paris — κορυφαίο upside pick." },
    { name: "Carlik Jones", kind: "role_change", severity: "info", title: "Carlik Jones engine της Partizan", body: "Triple-double threat με 29% usage — elite fantasy floor & ceiling." },
    { name: "Kemba Walker", kind: "injury", severity: "warning", title: "Kemba Walker injury risk", body: "Χωρίς ομάδα + ιστορικό γόνατος. Avoid μέχρι να ξεκαθαρίσει η κατάσταση." },
  ];
  for (const a of alerts) {
    await prisma.fantasyAlert.create({
      data: {
        playerId: a.name ? playerIdByName.get(a.name) ?? null : null,
        kind: a.kind, severity: a.severity, title: a.title, body: a.body,
      },
    });
  }

  // Demo watchlist for the demo user.
  for (const name of ["Nadir Hifi", "T.J. Shorts", "Sylvain Francisco", "Chima Moneke"]) {
    const pid = playerIdByName.get(name);
    if (pid) {
      await prisma.watchlistItem.create({
        data: { userId: demo.id, playerId: pid, note: "Target για draft." },
      });
    }
  }

  console.log("→ Creating a demo draft room…");
  const room = await prisma.draftRoom.create({
    data: {
      name: "EuroLeague Fantasy Draft 2026 — Demo League", ownerId: admin.id,
      status: "lobby", draftType: "snake", rounds: 10, pickSeconds: 60, season: PROJ_SEASON,
    },
  });
  const teamNames = ["Hooping Spartans", "Aegean Ballers", "Piraeus Kings", "Belgrade Bombers", "Istanbul Heat", "Madrid Maestros"];
  for (let i = 0; i < teamNames.length; i++) {
    await prisma.draftParticipant.create({
      data: {
        roomId: room.id, teamName: teamNames[i], draftOrder: i,
        userId: i === 0 ? demo.id : null, isAutopick: i !== 0,
      },
    });
  }

  const counts = {
    teams: await prisma.team.count(),
    players: await prisma.player.count(),
    projections: await prisma.projection.count(),
    moves: await prisma.rosterMove.count(),
    alerts: await prisma.fantasyAlert.count(),
  };
  console.log("✓ Seed complete:", counts);
}

function statData(s: SeedStat) {
  return {
    season: s.season, teamSnapshot: s.teamSnapshot ?? null, games: s.games,
    minutes: s.minutes, points: s.points, rebounds: s.rebounds, assists: s.assists,
    steals: s.steals, blocks: s.blocks, turnovers: s.turnovers, usage: s.usage,
    pir: s.pir, fantasyPoints: s.fantasyPoints, fpStdev: s.fpStdev,
  };
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
