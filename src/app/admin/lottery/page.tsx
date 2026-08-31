import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { PageHeader } from "@/components/PageHeader";
import { LotteryCreate } from "@/components/LotteryCreate";
import { LotteryRoomList } from "@/components/LotteryRoomList";

export const dynamic = "force-dynamic";

export default async function AdminLotteryPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");

  const rooms = await prisma.draftRoom.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { participants: true } } },
  });

  return (
    <>
      <PageHeader
        title="Draft Lottery"
        status="● ADMIN"
        subtitle="Στήσε την κλήρωση του league, διάλεξε NBA-style / ίσες / χειροκίνητες πιθανότητες, και τρέξε την τελετή αποκάλυψης της σειράς επιλογής."
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <LotteryCreate />

        <section className="space-y-3">
          <h2 className="section-title">Rooms & κληρώσεις</h2>
          <LotteryRoomList
            rooms={rooms.map((r) => ({
              id: r.id,
              name: r.name,
              status: r.status,
              rounds: r.rounds,
              participants: r._count.participants,
            }))}
          />
        </section>
      </div>
    </>
  );
}
