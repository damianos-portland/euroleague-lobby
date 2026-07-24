import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getAllPlayers } from "@/lib/queries";
import { auth } from "@/auth";
import { PageHeader } from "@/components/PageHeader";
import { AdminPanel } from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");

  const [players, teams, rooms, users] = await Promise.all([
    getAllPlayers(),
    prisma.team.findMany({ orderBy: { name: "asc" }, select: { id: true, shortName: true, name: true } }),
    prisma.draftRoom.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, status: true } }),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, role: true },
    }),
  ]);
  return (
    <>
      <PageHeader
        title="Admin Panel"
        subtitle="Διαχείριση παικτών, rosters, τιμών, projected roles, import CSV/JSON, projections, recalculation, μετάφραση news, χρηστών & ρόλων."
      />
      <AdminPanel
        initialPlayers={players}
        teams={teams}
        rooms={rooms}
        users={users}
        currentUserId={session.user.id}
      />
    </>
  );
}
