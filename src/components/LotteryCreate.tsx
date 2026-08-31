"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dice5 } from "lucide-react";

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
  const [teamsText, setTeamsText] = useState(
    Array.from({ length: 12 }, (_, i) => `Team ${i + 1}`).join("\n")
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teams = parseTeams(teamsText);
  const weighted = teams.some((t) => t.weight !== 1);

  async function create() {
    if (teams.length < 2) {
      setError("Χρειάζονται τουλάχιστον 2 ομάδες.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/draft/lottery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rounds, pickSeconds, teams }),
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
        <label className="block">
          <span className="mb-1 block text-[11px] text-slate-400">
            Ομάδες — μία ανά γραμμή. Προαιρετικά βάρος: <span className="font-mono">Όνομα : 5</span> (μεγαλύτερο = καλύτερες πιθανότητες)
          </span>
          <textarea className="input min-h-[220px] w-full font-mono text-xs" value={teamsText} onChange={(e) => setTeamsText(e.target.value)} />
        </label>
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>{teams.length} ομάδες</span>
          <span>{weighted ? "⚖️ Weighted lottery" : "🎲 Καθαρά τυχαίο (ίσες πιθανότητες)"}</span>
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button className="btn-primary w-full" onClick={create} disabled={busy}>
          <Dice5 size={16} /> {busy ? "Δημιουργία…" : "Δημιουργία κλήρωσης"}
        </button>
      </div>
    </section>
  );
}
