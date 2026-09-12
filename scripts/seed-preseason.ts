// Seed / refresh PreseasonNote rows from the committed research JSON.
//   npm run db:seed-preseason
// The notes are produced by web research (offseason friendlies) and edited by
// hand in data/preseason-notes-2026-27.json — this script just applies them.

import { prisma } from "../src/lib/db";
import notes from "../data/preseason-notes-2026-27.json";

const norm = (s: string) => s.toLowerCase().replace(/[.\-']/g, "").trim();

async function main() {
  const players = await prisma.player.findMany({ select: { id: true, firstName: true, lastName: true } });
  let matched = 0;
  const missed: string[] = [];
  for (const n of notes as { first: string; last: string; flag: string; note: string; confidence: string }[]) {
    const cand = players.filter((pl) => norm(pl.lastName).includes(norm(n.last)) || norm(n.last).includes(norm(pl.lastName)));
    let player = cand.find((pl) => norm(pl.firstName).slice(0, 3) === norm(n.first).slice(0, 3));
    if (!player && cand.length === 1) player = cand[0];
    if (!player) {
      missed.push(`${n.first} ${n.last}`);
      continue;
    }
    await prisma.preseasonNote.upsert({
      where: { playerId: player.id },
      create: { playerId: player.id, flag: n.flag, note: n.note, confidence: n.confidence },
      update: { flag: n.flag, note: n.note, confidence: n.confidence },
    });
    matched++;
  }
  console.log(`preseason notes upserted: ${matched}/${(notes as any[]).length}`);
  if (missed.length) console.log("MISSED:", missed.join(", "));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
