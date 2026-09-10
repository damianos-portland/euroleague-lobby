"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PosBadge } from "@/components/ui";
import { fpRange } from "@/lib/value";
import type { PlayerDTO } from "@/lib/queries";

type Row = {
  p: PlayerDTO;
  floor: number;
  mean: number;
  ceiling: number;
  swing: number;
};

type SortCol = "ceiling" | "mean" | "floor" | "swing";
const POSITIONS = ["ALL", "PG", "SG", "SF", "PF", "C"] as const;

export function RangeView({ players }: { players: PlayerDTO[] }) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<(typeof POSITIONS)[number]>("ALL");
  const [sort, setSort] = useState<SortCol>("ceiling");

  const rows = useMemo<Row[]>(() => {
    const base = players
      .filter((p) => p.proj && p.proj.projMinutes >= 8)
      .map((p) => {
        const r = fpRange(p.proj!, p.age);
        return { p, floor: r.floor, mean: r.mean, ceiling: r.ceiling, swing: r.swing };
      });
    const needle = q.trim().toLowerCase();
    const filtered = base.filter(
      (r) =>
        (pos === "ALL" || r.p.position === pos) &&
        (!needle || r.p.name.toLowerCase().includes(needle))
    );
    return filtered.sort((a, b) => b[sort] - a[sort]);
  }, [players, q, pos, sort]);

  // Scale the bars to the highest ceiling on screen (min 20 so it never looks empty).
  const scaleMax = Math.max(20, ...rows.map((r) => r.ceiling));

  return (
    <div className="card card-pad">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          className="input w-full sm:w-64"
          placeholder="Αναζήτηση παίκτη…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input" value={pos} onChange={(e) => setPos(e.target.value as any)}>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p === "ALL" ? "Όλες οι θέσεις" : p}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1 text-xs">
          <span className="text-slate-500">Ταξινόμηση:</span>
          {([
            ["ceiling", "Καυτός"],
            ["mean", "Μέσος"],
            ["floor", "Κρύος"],
            ["swing", "Διακύμανση"],
          ] as [SortCol, string][]).map(([col, label]) => (
            <button
              key={col}
              onClick={() => setSort(col)}
              className={`chip transition ${sort === col ? "bg-brand-500 text-[#fff]" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mb-3 flex items-center gap-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-sky-400" /> Κρύα μέρα (floor)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-200" /> Μέσος όρος</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-brand-500" /> Καυτή μέρα (ceiling)</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-white/10">
              <th className="th w-8">#</th>
              <th className="th">Παίκτης</th>
              <th className="th w-12">Θέση</th>
              <th className="th w-14 text-right">Τιμή</th>
              <th className="th w-14 text-right text-sky-400">Κρύος</th>
              <th className="th w-14 text-right">Μέσος</th>
              <th className="th w-14 text-right text-brand-400">Καυτός</th>
              <th className="th min-w-[220px]">Εύρος FP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="td text-slate-500">{i + 1}</td>
                <td className="td">
                  <Link href={`/players/${r.p.id}`} className="font-semibold text-white hover:text-brand-400">
                    {r.p.name}
                  </Link>
                  <span className="ml-2 text-xs text-slate-500">{r.p.teamShort ?? "FA"}</span>
                </td>
                <td className="td"><PosBadge pos={r.p.position} /></td>
                <td className="td text-right stat text-slate-300">{r.p.fantasyPrice.toFixed(1)}</td>
                <td className="td text-right stat font-semibold text-sky-300">{r.floor.toFixed(1)}</td>
                <td className="td text-right stat font-bold text-white">{r.mean.toFixed(1)}</td>
                <td className="td text-right stat font-semibold text-brand-300">{r.ceiling.toFixed(1)}</td>
                <td className="td">
                  <RangeBar floor={r.floor} mean={r.mean} ceiling={r.ceiling} max={scaleMax} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="td text-slate-500" colSpan={8}>Κανένας παίκτης.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Horizontal cold→hot band from floor to ceiling, with a marker at the mean.
function RangeBar({ floor, mean, ceiling, max }: { floor: number; mean: number; ceiling: number; max: number }) {
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const left = pct(floor);
  const width = `${Math.min(100, ((ceiling - floor) / max) * 100)}%`;
  return (
    <div className="relative h-3 w-full rounded-full bg-white/[0.06]">
      <div
        className="absolute top-0 h-3 rounded-full bg-gradient-to-r from-sky-500/70 via-slate-300/60 to-brand-500"
        style={{ left, width }}
      />
      <div
        className="absolute top-[-2px] h-[16px] w-[2px] rounded bg-white shadow"
        style={{ left: pct(mean) }}
        title={`Μέσος ${mean.toFixed(1)}`}
      />
    </div>
  );
}
