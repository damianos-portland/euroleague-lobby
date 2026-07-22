import Link from "next/link";
import { getRosterRace } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { ProgressBar } from "@/components/desk";
import clsx from "clsx";

export const dynamic = "force-dynamic";

const ROSTER_REF = 16; // reference full-roster size

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  returning: { label: "RETURNING", cls: "bg-slate-500/15 text-slate-300" },
  transfer: { label: "TRANSFER", cls: "bg-emerald-500/15 text-emerald-300" },
  new: { label: "NEW", cls: "bg-amber-500/15 text-amber-300" },
};

export default async function RosterRacePage() {
  const teams = await getRosterRace();
  const total = teams.reduce((s, t) => s + t.entries.length, 0);
  const leader = teams[0];
  const laggard = teams[teams.length - 1];

  return (
    <>
      <PageHeader
        title="Roster Race 2026-27"
        status={`● ${total}/${20 * ROSTER_REF} SIGNED`}
        subtitle={`Ποιος χτίζει γρηγορότερα ρόστερ για τη νέα σεζόν — πραγματικά δεδομένα από το επίσημο feed.${
          leader ? ` Προηγείται: ${leader.teamName} (${leader.entries.length}).` : ""
        }${laggard ? ` Τελευταία: ${laggard.teamName} (${laggard.entries.length}).` : ""}`}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {teams.map((t) => (
          <section key={t.teamCode} className="card card-pad tint-sky">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">{t.teamName}</h2>
              <span className="stat text-xs text-sky-300">{t.entries.length}/{ROSTER_REF}</span>
            </div>
            <ProgressBar value={t.entries.length} max={ROSTER_REF} tone={t.entries.length >= 10 ? "green" : t.entries.length >= 5 ? "sky" : "red"} />
            <ul className="mt-3 space-y-1.5">
              {t.entries.map((e) => {
                const s = STATUS_STYLE[e.status] ?? STATUS_STYLE.new;
                return (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                    {e.playerId ? (
                      <Link href={`/players/${e.playerId}`} className="truncate font-semibold text-white hover:text-brand-400">
                        {e.name}
                      </Link>
                    ) : (
                      <span className="truncate text-slate-200">{e.name}</span>
                    )}
                    <span className="flex shrink-0 items-center gap-2">
                      {e.lastFp !== null && <span className="stat text-[11px] text-slate-400">{e.lastFp.toFixed(1)} FP</span>}
                      <span className={clsx("chip font-mono !text-[9px]", s.cls)}>{s.label}</span>
                    </span>
                  </li>
                );
              })}
              {t.entries.length === 0 && <li className="text-sm text-slate-500">Καμία υπογραφή ακόμα.</li>}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
