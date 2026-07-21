import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  getTopByValue,
  getRecentMoves,
  getAlerts,
  getFreeAgents,
  getDemoUser,
  getWatchlist,
} from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { RecBadge, SignalBadge, PosBadge, StatusBadge, Stat, Meter, valueTone } from "@/components/ui";
import { ArrowRightLeft, Bell, Star, TrendingUp, UserMinus, Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LobbyPage() {
  const [top, moves, alerts, freeAgents, demo, counts] = await Promise.all([
    getTopByValue(12),
    getRecentMoves(8),
    getAlerts(8),
    getFreeAgents(),
    getDemoUser(),
    Promise.all([prisma.player.count(), prisma.team.count(), prisma.rosterMove.count()]),
  ]);
  const watchlist = demo ? await getWatchlist(demo.id) : [];
  const [playerCount, teamCount, moveCount] = counts;
  const changedTeam = moves.filter((m) => m.type === "transfer");

  return (
    <>
      <PageHeader
        title="EuroLeague Lobby"
        subtitle="Το κέντρο ελέγχου του fantasy manager για τη σεζόν 2025-26 — rosters, μεταγραφές, projections, value & draft prep."
        action={
          <Link href="/draft" className="btn-primary">
            <Trophy size={16} /> Draft Mode 2026
          </Link>
        }
      />

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Players tracked" value={playerCount} />
        <Stat label="Teams" value={teamCount} />
        <Stat label="Roster moves" value={moveCount} />
        <Stat label="Free agents" value={freeAgents.length} sub="χωρίς ομάδα" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left: ranking */}
        <div className="lg:col-span-2 space-y-5">
          <section className="card card-pad">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-white">
                <TrendingUp size={16} className="text-brand-400" /> Top Projected Value — 2025-26
              </h2>
              <Link href="/projections" className="text-xs font-semibold text-brand-400 hover:underline">
                Όλα τα projections →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="th">#</th>
                    <th className="th">Player</th>
                    <th className="th">Pos</th>
                    <th className="th">Team</th>
                    <th className="th text-right">Price</th>
                    <th className="th text-right">Proj FP</th>
                    <th className="th text-right">FP/cr</th>
                    <th className="th w-32">Value</th>
                    <th className="th">Rec</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((p, i) => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="td text-slate-500">{i + 1}</td>
                      <td className="td">
                        <Link href={`/players/${p.id}`} className="font-semibold text-white hover:text-brand-400">
                          {p.name}
                        </Link>
                      </td>
                      <td className="td"><PosBadge pos={p.position} /></td>
                      <td className="td text-slate-400">{p.teamShort ?? "—"}</td>
                      <td className="td text-right stat">{p.fantasyPrice.toFixed(1)}</td>
                      <td className="td text-right stat font-bold text-white">{p.proj?.projFantasyPoints.toFixed(1)}</td>
                      <td className="td text-right stat">{p.proj?.pointsPerCredit.toFixed(1)}</td>
                      <td className="td"><Meter value={p.proj?.valueScore ?? 0} tone={valueTone(p.proj?.valueScore ?? 0)} /></td>
                      <td className="td"><RecBadge rec={p.proj?.recommendation} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Transfers + changed team */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <section className="card card-pad">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                <ArrowRightLeft size={16} className="text-sky-400" /> Πρόσφατες μεταγραφές
              </h2>
              <ul className="space-y-2.5">
                {changedTeam.length === 0 && <li className="text-sm text-slate-500">—</li>}
                {changedTeam.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.02] px-3 py-2">
                    <Link href={`/players/${m.playerId}`} className="text-sm font-semibold text-white hover:text-brand-400">
                      {m.player.firstName} {m.player.lastName}
                    </Link>
                    <span className="text-xs text-slate-400">
                      {m.fromTeam?.shortName ?? "FA"} <span className="text-brand-400">→</span> {m.toTeam?.shortName ?? "?"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card card-pad">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                <UserMinus size={16} className="text-rose-400" /> Παίκτες χωρίς ομάδα
              </h2>
              <ul className="space-y-2.5">
                {freeAgents.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.02] px-3 py-2">
                    <Link href={`/players/${p.id}`} className="text-sm font-semibold text-white hover:text-brand-400">
                      {p.name}
                    </Link>
                    <div className="flex items-center gap-2">
                      <PosBadge pos={p.position} />
                      <StatusBadge status={p.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        {/* Right: alerts + watchlist */}
        <div className="space-y-5">
          <section className="card card-pad">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <Bell size={16} className="text-amber-400" /> Fantasy Alerts
            </h2>
            <ul className="space-y-3">
              {alerts.map((a) => (
                <li key={a.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{a.title}</span>
                    <SeverityDot severity={a.severity} />
                  </div>
                  {a.body && <p className="mt-1 text-xs leading-relaxed text-slate-400">{a.body}</p>}
                  {a.player && (
                    <Link href={`/players/${a.playerId}`} className="mt-1 inline-block text-[11px] font-semibold text-brand-400 hover:underline">
                      {a.player.firstName} {a.player.lastName} →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="card card-pad">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <Star size={16} className="text-amber-400" /> Watchlist
              <span className="text-xs font-normal text-slate-500">({demo?.name})</span>
            </h2>
            <ul className="space-y-2">
              {watchlist.length === 0 && <li className="text-sm text-slate-500">Άδειο watchlist.</li>}
              {watchlist.map(({ player }) => (
                <li key={player.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.02] px-3 py-2">
                  <Link href={`/players/${player.id}`} className="text-sm font-semibold text-white hover:text-brand-400">
                    {player.name}
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className="stat text-xs text-slate-400">{player.proj?.projFantasyPoints.toFixed(1)} FP</span>
                    <SignalBadge signal={player.proj?.signal} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    info: "bg-sky-400",
    warning: "bg-amber-400",
    critical: "bg-rose-400",
  };
  return <span className={`h-2 w-2 shrink-0 rounded-full ${map[severity] ?? "bg-slate-400"}`} />;
}
