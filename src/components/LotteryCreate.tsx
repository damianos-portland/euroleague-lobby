"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Dice5 } from "lucide-react";
import { nbaLotteryWeights, oddsPercent } from "@/lib/draft";

type Mode = "nba" | "equal" | "manual";

// Parse "TeamName" or "TeamName : weight" per line into {name, weight}.
function parseTeams(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(.*?)(?::\s*(\d+))?\s*$/);
      return { name: (m?.[1] ?? l).trim(), weight: m?.[2] ? Number(m[2]) : 1 };
    })
    .filter((t) => t.name);
}

export function LotteryCreate() {
  const router = useRouter();
  const [name, setName] = useState("EuroLeague Fantasy League 2026-27");
  const [rounds, setRounds] = useState(10);
  const [pickSeconds, setPickSeconds] = useState(60);
  const [mode, setMode] = useState<Mode>("nba");
  const [teamsText, setTeamsText] = useState(
    Array.from({ length: 12 }, (_, i) => `Team ${i + 1}`).join("\n")
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teams = parseTeams(teamsText);
  const n = teams.length;

  // Weights actually used, by the selected mode.
  const weights =
    mode === "nba" ? nbaLotteryWeights(n) : mode === "equal" ? teams.map(() => 1) : teams.map((t) => t.weight);
  const odds = oddsPercent(weights);

  async function create() {
    if (n < 2) {
      setError("Χρειάζονται τουλάχιστον 2 ομάδες.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/draft/lottery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rounds, pickSeconds, mode, teams }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Σφάλμα.");
        return;
      }
      router.push(`/draft/lottery/${data.roomId}`);
    } finally {
      setBusy(false);
    }
  }

  const MODES: { key: Mode; label: string }[] = [
    { key: "nba", label: "🏀 NBA-style" },
    { key: "equal", label: "🎲 Ίσες" },
    { key: "manual", label: "⚖️ Χειροκίνητα" },
  ];

  return (
    <section className="card card-pad">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
        <Dice5 size={16} className="text-brand-400" /> Νέα Κλήρωση
      </h2>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[11px] text-slate-400">Όνομα league</span>
          <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] text-slate-400">Γύροι</span>
            <input type="number" min={3} max={15} className="input w-full" value={rounds} onChange={(e) => setRounds(+e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] text-slate-400">Timer / pick (s)</span>
            <input type="number" min={15} max={180} className="input w-full" value={pickSeconds} onChange={(e) => setPickSeconds(+e.target.value)} />
          </label>
        </div>

        <div>
          <span className="mb-1 block text-[11px] text-slate-400">Τύπος κλήρωσης</span>
          <div className="flex gap-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={clsx(
                  "btn !px-3 !py-1.5 text-xs",
                  mode === m.key ? "bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/40" : "btn-ghost"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {mode === "nba"
              ? "Σειρά = περσινή κατάταξη, χειρότερη πρώτη → μεγαλύτερες πιθανότητες (αναλογία NBA, κλιμακωμένη στις ομάδες σου)."
              : mode === "equal"
              ? "Όλες οι ομάδες ίδιες πιθανότητες."
              : "Χειροκίνητα βάρη: γράψε «Όνομα : βάρος» ανά γραμμή."}
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-[11px] text-slate-400">
            Ομάδες — μία ανά γραμμή{mode === "nba" ? " (χειρότερη πέρσι πρώτη)" : ""}
          </span>
          <textarea className="input min-h-[200px] w-full font-mono text-xs" value={teamsText} onChange={(e) => setTeamsText(e.target.value)} />
        </label>

        {/* Live odds preview */}
        {n >= 2 && (
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="mb-1.5 text-[11px] font-semibold text-slate-400">Πιθανότητες #1 pick</div>
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {teams.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="stat w-6 shrink-0 text-slate-500">{i + 1}</span>
                  <span className="flex-1 truncate text-slate-200">{t.name}</span>
                  <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-brand-500/70" style={{ width: `${Math.min(100, (odds[i] / Math.max(...odds, 1)) * 100)}%` }} />
                  </div>
                  <span className="stat w-12 shrink-0 text-right text-slate-400">{odds[i]}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button className="btn-primary w-full" onClick={create} disabled={busy}>
          <Dice5 size={16} /> {busy ? "Δημιουργία…" : "Δημιουργία κλήρωσης"}
        </button>
      </div>
    </section>
  );
}
