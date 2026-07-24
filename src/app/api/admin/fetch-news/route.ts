import { NextResponse } from "next/server";
import { scrapeNews } from "@/lib/newsScraper";
import { requireAdmin } from "@/lib/authz";

export const runtime = "nodejs"; // prisma + external fetch
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pull fresh news from the RSS feeds now (Greek + English). Admin-only.
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const result = await scrapeNews();
  return NextResponse.json({ ok: true, ...result });
}
