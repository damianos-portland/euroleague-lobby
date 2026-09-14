import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadFriendlyPool } from "@/lib/friendlyServer";

export const dynamic = "force-dynamic";

// GET /api/friendly/pool → the full lineup-selectable player pool (cached
// client-side; fetched once when a user opens the lineup builder).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pool = await loadFriendlyPool();
  return NextResponse.json({ pool });
}
