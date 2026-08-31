import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { PageHeader } from "@/components/PageHeader";
import { LotteryCreate } from "@/components/LotteryCreate";
import { Dice5 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminLotteryPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") redirect("/");

  const rooms = await prisma.draftRoom.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { participants: true } } },
  });

  const statusTone: Record<string, string> = {
    lottery: "bg-brand-500/15 text-brand-300",
    lobby: "bg-sky-500/15 text-sky-300",
    drafting: "bg-emerald-500/15 text-emerald-300",
    paused: "bg-amber-500/15 text-amber-300",
    complete: "bg-slate-500/15 text-slate-300",
  };

  return (
    <>
      <PageHeader
        title="Draft Lottery"
        status="● ADMIN"
        subtitle="Στήσε την κλήρωση του league (12 ομάδες), βάλε προαιρετικά βάρη, και τρέξε την τελετή αποκάλυψης της σειράς επιλογής."
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <LotteryCreate />

        <section className="space-y-3">
          <h2 className="section-title">Rooms & κληρώσεις</h2>
          {rooms.length === 0 && <p className="text-sm text-slate-500">Καμία ακόμη.</p>}
          {rooms.map((r) => (
            <Link
              key={r.id}
              href={r.status === "lottery" ? `/draft/lottery/${r.id}` : `/draft/${r.id}`}
              className="card card-pad flex items-center justify-between transition hover:ring-1 hover:ring-brand-500/30"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{r.name}</span>
                  <span className={`chip ${statusTone[r.status] ?? "bg-white/5 text-slate-300"}`}>{r.status}</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">{r._count.participants} ομάδες · {r.rounds} γύροι</div>
              </div>
              <span className="btn-ghost">
                {r.status === "lottery" ? <><Dice5 size={14} /> Κλήρωση</> : "Άνοιγμα →"}
              </span>
            </Link>
          ))}
        </section>
      </div>
    </>
  );
}
