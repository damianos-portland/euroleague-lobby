import { NextResponse } from "next/server";
import { recomputeAllProjections } from "@/lib/recomputeAll";

// Recompute all projections + value from current DB state.
export async function POST() {
  const count = await recomputeAllProjections();
  return NextResponse.json({ ok: true, recomputed: count });
}
