"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { PlayerDTO } from "@/lib/queries";
import { RecBadge, PosBadge, Meter, valueTone } from "@/components/ui";
import { POSITIONS } from "@/lib/types";
import { ChevronDown, ChevronUp, Search } from "lucide-react";

type Mode = "stats" | "projection" | "value";

interface Col {
  key: string;
  label: string;
  get: (p: PlayerDTO) => number | string;
  render?: (p: PlayerDTO) => React.ReactNode;
  align?: "left" | "right";
  numeric?: boolean;
}

export function PlayerExplorer({
  players,
  teams,
  mode = "stats",
}: {
  players: PlayerDTO[];
  teams: { id: string; shortName: string; name: string }[];
  mode?: Mode;
}) {
  // Upper bound for the price filter = the priciest player (rounded up to 0.5),
  // so nobody is hidden by a hard-coded cap.
  const priceCeiling = Math.max(
    1,
    Math.ceil(players.reduce((m, p) => Math.max(m, p.fantasyPrice ?? 0), 0) * 2) / 2
  );

  const [q, setQ] = useState("");
  const [team, setTeam] = useState("ALL");
  const [pos, setPos] = useState("ALL");
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(priceCeiling);
  const [rec, setRec] = useState("ALL");
  const [sortKey, setSortKey] = useState(
    mode === "stats" ? "fp" : mode === "value" ? "valueScore" : "projFp"
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const cols: Col[] = useMemo(() => {
    const nameCol: Col = {
      key: "name", label: "Player", align: "left", get: (p) => p.name,
      render: (p) => (
        <div className="flex flex-col">
          <Link href={`/players/${p.id}`} className="font-semibold text-white hover:text-brand-400">{p.name}</Link>
          <span className="text-[11px] text-slate-500">{p.nationality} · {p.age}y</span>
        </div>
      ),
    };
    const posCol: Col = { key: "pos", label: "Pos", get: (p) => p.position, render: (p) => <PosBadge pos={p.position} /> };
    const teamCol: Col = { key: "team", label: "Team", get: (p) => p.teamShort ?? "FA", render: (p) => <span className="text-slate-400">{p.teamShort ?? "FA"}</span> };
    const priceCol: Col = { key: "price", label: "Price", numeric: true, align: "right", get: (p) => p.fantasyPrice, render: (p) => <span className="stat">{p.fantasyPrice.toFixed(1)}</span> };

    if (mode === "stats") {
      return [
        nameCol, posCol, teamCol,
        num("min", "MIN", (p) => p.last?.minutes ?? 0),
        num("pts", "PTS", (p) => p.last?.points ?? 0),
        num("reb", "REB", (p) => p.last?.rebounds ?? 0),
        num("ast", "AST", (p) => p.last?.assists ?? 0),
        num("stl", "STL", (p) => p.last?.steals ?? 0),
        num("blk", "BLK", (p) => p.last?.blocks ?? 0),
        num("to", "TO", (p) => p.last?.turnovers ?? 0),
        num("usage", "USG%", (p) => p.last?.usage ?? 0),
        num("pir", "PIR", (p) => p.last?.pir ?? 0),
        num("fp", "FP", (p) => p.last?.fantasyPoints ?? 0, true),
        priceCol,
        num("vpc", "Val/cr", (p) => p.proj?.pointsPerCredit ?? 0),
      ];
    }
    if (mode === "projection") {
      return [
        nameCol, posCol, teamCol,
        num("projMin", "MIN", (p) => p.proj?.projMinutes ?? 0),
        num("projUsg", "USG%", (p) => p.proj?.projUsage ?? 0),
        num("projPts", "PTS", (p) => p.proj?.projPoints ?? 0),
        num("projReb", "REB", (p) => p.proj?.projRebounds ?? 0),
        num("projAst", "AST", (p) => p.proj?.projAssists ?? 0),
        num("projStl", "STL", (p) => p.proj?.projSteals ?? 0),
        num("projBlk", "BLK", (p) => p.proj?.projBlocks ?? 0),
        num("projPir", "PIR", (p) => p.proj?.projPir ?? 0),
        num("projFp", "Proj FP", (p) => p.proj?.projFantasyPoints ?? 0, true),
        priceCol,
        { key: "rec", label: "Rec", get: (p) => p.proj?.recommendation ?? "", render: (p) => <RecBadge rec={p.proj?.recommendation} /> },
      ];
    }
    // value mode
    return [
      nameCol, posCol, teamCol, priceCol,
      num("projFp", "Proj FP", (p) => p.proj?.projFantasyPoints ?? 0),
      num("ppc", "FP/cr", (p) => p.proj?.pointsPerCredit ?? 0),
      meter("valueScore", "Value", (p) => p.proj?.valueScore ?? 0),
      meter("rav", "Risk-Adj", (p) => p.proj?.riskAdjustedValue ?? 0),
      meter("upside", "Upside", (p) => p.proj?.upsideScore ?? 0),
      meter("cons", "Consist.", (p) => p.proj?.consistencyScore ?? 0),
      num("own", "Own%", (p) => p.proj?.ownershipPrediction ?? 0),
      { key: "rec", label: "Rec", get: (p) => p.proj?.recommendation ?? "", render: (p) => <RecBadge rec={p.proj?.recommendation} /> },
    ];
  }, [mode]);

  const filtered = useMemo(() => {
    let rows = players.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (team !== "ALL" && p.teamShort !== team && !(team === "FA" && !p.teamShort)) return false;
      if (pos !== "ALL" && p.position !== pos) return false;
      if (p.fantasyPrice < minPrice || p.fantasyPrice > maxPrice) return false;
      if (rec !== "ALL" && p.proj?.recommendation !== rec) return false;
      return true;
    });
    const col = cols.find((c) => c.key === sortKey);
    if (col) {
      rows = [...rows].sort((a, b) => {
        const av = col.get(a);
        const bv = col.get(b);
        const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [players, q, team, pos, minPrice, maxPrice, rec, sortKey, sortDir, cols]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="card card-pad flex flex-wrap items-end gap-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input pl-9" placeholder="Αναζήτηση παίκτη…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select label="Ομάδα" value={team} onChange={setTeam} options={[["ALL", "Όλες"], ["FA", "Free agents"], ...teams.map((t) => [t.shortName, t.shortName] as [string, string])]} />
        <Select label="Θέση" value={pos} onChange={setPos} options={[["ALL", "Όλες"], ...POSITIONS.map((p) => [p, p] as [string, string])]} />
        {mode !== "stats" && (
          <Select label="Recommendation" value={rec} onChange={setRec} options={[["ALL", "Όλες"], ["premium_pick", "Premium"], ["value_pick", "Value"], ["watchlist", "Watch"], ["avoid", "Avoid"]]} />
        )}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-slate-400">Τιμή: {minPrice.toFixed(1)} – {maxPrice.toFixed(1)}</label>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={priceCeiling} step={0.5} value={minPrice} onChange={(e) => setMinPrice(Math.min(+e.target.value, maxPrice))} className="accent-brand-500" />
            <input type="range" min={0} max={priceCeiling} step={0.5} value={maxPrice} onChange={(e) => setMaxPrice(Math.max(+e.target.value, minPrice))} className="accent-brand-500" />
          </div>
        </div>
        <div className="ml-auto text-xs text-slate-400">{filtered.length} παίκτες</div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-white/5">
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={clsx("th cursor-pointer hover:text-slate-200", c.align === "right" || c.numeric ? "text-right" : "text-left")}
                  onClick={() => toggleSort(c.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {sortKey === c.key && (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                {cols.map((c) => (
                  <td key={c.key} className={clsx("td", c.align === "right" || c.numeric ? "text-right" : "")}>
                    {c.render ? c.render(p) : <span className={c.numeric ? "stat" : ""}>{fmt(c.get(p))}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  function num(key: string, label: string, get: (p: PlayerDTO) => number, bold = false): Col {
    return {
      key, label, numeric: true, align: "right", get,
      render: (p) => <span className={clsx("stat", bold && "font-bold text-white")}>{get(p).toFixed(1)}</span>,
    };
  }
  function meter(key: string, label: string, get: (p: PlayerDTO) => number): Col {
    return {
      key, label, numeric: true, get,
      render: (p) => <div className="w-24"><Meter value={get(p)} tone={valueTone(get(p))} /></div>,
    };
  }
}

function fmt(v: number | string) {
  return typeof v === "number" ? v.toFixed(1) : v;
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-slate-400">{label}</label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v} className="bg-ink-850">{l}</option>
        ))}
      </select>
    </div>
  );
}
