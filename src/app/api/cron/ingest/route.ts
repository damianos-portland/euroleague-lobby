import { NextRequest, NextResponse } from "next/server";
import { ingestLiveSeason } from "@/lib/ingest";

// Prisma needs the Node.js runtime; never statically evaluate this route.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow up to 60s (Vercel Hobby max) for the full refresh + recompute.
export const maxDuration = 60;

// Daily EuroLeague data refresh. Triggered by Vercel Cron (see vercel.json),
// which sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set.
// Also callable manually with the same header for an on-demand refresh.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const startedAt = Date.now();
  try {
    const result = await ingestLiveSeason();
    return NextResponse.json({ ok: true, ...result, ms: Date.now() - startedAt });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
