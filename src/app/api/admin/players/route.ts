import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Create a player.
export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.firstName || !b.lastName || !b.position) {
    return NextResponse.json({ error: "firstName, lastName, position required" }, { status: 400 });
  }
  const player = await prisma.player.create({
    data: {
      firstName: b.firstName, lastName: b.lastName, position: b.position,
      nationality: b.nationality ?? "—", age: b.age ?? 25,
      teamId: b.teamId || null, status: b.status ?? "signed",
      depthRole: b.depthRole ?? "rotation", fantasyPrice: b.fantasyPrice ?? 5,
      tags: b.tags ?? "",
    },
  });
  return NextResponse.json({ player });
}
