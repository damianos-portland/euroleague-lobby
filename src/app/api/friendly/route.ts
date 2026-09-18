import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createChallenge, listMatches, listChallengeableRooms } from "@/lib/friendlyServer";

export const dynamic = "force-dynamic";

// GET /api/friendly → { matches, rooms } for the lobby.
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [matches, rooms] = await Promise.all([listMatches(userId), listChallengeableRooms(userId)]);
  return NextResponse.json({ matches, rooms });
}

// POST /api/friendly { roomId, opponentParticipantId, mode } → challenge + push.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const roomId: string | undefined = body?.roomId;
  const opponentParticipantId: string | undefined = body?.opponentParticipantId;
  const mode: string = body?.mode === "fantasy" ? "fantasy" : "score";
  if (!roomId || !opponentParticipantId) {
    return NextResponse.json({ error: "Λείπει το room ή ο αντίπαλος." }, { status: 400 });
  }

  try {
    const match = await createChallenge(userId, { roomId, opponentParticipantId, mode });
    return NextResponse.json({ ok: true, id: match.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Σφάλμα." }, { status: 400 });
  }
}
