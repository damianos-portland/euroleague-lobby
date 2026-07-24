import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  getTopByValue,
  getAlerts,
  getWatchlist,
  getNewsItems,
  getRosterRace,
  getValueDeltas,
} from "@/lib/queries";
import { auth } from "@/auth";
import { PageHeader } from "@/components/PageHeader";
import { RecBadge, SignalBadge, PosBadge, Meter, valueTone } from "@/components/ui";
import { Ticker, BoardCard, DeltaTag, TickerItem } from "@/components/desk";
import { Bell, Star, TrendingUp, Trophy, Newspaper, HardHat, Wallet } from "lucide-react";
import { TEAM_BUDGETS } from "@/data/budgets";

export const dynamic = "force-dynamic";

const ROSTER_REF = 16;

export default async function LobbyPage() {
  const session = await auth();
  const [market, news, rosterRace, deltas, alerts, activeRumors, topRumor] = await Promise.all([
    getTopByValue(15),
    getNewsItems(12),
    getRosterRace(),
    getValueDeltas(),
    getAlerts(6),
    prisma.newsItem.count({ where: { kind: "rumor" } }),
    prisma.newsItem.findFirst({ where: { kind: "rumor" }, orderBy: { publishedAt: "desc" } }),
  ]);
  const watchlist = session?.user?.id ? await getWatchlist(session.user.id) : [];

  // Ticker: news + roster meta item.
  const signedTotal = rosterRace.reduce((s, t) => s + t.entries.length, 0);
  const tickerItems: TickerItem[] = [
    ...news.map((n) => {
      const title = (n.titleEl ?? n.title).toUpperCase().slice(0, 70);
      return {
        id: n.id,
        kind: (n.kind === "official" || n.kind === "rumor" ? n.kind : "news") as TickerItem["kind"],
        text: n.kind === "rumor" ? `${title} [${n.confidence}%]` : title,
        href: n.url,
      };
    }),
    { id: "meta-rosters", kind: "meta" as const, text: `ROSTERS 2026-27: ${signedTotal}/${20 * ROSTER_REF} SIGNED` },
  ];

  // Board stats.
  const leader = rosterRace[0];
  const laggard = rosterRace[rosterRace.length - 1];
  const topBudget = TEAM_BUDGETS.reduce((m, b) => (b.budgetMEur > m.budgetMEur ? b : m), TEAM_BUDGETS[0]);
  const avgBudget = Math.round(TEAM_BUDGETS.reduce((s, b) => s + b.budgetMEur, 0) / TEAM_BUDGETS.length);
  const risers = [...deltas.entries()].filter(([, d]) => d >= 2).sort((a, b) => b[1] - a[1]);
  const fallers = [...deltas.entries()].filter(([, d]) => d <= -2);
  const topRiserPlayer = risers[0] ? market.find((p) => p.id === risers[0][0]) : undefined;

  return (
    <>
      <PageHeader
        title="Lobby"
        status="● LIVE · OFFSEASON 2026-27"
        subtitle="Το trading desk του fantasy manager — αγορά, φήμες, ρόστερ και budgets σε μία οθόνη."
        action={
          <Link href="/draft" className="btn-primary">
            <Trophy size={16} /> Draft Mode 2026
          </Link>
        }
      />

      <Ticker items={tickerItems} />

      {/* Boards */}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <BoardCard
          href="/rumors"
          tint="amber"
          icon={<Newspaper size={13} />}
          title="RUMOR MILL"
          stat={activeRumors}
          sub={topRumor ? `top: ${(topRumor.titleEl ?? topRumor.title).slice(0, 40)}…` : "καμία ενεργή φήμη"}
        />
        <BoardCard
          href="/roster-race"
          tint="sky"
          icon={<HardHat size={13} />}
          title="ROSTER RACE"
          stat={
            <>
              {signedTotal}
              <span className="text-sm text-slate-500">/{20 * ROSTER_REF}</span>
            </>
          }
          sub={leader ? `leader: ${leader.teamCode} ${leader.entries.length} · τελευταία: ${laggard.teamCode} ${laggard.entries.length}` : "—"}
        />
        <BoardCard
          href="/budgets"
          tint="violet"
          icon={<Wallet size={13} />}
          title="BUDGET LEAGUE"
          stat={`€${topBudget.budgetMEur}M`}
          sub={`top: ${topBudget.code} · μ.ο. €${avgBudget}M`}
        />
        <BoardCard
          href="/projections"
          tint="green"
          icon={<TrendingUp size={13} />}
          title="MOVERS"
          stat={`▲ ${risers.length} · ▼ ${fallers.length}`}
          sub={topRiserPlayer ? `riser: ${topRiserPlayer.name}` : "value shifts vs χθες"}
        />
      </div>

      {/* The Market */}
      <section className="card card-pad mb-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <TrendingUp size={16} className="text-brand-400" /> The Market — Top Value
          </h2>
          <Link href="/projections" className="font-mono text-xs font-semibold text-brand-400 hover:underline">
            FULL BOARD →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-white/5">
                <th className="th">#</th>
                <th className="th">Asset</th>
                <th className="th">Pos</th>
                <th className="th text-right">Price</th>
                <th className="th text-right">Proj FP</th>
                <th className="th text-right">FP/cr</th>
                <th className="th w-28">Value</th>
                <th className="th text-right">Δ</th>
                <th className="th">Signal</th>
                <th className="th">Rec</th>
              </tr>
            </thead>
            <tbody>
              {market.map((p, i) => (
                <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="td stat text-slate-500">{i + 1}</td>
                  <td className="td">
                    <Link href={`/players/${p.id}`} className="stat font-bold text-white hover:text-brand-400">
                      {p.lastName.toUpperCase()}
                      <span className="text-slate-500">.{p.teamShort ?? "FA"}</span>
                    </Link>
                  </td>
                  <td className="td"><PosBadge pos={p.position} /></td>
                  <td className="td stat text-right">{p.fantasyPrice.toFixed(1)}</td>
                  <td className="td stat text-right font-bold text-white">{p.proj?.projFantasyPoints.toFixed(1)}</td>
                  <td className="td stat text-right">{p.proj?.pointsPerCredit.toFixed(1)}</td>
                  <td className="td"><Meter value={p.proj?.valueScore ?? 0} tone={valueTone(p.proj?.valueScore ?? 0)} /></td>
                  <td className="td text-right"><DeltaTag delta={deltas.get(p.id)} /></td>
                  <td className="td"><SignalBadge signal={p.proj?.signal} /></td>
                  <td className="td"><RecBadge rec={p.proj?.recommendation} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Alerts + Watchlist */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="card card-pad">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <Bell size={16} className="text-amber-400" /> Fantasy Alerts
          </h2>
          <ul className="space-y-3">
            {alerts.length === 0 && <li className="text-sm text-slate-500">Κανένα alert.</li>}
            {alerts.map((a) => (
              <li key={a.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{a.title}</span>
                </div>
                {a.body && <p className="mt-1 text-xs leading-relaxed text-slate-400">{a.body}</p>}
                {a.player && (
                  <Link href={`/players/${a.playerId}`} className="mt-1 inline-block font-mono text-[11px] font-semibold text-brand-400 hover:underline">
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
            {session?.user?.name && <span className="text-xs font-normal text-slate-500">({session.user.name})</span>}
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
    </>
  );
}
