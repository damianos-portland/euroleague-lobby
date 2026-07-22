// ---------------------------------------------------------------------------
// Manual live refresh — loads REAL EuroLeague stats into the DB and recomputes
// projections. Safe to re-run: it upserts (never wipes users/drafts/watchlists).
//
//   run with:  npm run db:ingest
//
// The heavy lifting lives in src/lib/ingest.ts (shared with the daily cron at
// src/app/api/cron/ingest). This wrapper only ensures the demo user + draft
// room exist so a brand-new database is immediately usable.
// ---------------------------------------------------------------------------

import { prisma } from "../src/lib/db";
import { ingestLiveSeason, ingestRosters, snapshotProjections } from "../src/lib/ingest";
import { scrapeNews } from "../src/lib/newsScraper";

async function ensureScaffold() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@euroleaguelobby.dev" },
    update: {},
    create: { email: "admin@euroleaguelobby.dev", name: "Lobby Admin", role: "admin" },
  });
  const demo = await prisma.user.upsert({
    where: { email: "demo@euroleaguelobby.dev" },
    update: {},
    create: { email: "demo@euroleaguelobby.dev", name: "Demo Manager", role: "user" },
  });

  if ((await prisma.draftRoom.count()) === 0) {
    const room = await prisma.draftRoom.create({
      data: {
        name: "EuroLeague Fantasy Draft 2026 — Demo League",
        ownerId: admin.id,
        status: "lobby",
        draftType: "snake",
        rounds: 10,
        pickSeconds: 60,
        season: "2025-26",
      },
    });
    const teamNames = ["Hooping Spartans", "Aegean Ballers", "Piraeus Kings", "Belgrade Bombers", "Istanbul Heat", "Madrid Maestros"];
    for (let i = 0; i < teamNames.length; i++) {
      await prisma.draftParticipant.create({
        data: { roomId: room.id, teamName: teamNames[i], draftOrder: i, userId: i === 0 ? demo.id : null, isAutopick: i !== 0 },
      });
    }
  }
}

async function main() {
  console.log("→ Ensuring demo scaffold (users, draft room)…");
  await ensureScaffold();
  console.log("→ Live stats refresh…");
  console.log("  ", await ingestLiveSeason());
  console.log("→ 2026-27 rosters…");
  console.log("  ", await ingestRosters());
  console.log("→ News scrape…");
  console.log("  ", await scrapeNews());
  console.log("→ Projection snapshot…");
  console.log("  ", await snapshotProjections());
  console.log("✓ Full refresh complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
