import Link from "next/link";
import { notFound } from "next/navigation";
import { getTeamWithRoster } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { Meter, PosBadge, RecBadge, Stat, valueTone } from "@/components/ui";
import { categoryBreakdown, fantasyFriendliness, gradeFromFriendliness } from "@/lib/matchup";
import { POSITIONS } from "@/lib/types";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const ROLE_ORDER: Record<string, number> = { starter: 0, rotation: 1, bench: 2, deep_bench: 3, unknown: 4 };

export default async function TeamPage({ params }: { params: { id: string } }) {
  const data = await getTeamWithRoster(params.id);
  if (!data) notFound();
  const { team, roster } = data;
  const f = fantasyFriendliness(team);
  const grade = gradeFromFriendliness(f);
  const cats = categoryBreakdown(team);

  const sortedRoster = [...roster].sort(
    (a, b) => (ROLE_ORDER[a.depthRole] - ROLE_ORDER[b.depthRole]) || (b.proj?.projFantasyPoints ?? 0) - (a.proj?.projFantasyPoints ?? 0)
  );

  return (
    <>
      <Link href="/teams" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        <ArrowLeft size={15} /> Teams
      </Link>

      <div className="card card-pad mb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div
              className="grid h-16 w-16 place-items-center rounded-2xl text-lg font-black text-white ring-1 ring-white/10"
              style={{ background: `linear-gradient(135deg, ${team.colorPrimary}, ${team.colorSecondary})` }}
            >
              {team.shortName}
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white">{team.name}</h1>
              <p className="text-sm text-slate-400">{team.city}, {team.country} · Coach {team.coach}</p>
              <p className="mt-1 max-w-xl text-xs text-slate-400">{team.playstyle}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:w-auto">
            <Stat label="Pace" value={team.pace.toFixed(1)} />
            <Stat label="Off Rtg" value={team.offRating.toFixed(0)} />
            <Stat label="Def Rtg" value={team.defRating.toFixed(0)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Depth chart */}
        <section className="card card-pad lg:col-span-2">
          <h2 className="mb-3 text-sm font-bold text-white">Depth Chart</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            {POSITIONS.map((pos) => {
              const group = sortedRoster.filter((p) => p.position === pos);
              return (
                <div key={pos} className="rounded-xl border border-white/5 bg-white/[0.02] p-2">
                  <div className="mb-2 flex items-center justify-center"><PosBadge pos={pos} /></div>
                  <ul className="space-y-1.5">
                    {group.length === 0 && <li className="text-center text-[11px] text-slate-600">—</li>}
                    {group.map((p, i) => (
                      <li key={p.id}>
                        <Link href={`/players/${p.id}`} className="block rounded-lg bg-white/[0.03] px-2 py-1.5 hover:bg-white/[0.06]">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-xs font-semibold text-white">{p.lastName}</span>
                            <span className="stat text-[10px] text-slate-400">{p.proj?.projFantasyPoints.toFixed(0)}</span>
                          </div>
                          <div className="text-[9px] uppercase tracking-wide text-slate-500">{i === 0 ? "Starter" : p.depthRole}</div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* Defensive / matchup profile */}
        <section className="card card-pad">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Τι επιτρέπει (matchup)</h2>
            <span className="chip bg-white/5 text-slate-200">{grade.toUpperCase()}</span>
          </div>
          <div className="space-y-3">
            <Meter value={f} label="Συνολικό fantasy-friendliness" tone={f >= 53 ? "good" : f >= 47 ? "blue" : "bad"} />
            <Meter value={cats.points} label="Πόντοι που δίνει" tone={valueTone(cats.points)} />
            <Meter value={cats.rebounds} label="Ριμπάουντ που δίνει" tone={valueTone(cats.rebounds)} />
            <Meter value={cats.assists} label="Ασίστ που δίνει" tone={valueTone(cats.assists)} />
            <Meter value={cats.threes} label="Τρίποντα που δίνει" tone={valueTone(cats.threes)} />
            <Meter value={cats.ballSecurity} label="Επιτρέπει ball security" tone={valueTone(cats.ballSecurity)} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <Mini label="PTS allowed" value={team.pointsAllowed.toFixed(1)} />
            <Mini label="REB allowed" value={team.reboundsAllowed.toFixed(1)} />
            <Mini label="AST allowed" value={team.assistsAllowed.toFixed(1)} />
            <Mini label="3PT allowed" value={team.threePtAllowed.toFixed(1)} />
            <Mini label="TO forced" value={team.turnoversForced.toFixed(1)} />
            <Mini label="Def Rtg" value={team.defRating.toFixed(0)} />
          </div>
        </section>
      </div>

      {/* Full roster */}
      <section className="card mt-5 overflow-x-auto">
        <div className="px-4 pt-4"><h2 className="text-sm font-bold text-white">Roster ({roster.length})</h2></div>
        <table className="mt-2 w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-white/5">
              <th className="th">Player</th><th className="th">Pos</th><th className="th">Role</th>
              <th className="th text-right">Price</th><th className="th text-right">Proj MIN</th>
              <th className="th text-right">Proj FP</th><th className="th w-28">Value</th><th className="th">Rec</th>
            </tr>
          </thead>
          <tbody>
            {sortedRoster.map((p) => (
              <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="td"><Link href={`/players/${p.id}`} className="font-semibold text-white hover:text-brand-400">{p.name}</Link></td>
                <td className="td"><PosBadge pos={p.position} /></td>
                <td className="td capitalize text-slate-400">{p.depthRole.replace("_", " ")}</td>
                <td className="td text-right stat">{p.fantasyPrice.toFixed(1)}</td>
                <td className="td text-right stat">{p.proj?.projMinutes.toFixed(1)}</td>
                <td className="td text-right stat font-bold text-white">{p.proj?.projFantasyPoints.toFixed(1)}</td>
                <td className="td"><Meter value={p.proj?.valueScore ?? 0} tone={valueTone(p.proj?.valueScore ?? 0)} /></td>
                <td className="td"><RecBadge rec={p.proj?.recommendation} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
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
