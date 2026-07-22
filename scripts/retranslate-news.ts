// One-off: re-translate ALL NewsItem titles to Greek via Claude (upgrades any
// rows previously translated by the MyMemory fallback). Requires ANTHROPIC_API_KEY.
//   run with:  npm run db:retranslate
import { prisma } from "../src/lib/db";
import { translatePendingNews } from "../src/lib/newsScraper";
import { hasClaudeKey } from "../src/lib/translate";

async function main() {
  if (!hasClaudeKey()) {
    console.error("✗ ANTHROPIC_API_KEY is not set — nothing to upgrade (would use MyMemory).");
    process.exit(1);
  }
  console.log("→ Re-translating all news titles via Claude…");
  const n = await translatePendingNews(500, { retranslate: true });
  console.log(`✓ Re-translated ${n} headlines.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
