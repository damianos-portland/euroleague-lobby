import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createChallenge, listMatches, listOpponents } from "@/lib/friendlyServer";

export const dynamic = "force-dynamic";

// GET /api/friendly → { matches, opponents } for the lobby.
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [matches, opponents] = await Promise.all([listMatches(userId), listOpponents(userId)]);
  return NextResponse.json({ matches, opponents });
}

// POST /api/friendly { opponentId, mode } → create a challenge + push.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const opponentId: string | undefined = body?.opponentId;
  const mode: string = body?.mode === "fantasy" ? "fantasy" : "score";
  if (!opponentId) return NextResponse.json({ error: "Λείπει ο αντίπαλος." }, { status: 400 });

  try {
    const match = await createChallenge(userId, opponentId, mode);
    return NextResponse.json({ ok: true, id: match.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Σφάλμα." }, { status: 400 });
  }
}
