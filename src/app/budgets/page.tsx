import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { TEAM_BUDGETS, BUDGET_SOURCE } from "@/data/budgets";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  // Projected team FP = sum of projFantasyPoints of the team's top 12 players.
  const players = await prisma.player.findMany({
    where: { projection: { isNot: null } },
    select: { team: { select: { shortName: true } }, projection: { select: { projFantasyPoints: true } } },
  });
  const fpByTeam = new Map<string, number[]>();
  for (const p of players) {
    const code = p.team?.shortName;
    if (!code || !p.projection) continue;
    if (!fpByTeam.has(code)) fpByTeam.set(code, []);
    fpByTeam.get(code)!.push(p.projection.projFantasyPoints);
  }
  const teamFp = (code: string) =>
    (fpByTeam.get(code) ?? []).sort((a, b) => b - a).slice(0, 12).reduce((s, v) => s + v, 0);

  const maxBudget = Math.max(...TEAM_BUDGETS.map((b) => b.budgetMEur));
  const rows = TEAM_BUDGETS.map((b) => {
    const fp = teamFp(b.code);
    return { ...b, fp, fpPerM: fp > 0 ? fp / b.budgetMEur : 0 };
  });
  const smart = [...rows].filter((r) => r.fp > 0).sort((a, b) => b.fpPerM - a.fpPerM);

  return (
    <>
      <PageHeader
        title="Budget League"
        status="● ΕΚΤΙΜΗΣΕΙΣ · ΟΧΙ ΕΠΙΣΗΜΑ"
        subtitle={`Ποιος ξοδεύει πόσα — και ποιος αγοράζει έξυπνα (Projected FP ανά €M). ${BUDGET_SOURCE}.`}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="card card-pad tint-violet">
          <h2 className="mb-3 text-sm font-bold text-white">💰 Budgets (€M)</h2>
          <ul className="space-y-2">
            {rows.map((b) => (
              <li key={b.code} className="flex items-center gap-3">
                <span className="stat w-10 shrink-0 text-xs text-slate-400">{b.code}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-white/[0.05]">
                  <div
                    className="h-full rounded bg-gradient-to-r from-violet-500/80 to-violet-400/50"
                    style={{ width: `${(b.budgetMEur / maxBudget) * 100}%` }}
                  />
                </div>
                <span className="stat w-14 shrink-0 text-right text-xs font-bold text-white">€{b.budgetMEur}M</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card card-pad tint-green">
          <h2 className="mb-3 text-sm font-bold text-white">🧠 Ποιος αγοράζει έξυπνα — Proj FP ανά €M</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="th">#</th>
                <th className="th">Team</th>
                <th className="th text-right">Proj FP (top-12)</th>
                <th className="th text-right">Budget</th>
                <th className="th text-right">FP/€M</th>
              </tr>
            </thead>
            <tbody>
              {smart.map((r, i) => (
                <tr key={r.code} className="border-b border-white/5">
                  <td className="td text-slate-500">{i + 1}</td>
                  <td className="td font-semibold text-white">{r.name}</td>
                  <td className="td stat text-right">{r.fp.toFixed(0)}</td>
                  <td className="td stat text-right">€{r.budgetMEur}M</td>
                  <td className="td stat text-right font-bold text-emerald-300">{r.fpPerM.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-slate-500">
            Projected FP για το 2026-27 από τα περσινά (2025-26) δεδομένα των παικτών κάθε ομάδας· τα budgets είναι δημοσιευμένες εκτιμήσεις.
          </p>
        </section>
      </div>
    </>
  );
}
