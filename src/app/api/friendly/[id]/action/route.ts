import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { actOnMatch, FriendlyAction } from "@/lib/friendlyServer";

export const dynamic = "force-dynamic";

const ACTIONS: FriendlyAction[] = ["accept", "decline", "cancel", "setLineup", "ready"];

// POST /api/friendly/[id]/action { action, lineup? } → mutate the match.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action as FriendlyAction;
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: "Άγνωστη ενέργεια." }, { status: 400 });

  try {
    const view = await actOnMatch(params.id, userId, action, { lineup: body?.lineup });
    return NextResponse.json(view);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Σφάλμα." }, { status: 400 });
  }
}
