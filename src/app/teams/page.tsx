import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { Meter, TeamDot } from "@/components/ui";
import { fantasyFriendliness, gradeFromFriendliness } from "@/lib/matchup";

export const dynamic = "force-dynamic";

const GRADE_TONE: Record<string, string> = {
  smash: "text-emerald-400",
  good: "text-emerald-300",
  neutral: "text-slate-300",
  tough: "text-amber-300",
  fade: "text-rose-400",
};

export default async function TeamsPage() {
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { players: true } } },
  });

  return (
    <>
      <PageHeader
        title="Teams"
        subtitle="Πώς παίζει κάθε ομάδα και — κυρίως — τι επιτρέπει στους αντιπάλους. Το fantasy-matchup rating δείχνει πόσο «φιλικές» είναι απέναντι (smash = ρίχνεις μέσα τους παίκτες σου)."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t) => {
          const f = fantasyFriendliness(t);
          const grade = gradeFromFriendliness(f);
          return (
            <Link key={t.id} href={`/teams/${t.id}`} className="card card-pad transition hover:ring-1 hover:ring-brand-500/30">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-11 w-11 place-items-center rounded-xl text-sm font-black text-white ring-1 ring-white/10"
                    style={{ background: `linear-gradient(135deg, ${t.colorPrimary}, ${t.colorSecondary})` }}
                  >
                    {t.shortName}
                  </div>
                  <div>
                    <div className="font-bold text-white">{t.name}</div>
                    <div className="text-[11px] text-slate-500">{t.city}, {t.country} · {t.coach}</div>
                  </div>
                </div>
                <span className={`text-xs font-bold uppercase ${GRADE_TONE[grade]}`}>{grade}</span>
              </div>

              <p className="mt-3 line-clamp-2 text-xs text-slate-400">{t.playstyle}</p>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Mini label="PACE" value={t.pace.toFixed(1)} />
                <Mini label="OFF" value={t.offRating.toFixed(0)} />
                <Mini label="DEF" value={t.defRating.toFixed(0)} />
              </div>

              <div className="mt-3">
                <Meter value={f} label="Fantasy-friendliness (αντίπαλος)" tone={f >= 53 ? "good" : f >= 47 ? "blue" : "bad"} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5"><TeamDot color={t.colorPrimary} /> {t._count.players} παίκτες</span>
                <span>PTS allowed {t.pointsAllowed.toFixed(1)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="stat text-sm font-bold text-slate-100">{value}</div>
    </div>
  );
}
