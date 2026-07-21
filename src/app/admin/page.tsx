import { prisma } from "@/lib/db";
import { getAllPlayers } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [players, teams, rooms] = await Promise.all([
    getAllPlayers(),
    prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, shortName: true, name: true } }),
    prisma.draftRoom.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, status: true } }),
  ]);
  return (
    <>
      <PageHeader
        title="Admin Panel"
        subtitle="Διαχείριση παικτών, rosters, τιμών, projected roles, import CSV/JSON, χειροκίνητη επεξεργασία projections, recalculation & draft rooms."
      />
      <AdminPanel
        initialPlayers={players}
        teams={teams}
        rooms={rooms}
      />
    </>
  );
}
