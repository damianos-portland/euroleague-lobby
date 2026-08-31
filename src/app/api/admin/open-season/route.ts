import { NextResponse } from "next/server";
import { ingestPreseasonRoster } from "@/lib/ingest";
import { requireAdmin } from "@/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Rebuild the Player base from the new season's rosters (preseason transition).
// Admin-only. Returning players keep last-season stats; newcomers become
// "unproven"; players no longer rostered are marked "departed".
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const result = await ingestPreseasonRoster();
  return NextResponse.json({ ok: true, ...result });
}
