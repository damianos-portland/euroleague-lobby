import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPlayer, toPlayerDTO, getDemoUser } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import {
  PosBadge, RecBadge, SignalBadge, StatusBadge, RiskBadge, Meter, Stat, valueTone,
} from "@/components/ui";
import { ProductionRadar, ValueBars } from "@/components/PlayerCharts";
import { WatchlistButton } from "@/components/WatchlistButton";
import { riskLevel } from "@/lib/value";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: { id: string } }) {
  const player = await getPlayer(params.id);
  if (!player) notFound();

  const [seasonRows, injuries, moves, demo, teammatesRaw] = await Promise.all([
    prisma.playerSeasonStat.findMany({ where: { playerId: player.id }, orderBy: { season: "desc" } }),
    prisma.injuryEvent.findMany({ where: { playerId: player.id }, orderBy: { occurredAt: "desc" } }),
    prisma.rosterMove.findMany({ where: { playerId: player.id }, orderBy: { occurredAt: "desc" }, include: { fromTeam: true, toTeam: true } }),
    getDemoUser(),
    player.teamId
      ? prisma.player.findMany({ where: { teamId: player.teamId, NOT: { id: player.id } }, include: { team: true, projection: true, seasonStats: { orderBy: { season: "desc" } } } })
      : Promise.resolve([]),
  ]);
  const teammates = teammatesRaw.map(toPlayerDTO);
  const positionRivals = teammates
    .filter((t) => t.position === player.position)
    .sort((a, b) => (b.proj?.projFantasyPoints ?? 0) - (a.proj?.projFantasyPoints ?? 0));
  const usageDrivers = teammates
    .sort((a, b) => (b.last?.usage ?? 0) - (a.last?.usage ?? 0))
    .slice(0, 4);

  const watched = demo
    ? !!(await prisma.watchlistItem.findUnique({ where: { userId_playerId: { userId: demo.id, playerId: player.id } } }))
    : false;

  const proj = player.proj;
  const risk = proj ? riskLevel(proj.injuryRisk, proj.consistencyScore) : "medium";

  return (
    <>
      <Link href="/players" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        <ArrowLeft size={15} /> Players
      </Link>

      {/* Header */}
      <div className="card card-pad mb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold text-white">{player.name}</h1>
              <PosBadge pos={player.position} />
              <StatusBadge status={player.status} />
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {player.nationality} · {player.age} ετών · {player.teamName ?? "Χωρίς ομάδα"}
              {player.teamId && <> · <Link href={`/teams/${player.teamId}`} className="text-brand-400 hover:underline">δες ομάδα</Link></>}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {player.tags.map((t) => (
                <span key={t} className="chip bg-white/5 text-slate-300">{t}</span>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <RecBadge rec={proj?.recommendation} />
              <SignalBadge signal={proj?.signal} />
              <RiskBadge level={risk} />
            </div>
            {demo && <WatchlistButton userId={demo.id} playerId={player.id} initial={watched} />}
          </div>
        </div>
        {proj?.rationale && (
          <div className="mt-4 rounded-xl border border-brand-500/20 bg-brand-500/[0.06] px-4 py-3 text-sm text-slate-200">
            <span className="font-semibold text-brand-300">Engine verdict: </span>{proj.rationale}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Projection vs last season */}
          <section className="card card-pad">
            <h2 className="mb-3 text-sm font-bold text-white">Projection 2025-26 vs 2024-25</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ProductionRadar last={player.last ?? null} proj={proj ?? null} />
              <div className="grid grid-cols-3 gap-2">
                <ProjStat label="MIN" proj={proj?.projMinutes} last={player.last?.minutes} />
                <ProjStat label="PTS" proj={proj?.projPoints} last={player.last?.points} />
                <ProjStat label="REB" proj={proj?.projRebounds} last={player.last?.rebounds} />
                <ProjStat label="AST" proj={proj?.projAssists} last={player.last?.assists} />
                <ProjStat label="STL" proj={proj?.projSteals} last={player.last?.steals} />
                <ProjStat label="BLK" proj={proj?.projBlocks} last={player.last?.blocks} />
                <ProjStat label="USG%" proj={proj?.projUsage} last={player.last?.usage} />
                <ProjStat label="PIR" proj={proj?.projPir} last={player.last?.pir} />
                <ProjStat label="FP" proj={proj?.projFantasyPoints} last={player.last?.fantasyPoints} highlight />
              </div>
            </div>
            {proj?.projectedRole && (
              <p className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
                <span className="font-semibold text-slate-200">Προβλεπόμενος ρόλος: </span>{proj.projectedRole}
              </p>
            )}
          </section>

          {/* Season history */}
          <section className="card overflow-x-auto">
            <div className="px-4 pt-4"><h2 className="text-sm font-bold text-white">Ιστορικό / Career stats</h2></div>
            <table className="mt-2 w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="th">Season</th><th className="th">Team</th><th className="th text-right">G</th>
                  <th className="th text-right">MIN</th><th className="th text-right">PTS</th><th className="th text-right">REB</th>
                  <th className="th text-right">AST</th><th className="th text-right">USG%</th><th className="th text-right">PIR</th><th className="th text-right">FP</th>
                </tr>
              </thead>
              <tbody>
                {seasonRows.map((s) => (
                  <tr key={s.id} className="border-b border-white/5">
                    <td className="td font-semibold text-white">{s.season}</td>
                    <td className="td text-slate-400">{s.teamSnapshot ?? "—"}</td>
                    <td className="td text-right stat">{s.games}</td>
                    <td className="td text-right stat">{s.minutes.toFixed(1)}</td>
                    <td className="td text-right stat">{s.points.toFixed(1)}</td>
                    <td className="td text-right stat">{s.rebounds.toFixed(1)}</td>
                    <td className="td text-right stat">{s.assists.toFixed(1)}</td>
                    <td className="td text-right stat">{s.usage.toFixed(1)}</td>
                    <td className="td text-right stat">{s.pir.toFixed(1)}</td>
                    <td className="td text-right stat font-bold text-white">{s.fantasyPoints.toFixed(1)}</td>
                  </tr>
                ))}
                {seasonRows.length === 0 && <tr><td className="td text-slate-500" colSpan={10}>Χωρίς ιστορικό.</td></tr>}
              </tbody>
            </table>
          </section>

          {/* Position competition + usage drivers */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <section className="card card-pad">
              <h2 className="mb-3 text-sm font-bold text-white">Ανταγωνισμός στη θέση ({player.position})</h2>
              <ul className="space-y-2">
                {positionRivals.length === 0 && <li className="text-sm text-slate-500">Καθαρός δρόμος στη θέση.</li>}
                {positionRivals.map((r) => (
                  <li key={r.id} className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3 py-2">
                    <Link href={`/players/${r.id}`} className="text-sm font-semibold text-white hover:text-brand-400">{r.name}</Link>
                    <span className="stat text-xs text-slate-400">{r.proj?.projMinutes.toFixed(0)} min · {r.proj?.projFantasyPoints.toFixed(0)} FP</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card card-pad">
              <h2 className="mb-3 text-sm font-bold text-white">Συμπαίκτες που «τρώνε» usage</h2>
              <ul className="space-y-2">
                {usageDrivers.length === 0 && <li className="text-sm text-slate-500">—</li>}
                {usageDrivers.map((r) => (
                  <li key={r.id} className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3 py-2">
                    <Link href={`/players/${r.id}`} className="text-sm font-semibold text-white hover:text-brand-400">{r.name}</Link>
                    <span className="stat text-xs text-slate-400">USG {r.last?.usage.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        {/* Right column: value + risk + history */}
        <div className="space-y-5">
          <section className="card card-pad">
            <h2 className="mb-3 text-sm font-bold text-white">Fantasy Value</h2>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <Stat label="Price" value={player.fantasyPrice.toFixed(1)} />
              <Stat label="FP / credit" value={proj?.pointsPerCredit.toFixed(2) ?? "—"} />
              <Stat label="Proj FP" value={proj?.projFantasyPoints.toFixed(1) ?? "—"} />
              <Stat label="Ownership" value={`${proj?.ownershipPrediction.toFixed(0) ?? "—"}%`} />
            </div>
            {proj && (
              <ValueBars
                metrics={[
                  { name: "Value", value: proj.valueScore },
                  { name: "Risk-Adj", value: proj.riskAdjustedValue },
                  { name: "Upside", value: proj.upsideScore },
                  { name: "Consistency", value: proj.consistencyScore },
                  { name: "Injury risk", value: proj.injuryRisk },
                ]}
              />
            )}
          </section>

          <section className="card card-pad">
            <h2 className="mb-3 text-sm font-bold text-white">Injury history</h2>
            <ul className="space-y-2">
              {injuries.length === 0 && <li className="text-sm text-slate-500">Καθαρό ιστορικό.</li>}
              {injuries.map((i) => (
                <li key={i.id} className="rounded-xl bg-white/[0.02] px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold capitalize text-white">{i.severity} · {i.status}</span>
                  </div>
                  <p className="text-xs text-slate-400">{i.description}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="card card-pad">
            <h2 className="mb-3 text-sm font-bold text-white">Roster moves</h2>
            <ul className="space-y-2">
              {moves.length === 0 && <li className="text-sm text-slate-500">—</li>}
              {moves.map((m) => (
                <li key={m.id} className="rounded-xl bg-white/[0.02] px-3 py-2 text-xs text-slate-300">
                  <span className="font-semibold capitalize text-white">{m.type}</span> — {m.fromTeam?.shortName ?? "FA"} → {m.toTeam?.shortName ?? "FA"}
                  {m.note && <div className="text-slate-500">{m.note}</div>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

function ProjStat({ label, proj, last, highlight }: { label: string; proj?: number; last?: number; highlight?: boolean }) {
  const delta = proj != null && last != null ? proj - last : null;
  return (
    <div className={`rounded-xl px-2.5 py-2 ${highlight ? "bg-brand-500/10 ring-1 ring-brand-500/25" : "bg-white/[0.03]"}`}>
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="stat text-base font-bold text-white">{proj?.toFixed(1) ?? "—"}</div>
      {delta != null && (
        <div className={`stat text-[10px] ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
        </div>
      )}
    </div>
  );
}
