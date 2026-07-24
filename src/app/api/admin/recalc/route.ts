import { NextResponse } from "next/server";
import { recomputeAllProjections } from "@/lib/recomputeAll";
import { requireAdmin } from "@/lib/authz";

// Recompute all projections + value from current DB state. Admin-only.
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const count = await recomputeAllProjections();
  return NextResponse.json({ ok: true, recomputed: count });
}
