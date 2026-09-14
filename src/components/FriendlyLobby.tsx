"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Swords, Loader2, Check, X, Clock, Trophy, ChevronRight } from "lucide-react";

interface Opponent {
  id: string;
  name: string;
}
interface MatchRow {
  id: string;
  mode: string;
  status: string;
  role: "challenger" | "opponent";
  opponentName: string;
  iWon: boolean | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Εκκρεμεί",
  building: "Στήσιμο σύνθεσης",
  live: "Ζωντανά",
  complete: "Ολοκληρώθηκε",
  declined: "Απορρίφθηκε",
  cancelled: "Ακυρώθηκε",
};
const STATUS_TINT: Record<string, string> = {
  pending: "text-amber-300 bg-amber-400/10 ring-amber-400/20",
  building: "text-sky-300 bg-sky-400/10 ring-sky-400/20",
  live: "text-rose-300 bg-rose-500/15 ring-rose-500/30 animate-pulse",
  complete: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/20",
  declined: "text-slate-400 bg-white/5 ring-white/10",
  cancelled: "text-slate-400 bg-white/5 ring-white/10",
};

export function FriendlyLobby() {
  const router = useRouter();
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [oppId, setOppId] = useState("");
  const [mode, setMode] = useState<"score" | "fantasy">("score");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/friendly", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setOpponents(d.opponents ?? []);
      setMatches(d.matches ?? []);
      setLoaded(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const challenge = async () => {
    if (!oppId) {
      setErr("Διάλεξε αντίπαλο.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/friendly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opponentId: oppId, mode }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "Σφάλμα.");
      router.push(`/friendly/${d.id}`);
    } catch (e: any) {
      setErr(e?.message ?? "Σφάλμα.");
      setBusy(false);
    }
  };

  const act = async (id: string, action: "accept" | "decline") => {
    await fetch(`/api/friendly/${id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (action === "accept") router.push(`/friendly/${id}`);
    else load();
  };

  const incoming = matches.filter((m) => m.role === "opponent" && m.status === "pending");
  const active = matches.filter((m) => m.status === "building" || m.status === "live");
  const history = matches.filter((m) => ["complete", "declined", "cancelled"].includes(m.status));
  const outgoing = matches.filter((m) => m.role === "challenger" && m.status === "pending");

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
      {/* Challenge card */}
      <div className="card card-pad h-fit">
        <div className="mb-3 flex items-center gap-2">
          <Swords size={18} className="text-brand-400" />
          <h2 className="text-sm font-bold text-white">Νέα πρόκληση</h2>
        </div>

        <label className="section-title mb-1 block">Αντίπαλος</label>
        <select className="input mb-3 w-full" value={oppId} onChange={(e) => setOppId(e.target.value)}>
          <option value="">— Διάλεξε παίκτη —</option>
          {opponents.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>

        <label className="section-title mb-1 block">Τρόπος νίκης</label>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("score")}
            className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
              mode === "score"
                ? "border-brand-500/50 bg-brand-500/15 text-white"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            <div className="font-bold">🏀 Σκορ αγώνα</div>
            <div className="mt-0.5 text-[11px] text-slate-400">Νικά το καλύτερο τελικό σκορ</div>
          </button>
          <button
            type="button"
            onClick={() => setMode("fantasy")}
            className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
              mode === "fantasy"
                ? "border-brand-500/50 bg-brand-500/15 text-white"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            <div className="font-bold">📊 Fantasy πόντοι</div>
            <div className="mt-0.5 text-[11px] text-slate-400">Νικά το μεγαλύτερο σύνολο PIR</div>
          </button>
        </div>

        {err && <div className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{err}</div>}

        <button className="btn-primary w-full" onClick={challenge} disabled={busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Swords size={16} />}
          Στείλε πρόκληση
        </button>
      </div>

      {/* Match lists */}
      <div className="flex flex-col gap-5">
        {incoming.length > 0 && (
          <Section title="Προκλήσεις προς εσένα">
            {incoming.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-white">{m.opponentName}</div>
                  <div className="text-[11px] text-slate-400">
                    {m.mode === "fantasy" ? "Fantasy πόντοι" : "Σκορ αγώνα"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => act(m.id, "accept")}>
                    <Check size={14} /> Δέξου
                  </button>
                  <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => act(m.id, "decline")}>
                    <X size={14} /> Άρνηση
                  </button>
                </div>
              </div>
            ))}
          </Section>
        )}

        {active.length > 0 && (
          <Section title="Σε εξέλιξη">
            {active.map((m) => (
              <MatchLink key={m.id} m={m} />
            ))}
          </Section>
        )}

        {outgoing.length > 0 && (
          <Section title="Οι προκλήσεις σου">
            {outgoing.map((m) => (
              <MatchLink key={m.id} m={m} />
            ))}
          </Section>
        )}

        {history.length > 0 && (
          <Section title="Ιστορικό">
            {history.map((m) => (
              <MatchLink key={m.id} m={m} />
            ))}
          </Section>
        )}

        {loaded && matches.length === 0 && (
          <div className="card card-pad text-center text-sm text-slate-400">
            Δεν υπάρχουν φιλικά ακόμα. Στείλε την πρώτη σου πρόκληση!
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="section-title mb-2">{title}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function MatchLink({ m }: { m: MatchRow }) {
  const clickable = m.status === "building" || m.status === "live" || m.status === "complete" || m.status === "pending";
  const inner = (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 transition hover:bg-white/[0.05]">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-slate-400">
          {m.status === "complete" ? (
            <Trophy size={16} className={m.iWon ? "text-amber-400" : "text-slate-500"} />
          ) : m.status === "live" ? (
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
          ) : (
            <Clock size={16} />
          )}
        </div>
        <div>
          <div className="text-sm font-semibold text-white">
            vs {m.opponentName}
            {m.status === "complete" && m.iWon != null && (
              <span className={`ml-2 text-xs font-bold ${m.iWon ? "text-emerald-400" : "text-rose-400"}`}>
                {m.iWon ? "ΝΙΚΗ" : "ΗΤΤΑ"}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400">{m.mode === "fantasy" ? "Fantasy πόντοι" : "Σκορ αγώνα"}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`chip ring-1 ${STATUS_TINT[m.status] ?? "text-slate-400 bg-white/5 ring-white/10"}`}>
          {STATUS_LABEL[m.status] ?? m.status}
        </span>
        {clickable && <ChevronRight size={16} className="text-slate-500" />}
      </div>
    </div>
  );
  return clickable ? <Link href={`/friendly/${m.id}`}>{inner}</Link> : inner;
}
