import { NextRequest, NextResponse } from "next/server";
import { ingestLiveSeason, ingestRosters, snapshotProjections } from "@/lib/ingest";
import { scrapeNews } from "@/lib/newsScraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily refresh: stats -> next-season rosters -> news -> snapshot.
// One failing step must not kill the rest.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const startedAt = Date.now();
  const steps: Record<string, unknown> = {};
  const run = async (name: string, fn: () => Promise<unknown>) => {
    try {
      steps[name] = await fn();
    } catch (e: any) {
      steps[name] = { error: e?.message ?? String(e) };
    }
  };

  await run("stats", () => ingestLiveSeason());
  await run("rosters", () => ingestRosters());
  await run("news", () => scrapeNews());
  await run("snapshot", () => snapshotProjections());

  const failed = Object.values(steps).some((s: any) => s && typeof s === "object" && "error" in s);
  return NextResponse.json({ ok: !failed, steps, ms: Date.now() - startedAt }, { status: failed ? 500 : 200 });
}
