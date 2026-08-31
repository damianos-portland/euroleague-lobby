import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { DraftLottery } from "@/components/DraftLottery";

export const dynamic = "force-dynamic";

export default async function LotteryPage({ params }: { params: { id: string } }) {
  const session = await auth();
  const room = await prisma.draftRoom.findUnique({
    where: { id: params.id },
    include: { participants: { orderBy: { teamName: "asc" } } },
  });
  if (!room) notFound();

  const initial = {
    id: room.id,
    name: room.name,
    status: room.status,
    lotteryRevealed: room.lotteryRevealed,
    drawn: room.participants.every((p) => p.draftOrder >= 0),
    participants: room.participants.map((p) => ({
      id: p.id,
      teamName: p.teamName,
      weight: p.weight,
      draftOrder: p.draftOrder,
    })),
  };

  return <DraftLottery initial={initial} isAdmin={session?.user?.role === "admin"} />;
}
