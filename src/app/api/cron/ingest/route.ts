import { NextRequest, NextResponse } from "next/server";
import { ingestLiveSeason, ingestRosters, applyFantasyCredits, snapshotProjections } from "@/lib/ingest";
import { scrapeNews } from "@/lib/newsScraper";

// Prisma needs the Node.js runtime; never statically evaluate this route.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily refresh: stats -> next-season rosters -> news -> snapshot.
// One failing step must not kill the rest.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    // Vercel Cron sends Authorization: Bearer ${CRON_SECRET} when CRON_SECRET is set.
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const startedAt = Date.now();
  const steps: Record<string, unknown> = {};
  const run = async (name: string, fn: () => Promise<unknown>) => {
    console.log(`[cron/ingest] step ${name} started`);
    const t0 = Date.now();
    try {
      const result = await fn();
      steps[name] = { ...(result as object), ms: Date.now() - t0 };
    } catch (e: any) {
      steps[name] = { error: e?.message ?? String(e), ms: Date.now() - t0 };
    }
  };

  await run("stats", () => ingestLiveSeason());
  await run("rosters", () => ingestRosters());
  await run("credits", () => applyFantasyCredits()); // real fantasy prices + recompute
  await run("news", () => scrapeNews());
  await run("snapshot", () => snapshotProjections());

  const failed = Object.values(steps).some((s: any) => s && typeof s === "object" && "error" in s);
  return NextResponse.json({ ok: !failed, steps, ms: Date.now() - startedAt }, { status: failed ? 500 : 200 });
}
