import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { AlertTriangle, CircleSlash, HelpCircle, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS = {
  out: { label: "OUT", cls: "text-rose-300 bg-rose-500/15 ring-rose-500/30", Icon: CircleSlash },
  doubtful: { label: "ΑΜΦΙΒΟΛΟΣ", cls: "text-amber-300 bg-amber-400/10 ring-amber-400/25", Icon: AlertTriangle },
  questionable: { label: "ΕΡΩΤΗΜΑΤΙΚΟ", cls: "text-yellow-300 bg-yellow-400/10 ring-yellow-400/25", Icon: HelpCircle },
} as const;
const rank = (s: string) => (s === "out" ? 0 : s === "doubtful" ? 1 : 2);
const FIXTURE_SEASON = process.env.EL_SCHEDULE_SEASON || "E2026";

export default async function InjuriesPage() {
  const latest = await prisma.injuryNote.aggregate({ _max: { round: true } });
  const round = latest._max.round ?? 0;

  // round is 0 only when no notes exist yet; the round:0 queries then return [].
  const [teams, notes, fixtures] = await Promise.all([
    prisma.team.findMany({ select: { shortName: true, name: true } }),
    prisma.injuryNote.findMany({ where: { round } }),
    prisma.fixture.findMany({ where: { season: FIXTURE_SEASON, round }, select: { homeCode: true, awayCode: true } }),
  ]);

  // fixture per team code -> { opp, home }
  const fixtureOf = new Map<string, { opp: string; home: boolean }>();
  for (const f of fixtures) {
    fixtureOf.set(f.homeCode, { opp: f.awayCode, home: true });
    fixtureOf.set(f.awayCode, { opp: f.homeCode, home: false });
  }
  const notesByTeam = new Map<string, typeof notes>();
  for (const n of notes) {
    if (!notesByTeam.has(n.teamCode)) notesByTeam.set(n.teamCode, []);
    notesByTeam.get(n.teamCode)!.push(n);
  }

  const cards = teams
    .map((t) => {
      const list = notesByTeam.get(t.shortName) ?? [];
      const outN = list.filter((n) => n.status === "out").length;
      return { name: t.name, code: t.shortName, fixture: fixtureOf.get(t.shortName), list, outN };
    })
    // teams with absences first (most OUT first), healthy teams after, alpha within
    .sort((a, b) => b.list.length - a.list.length || b.outN - a.outN || a.name.localeCompare(b.name));

  const outCount = notes.filter((n) => n.status === "out").length;
  const doubtCount = notes.filter((n) => n.status !== "out").length;
  const cleanCount = cards.filter((c) => c.list.length === 0).length;
  const lastUpdated = notes.length ? new Date(Math.max(...notes.map((n) => +n.updatedAt))) : null;

  return (
    <>
      <PageHeader
        title="Απουσίες / Injuries"
        subtitle="Ποιοι λείπουν ανά ομάδα και ανά αγωνιστική — και οι 20 ομάδες. Οι πληροφορίες ενημερώνονται χειροκίνητα από την ομάδα μας (πηγές + μετάφραση), όχι live."
        status={round ? `● ROUND ${round} · ${outCount} OUT · ${doubtCount} ΑΜΦΙΒΟΛΟΙ · ${cleanCount} ΠΛΗΡΕΙΣ` : undefined}
      />

      {round === 0 ? (
        <div className="card card-pad text-center text-sm text-slate-400">
          Δεν υπάρχουν καταχωρημένες απουσίες. Τρέξε <code className="text-brand-300">npm run db:seed-injuries -- 1530 2</code>.
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {(["out", "doubtful", "questionable"] as const).map((s) => {
              const Icon = STATUS[s].Icon;
              return (
                <span key={s} className={`chip ring-1 ${STATUS[s].cls}`}>
                  <Icon size={12} /> {STATUS[s].label}
                </span>
              );
            })}
            <span className="chip ring-1 text-emerald-300 bg-emerald-400/10 ring-emerald-400/20">
              <CheckCircle2 size={12} /> ΠΛΗΡΕΣ ΡΟΣΤΕΡ
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((c) => {
              const clean = c.list.length === 0;
              const sorted = [...c.list].sort((a, b) => rank(a.status) - rank(b.status) || a.playerName.localeCompare(b.playerName));
              return (
                <div key={c.code} className={`card card-pad ${clean ? "opacity-70" : ""}`}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-white">{c.name}</h3>
                    <span className="font-mono text-[10px] text-slate-400">
                      {c.fixture ? `R${round} ${c.fixture.home ? "vs" : "@"} ${c.fixture.opp}` : `R${round}`}
                    </span>
                  </div>
                  {clean ? (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-500/[0.06] px-3 py-2.5 text-xs text-emerald-300">
                      <CheckCircle2 size={14} /> Καμία αναφερόμενη απουσία (βάσει πηγών).
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {sorted.map((n) => {
                        const st = STATUS[n.status as keyof typeof STATUS] ?? STATUS.questionable;
                        return (
                          <div key={n.id} className="flex items-start gap-2.5 rounded-lg bg-white/[0.03] px-3 py-2">
                            <span className={`chip mt-0.5 shrink-0 ring-1 ${st.cls}`}>{st.label}</span>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-100">
                                {n.playerName}
                                {n.position && <span className="ml-1.5 text-[10px] text-slate-500">{n.position}</span>}
                              </div>
                              {n.note && <div className="text-[11px] leading-snug text-slate-400">{n.note}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {lastUpdated && (
            <div className="mt-6 text-center font-mono text-[10px] text-slate-500">
              Τελευταία ενημέρωση: {lastUpdated.toISOString().slice(0, 16).replace("T", " ")} UTC · πηγή: {notes[0]?.source}
            </div>
          )}
        </>
      )}
    </>
  );
}
