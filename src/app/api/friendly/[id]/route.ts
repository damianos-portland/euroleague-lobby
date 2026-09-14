import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadMatchView } from "@/lib/friendlyServer";

export const dynamic = "force-dynamic";

// GET /api/friendly/[id] → the match state from the caller's perspective.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const view = await loadMatchView(params.id, userId);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(view);
}
