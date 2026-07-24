import { NextResponse } from "next/server";
import { translatePendingNews } from "@/lib/newsScraper";
import { hasClaudeKey } from "@/lib/translate";

// Prisma + external translation API need the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Re-translate ALL news titles to Greek (upgrades existing rows). Uses Claude
// when ANTHROPIC_API_KEY is set, otherwise the MyMemory free fallback.
export async function POST() {
  const count = await translatePendingNews(500, { retranslate: true });
  return NextResponse.json({ ok: true, translated: count, engine: hasClaudeKey() ? "claude" : "mymemory" });
}
