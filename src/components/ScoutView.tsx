"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from "recharts";
import { ScatterChart as ScatterIcon, ListChecks, Info } from "lucide-react";
import type { PlayerDTO } from "@/lib/queries";
import { INTENTS, IntentKey, rankByIntent, intentReason, MATCHUP_FACTORS } from "@/lib/scout";

type Tab = "chart" | "recs";
type Basis = "proj" | "last" | "l5" | "l10";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
const FAIR_PPC = 2.2; // fair value line: proj FP = 2.2 × price

const REC_STYLE: Record<string, { color: string; label: string }> = {
  premium_pick: { color: "#f97316", label: "Premium" },
  value_pick: { color: "#34d399", label: "Value" },
  watchlist: { color: "#facc15", label: "Watch" },
  avoid: { color: "#64748b", label: "Avoid" },
};

export function ScoutView({
  players,
  teams,
}: {
  players: PlayerDTO[];
  teams: { id: string; shortName: string; name: string }[];
}) {
  const [tab, setTab] = useState<Tab>("chart");
  const [team, setTeam] = useState("ALL");
  const [pos, setPos] = useState("ALL");
  const [basis, setBasis] = useState<Basis>("proj");
  const [minFp, setMinFp] = useState(0);
  const [intent, setIntent] = useState<IntentKey>("gems");
  const [maxPrice, setMaxPrice] = useState(99);

  // Only players with a projection are chartable/rankable.
  const base = useMemo(
    () =>
      players.filter(
        (p) =>
          p.proj &&
          (team === "ALL" || p.teamShort === team) &&
          (pos === "ALL" || p.position === pos)
      ),
    [players, team, pos]
  );

  // Y value depends on the chosen basis. l5/l10 have no data yet.
  const yOf = (p: PlayerDTO): number | null => {
    if (basis === "proj") return p.proj?.projFantasyPoints ?? null;
    if (basis === "last") return p.last?.fantasyPoints ?? null;
    return null; // l5 / l10 — no game-log data yet
  };

  const priceCeiling = useMemo(
    () => Math.max(1, Math.ceil(players.reduce((m, p) => Math.max(m, p.fantasyPrice), 0))),
    [players]
  );

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-2">
        <TabBtn active={tab === "chart"} onClick={() => setTab("chart")} icon={<ScatterIcon size={15} />} label="Διάγραμμα" />
        <TabBtn active={tab === "recs"} onClick={() => setTab("recs")} icon={<ListChecks size={15} />} label="Προτάσεις" />
      </div>

      {/* Shared filters */}
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Ομάδα" value={team} onChange={setTeam} options={[["ALL", "Όλες"], ...teams.map((t) => [t.shortName, t.shortName] as [string, string])]} />
        <Select label="Θέση" value={pos} onChange={setPos} options={[["ALL", "Όλες"], ...POSITIONS.map((p) => [p, p] as [string, string])]} />
        {tab === "chart" ? (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-slate-400">Βάση</span>
              <div className="flex gap-1">
                {([["proj", "Proj 26-27"], ["last", "Πέρσι"], ["l5", "L5"], ["l10", "L10"]] as [Basis, string][]).map(([k, lbl]) => {
                  const disabled = k === "l5" || k === "l10";
                  return (
                    <button
                      key={k}
                      disabled={disabled}
                      onClick={() => setBasis(k)}
                      title={disabled ? "Χρειάζεται δεδομένα ανά αγώνα (σύντομα)" : ""}
                      className={clsx(
                        "btn !px-2.5 !py-1.5 text-xs",
                        basis === k ? "bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/40" : "btn-ghost",
                        disabled && "cursor-not-allowed opacity-40"
                      )}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-slate-400">Ελάχ. FP: {minFp}</span>
              <input type="range" min={0} max={30} step={1} value={minFp} onChange={(e) => setMinFp(+e.target.value)} className="accent-brand-500" />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">Μέγ. τιμή: {maxPrice >= priceCeiling ? "όλες" : maxPrice.toFixed(0)}</span>
            <input type="range" min={1} max={priceCeiling} step={1} value={Math.min(maxPrice, priceCeiling)} onChange={(e) => setMaxPrice(+e.target.value)} className="accent-brand-500" />
          </div>
        )}
      </div>

      {tab === "chart" ? (
        <ChartTab base={base} yOf={yOf} minFp={minFp} basis={basis} priceCeiling={priceCeiling} />
      ) : (
        <RecsTab base={base} intent={intent} setIntent={setIntent} maxPrice={maxPrice} priceCeiling={priceCeiling} />
      )}
    </div>
  );
}

// --- Chart tab ------------------------------------------------------------

function ChartTab({
  base,
  yOf,
  minFp,
  basis,
  priceCeiling,
}: {
  base: PlayerDTO[];
  yOf: (p: PlayerDTO) => number | null;
  minFp: number;
  basis: Basis;
  priceCeiling: number;
}) {
  const router = useRouter();

  const points = useMemo(() => {
    return base
      .map((p) => {
        const y = yOf(p);
        if (y === null || y < minFp) return null;
        return {
          id: p.id,
          name: p.name,
          x: p.fantasyPrice,
          y,
          z: p.proj?.projMinutes ?? 10,
          rec: p.proj?.recommendation ?? "avoid",
          pos: p.position,
          team: p.teamShort ?? "FA",
          value: p.proj?.valueScore ?? 0,
        };
      })
      .filter(Boolean) as any[];
  }, [base, yOf, minFp]);

  if (basis === "l5" || basis === "l10") {
    return <EmptyBasis />;
  }

  const groups = ["premium_pick", "value_pick", "watchlist", "avoid"].map((rec) => ({
    rec,
    data: points.filter((p) => p.rec === rec),
  }));

  const maxY = Math.max(10, ...points.map((p) => p.y));

  return (
    <div className="space-y-3">
      <div className="card card-pad">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            <span className="font-semibold text-white">Πάνω-δεξιά = ελίτ σκόρερ</span> · πάνω-αριστερά = φθηνά διαμάντια · η διακεκομμένη = δίκαιη αξία ({FAIR_PPC} FP/credit)
          </p>
          <span className="text-xs text-slate-500">{points.length} παίκτες</span>
        </div>
        <div style={{ width: "100%", height: 460 }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                type="number" dataKey="x" name="Κόστος" unit="cr"
                domain={[0, priceCeiling]} tick={{ fill: "#94a3b8", fontSize: 11 }}
                label={{ value: "Κόστος (credits)", position: "insideBottom", offset: -8, fill: "#64748b", fontSize: 12 }}
              />
              <YAxis
                type="number" dataKey="y" name="Fantasy Points"
                domain={[0, Math.ceil(maxY / 5) * 5]} tick={{ fill: "#94a3b8", fontSize: 11 }}
                label={{ value: "Fantasy Points", angle: -90, position: "insideLeft", offset: 16, fill: "#64748b", fontSize: 12 }}
              />
              <ZAxis type="number" dataKey="z" range={[30, 320]} name="Λεπτά" />
              <ReferenceLine
                ifOverflow="extendDomain"
                segment={[{ x: 0, y: 0 }, { x: priceCeiling, y: FAIR_PPC * priceCeiling }]}
                stroke="rgba(148,163,184,0.5)" strokeDasharray="5 4"
              />
              <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: "3 3" }} />
              {groups.map((g) => (
                <Scatter
                  key={g.rec} name={REC_STYLE[g.rec].label} data={g.data}
                  fill={REC_STYLE[g.rec].color}
                  onClick={(d: any) => d?.id && router.push(`/players/${d.id}`)}
                  cursor="pointer"
                >
                  {g.data.map((d) => (
                    <Cell key={d.id} fillOpacity={g.rec === "avoid" ? 0.35 : 0.85} />
                  ))}
                </Scatter>
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <Legend />
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const rec = REC_STYLE[d.rec] ?? REC_STYLE.avoid;
  return (
    <div className="rounded-lg border border-white/10 bg-[#0f1424] px-3 py-2 text-xs shadow-xl">
      <div className="font-bold text-white">{d.name}</div>
      <div className="text-slate-400">{d.pos} · {d.team}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="stat text-white">{d.y.toFixed(1)} FP</span>
        <span className="text-slate-500">·</span>
        <span className="stat text-white">{d.x.toFixed(1)} cr</span>
        <span className="chip" style={{ background: `${rec.color}22`, color: rec.color }}>{rec.label}</span>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
      {Object.entries(REC_STYLE).map(([k, v]) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: v.color }} /> {v.label}
        </span>
      ))}
      <span className="ml-auto inline-flex items-center gap-1 text-slate-500">
        <Info size={12} /> Μέγεθος = προβλεπόμενα λεπτά
      </span>
    </div>
  );
}

function EmptyBasis() {
  return (
    <div className="card card-pad flex flex-col items-center gap-2 py-16 text-center">
      <ScatterIcon size={28} className="text-slate-600" />
      <p className="text-sm font-semibold text-white">Last-5 / Last-10 έρχονται σύντομα</p>
      <p className="max-w-md text-xs text-slate-500">
        Χρειάζονται στατιστικά ανά αγώνα (box scores) που δεν έχουμε ακόμη κάνει ingest. Μόλις μπουν, το διάγραμμα
        θα δείχνει και τη φόρμα των τελευταίων παιχνιδιών.
      </p>
    </div>
  );
}

// --- Recommendations tab --------------------------------------------------

function RecsTab({
  base,
  intent,
  setIntent,
  maxPrice,
  priceCeiling,
}: {
  base: PlayerDTO[];
  intent: IntentKey;
  setIntent: (k: IntentKey) => void;
  maxPrice: number;
  priceCeiling: number;
}) {
  const filtered = useMemo(
    () => base.filter((p) => p.fantasyPrice <= (maxPrice >= priceCeiling ? Infinity : maxPrice)),
    [base, maxPrice, priceCeiling]
  );
  const ranked = useMemo(() => rankByIntent(filtered, intent).slice(0, 40), [filtered, intent]);
  const active = INTENTS.find((i) => i.key === intent)!;

  return (
    <div className="space-y-4">
      {/* Intent picker */}
      <div className="flex flex-wrap gap-2">
        {INTENTS.map((i) => (
          <button
            key={i.key}
            onClick={() => setIntent(i.key)}
            className={clsx(
              "btn !px-3 !py-1.5 text-xs",
              intent === i.key ? "bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/40" : "btn-ghost"
            )}
          >
            {i.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-400">{active.hint}</p>

      {/* Ranked list */}
      <div className="space-y-2">
        {ranked.map((p, i) => (
          <Link
            key={p.id}
            href={`/players/${p.id}`}
            className="card card-pad flex items-center gap-3 transition hover:ring-1 hover:ring-brand-500/30"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5 text-xs font-bold text-slate-300">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-bold text-white">{p.name}</span>
                <span className="chip bg-white/5 text-slate-300">{p.position}</span>
                <span className="text-xs text-slate-500">{p.teamShort ?? "FA"}</span>
                {p.proj && (
                  <span className="chip" style={recChip(p.proj.recommendation)}>{REC_STYLE[p.proj.recommendation]?.label ?? "—"}</span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-slate-500">{p.proj?.rationale}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="stat text-sm font-bold text-white">{intentReason(p, intent)}</div>
              <div className="stat text-[11px] text-slate-500">{p.fantasyPrice.toFixed(1)}cr · {p.proj?.projFantasyPoints.toFixed(1)} FP</div>
            </div>
          </Link>
        ))}
        {ranked.length === 0 && <p className="text-sm text-slate-500">Κανένας παίκτης δεν ταιριάζει στα φίλτρα.</p>}
      </div>

      {/* Honest note on what's still missing */}
      <div className="card card-pad">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
          <Info size={13} className="text-brand-400" /> Έρχονται με τη φάση δεδομένων (matchup)
        </div>
        <ul className="ml-4 list-disc space-y-0.5 text-[11px] text-slate-500">
          {MATCHUP_FACTORS.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function recChip(rec: string): React.CSSProperties {
  const c = REC_STYLE[rec]?.color ?? "#64748b";
  return { background: `${c}22`, color: c };
}

// --- shared bits ----------------------------------------------------------

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition",
        active ? "bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30" : "text-slate-400 hover:bg-white/5 hover:text-white"
      )}
    >
      {icon} {label}
    </button>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-slate-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input text-xs">
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}
