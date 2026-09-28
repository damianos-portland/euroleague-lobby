import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { AlertTriangle, CircleSlash, HelpCircle } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS = {
  out: { label: "OUT", cls: "text-rose-300 bg-rose-500/15 ring-rose-500/30", Icon: CircleSlash },
  doubtful: { label: "ΑΜΦΙΒΟΛΟΣ", cls: "text-amber-300 bg-amber-400/10 ring-amber-400/25", Icon: AlertTriangle },
  questionable: { label: "ΕΡΩΤΗΜΑΤΙΚΟ", cls: "text-yellow-300 bg-yellow-400/10 ring-yellow-400/25", Icon: HelpCircle },
} as const;

const rank = (s: string) => (s === "out" ? 0 : s === "doubtful" ? 1 : 2);

export default async function InjuriesPage() {
  const latest = await prisma.injuryNote.aggregate({ _max: { round: true } });
  const round = latest._max.round ?? 0;
  const notes = round
    ? await prisma.injuryNote.findMany({ where: { round }, orderBy: [{ teamName: "asc" }] })
    : [];

  // group by team
  const byTeam = new Map<string, typeof notes>();
  for (const n of notes) {
    if (!byTeam.has(n.teamName)) byTeam.set(n.teamName, []);
    byTeam.get(n.teamName)!.push(n);
  }
  const teams = [...byTeam.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const outCount = notes.filter((n) => n.status === "out").length;
  const doubtCount = notes.filter((n) => n.status !== "out").length;
  const lastUpdated = notes.length ? new Date(Math.max(...notes.map((n) => +n.updatedAt))) : null;

  return (
    <>
      <PageHeader
        title="Απουσίες / Injuries"
        subtitle="Ποιοι λείπουν ανά ομάδα και ανά αγωνιστική. Οι πληροφορίες ενημερώνονται χειροκίνητα από την ομάδα μας (πηγές + μετάφραση), όχι live."
        status={round ? `● ROUND ${round} · ${outCount} OUT · ${doubtCount} ΑΜΦΙΒΟΛΟΙ` : undefined}
      />

      {teams.length === 0 ? (
        <div className="card card-pad text-center text-sm text-slate-400">
          Δεν υπάρχουν καταχωρημένες απουσίες. Τρέξε <code className="text-brand-300">npm run db:seed-injuries</code>.
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {(["out", "doubtful", "questionable"] as const).map((s) => (
              <span key={s} className={`chip ring-1 ${STATUS[s].cls}`}>
                <STATUSIcon s={s} /> {STATUS[s].label}
              </span>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {teams.map(([teamName, list]) => {
              const sorted = [...list].sort((a, b) => rank(a.status) - rank(b.status) || a.playerName.localeCompare(b.playerName));
              const opp = list[0];
              return (
                <div key={teamName} className="card card-pad">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-white">{teamName}</h3>
                    {opp?.opponent && (
                      <span className="font-mono text-[10px] text-slate-400">
                        R{round} {opp.home ? "vs" : "@"} {opp.opponent}
                      </span>
                    )}
                  </div>
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
                </div>
              );
            })}
          </div>

          {lastUpdated && (
            <div className="mt-6 text-center font-mono text-[10px] text-slate-500">
              Τελευταία ενημέρωση: {lastUpdated.toISOString().slice(0, 16).replace("T", " ")} UTC · πηγή:{" "}
              {notes[0]?.source}
            </div>
          )}
        </>
      )}
    </>
  );
}

function STATUSIcon({ s }: { s: keyof typeof STATUS }) {
  const Icon = STATUS[s].Icon;
  return <Icon size={12} />;
}
