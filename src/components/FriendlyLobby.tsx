"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Swords, Loader2, Check, X, Clock, Trophy, ChevronRight } from "lucide-react";

interface OppTeam {
  participantId: string;
  teamName: string;
  userId: string;
  userName: string;
}
interface Room {
  roomId: string;
  roomName: string;
  myParticipantId: string;
  myTeamName: string;
  opponents: OppTeam[];
}
interface MatchRow {
  id: string;
  mode: string;
  status: string;
  role: "challenger" | "opponent";
  opponentName: string;
  opponentTeam: string | null;
  myTeam: string | null;
  roomName: string | null;
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
  const [rooms, setRooms] = useState<Room[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [roomId, setRoomId] = useState("");
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
      setRooms(d.rooms ?? []);
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

  const selectedRoom = useMemo(() => rooms.find((r) => r.roomId === roomId), [rooms, roomId]);

  // Keep opponent selection valid when the room changes.
  useEffect(() => {
    if (selectedRoom && !selectedRoom.opponents.some((o) => o.participantId === oppId)) {
      setOppId(selectedRoom.opponents.length === 1 ? selectedRoom.opponents[0].participantId : "");
    }
  }, [selectedRoom, oppId]);

  const challenge = async () => {
    if (!roomId) return setErr("Διάλεξε room.");
    if (!oppId) return setErr("Διάλεξε αντίπαλο.");
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/friendly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, opponentParticipantId: oppId, mode }),
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
  const outgoing = matches.filter((m) => m.role === "challenger" && m.status === "pending");
  const history = matches.filter((m) => ["complete", "declined", "cancelled"].includes(m.status));

  const noRooms = loaded && rooms.length === 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
      {/* Challenge card */}
      <div className="card card-pad h-fit">
        <div className="mb-3 flex items-center gap-2">
          <Swords size={18} className="text-brand-400" />
          <h2 className="text-sm font-bold text-white">Νέα πρόκληση</h2>
        </div>

        {noRooms ? (
          <div className="rounded-lg bg-white/[0.03] px-3 py-4 text-sm text-slate-400">
            Δεν έχεις ολοκληρωμένη ομάδα σε draft room με άλλον χρήστη-αντίπαλο.
            <Link href="/draft" className="mt-2 block text-brand-400 hover:underline">
              → Πήγαινε στο Draft Mode
            </Link>
          </div>
        ) : (
          <>
            <label className="section-title mb-1 block">Room / η ομάδα σου</label>
            <select className="input mb-3 w-full" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">— Διάλεξε room —</option>
              {rooms.map((r) => (
                <option key={r.roomId} value={r.roomId}>
                  {r.roomName} · {r.myTeamName}
                </option>
              ))}
            </select>

            <label className="section-title mb-1 block">Αντίπαλος</label>
            <select
              className="input mb-3 w-full disabled:opacity-40"
              value={oppId}
              disabled={!selectedRoom}
              onChange={(e) => setOppId(e.target.value)}
            >
              <option value="">— Διάλεξε ομάδα αντιπάλου —</option>
              {selectedRoom?.opponents.map((o) => (
                <option key={o.participantId} value={o.participantId}>
                  {o.teamName} ({o.userName})
                </option>
              ))}
            </select>

            <label className="section-title mb-1 block">Τρόπος νίκης</label>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <ModeBtn active={mode === "score"} onClick={() => setMode("score")} title="🏀 Σκορ αγώνα" sub="Νικά το καλύτερο τελικό σκορ" />
              <ModeBtn active={mode === "fantasy"} onClick={() => setMode("fantasy")} title="📊 Fantasy πόντοι" sub="Νικά το μεγαλύτερο σύνολο PIR" />
            </div>

            {err && <div className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{err}</div>}

            <button className="btn-primary w-full" onClick={challenge} disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Swords size={16} />}
              Στείλε πρόκληση
            </button>
          </>
        )}
      </div>

      {/* Match lists */}
      <div className="flex flex-col gap-5">
        {incoming.length > 0 && (
          <Section title="Προκλήσεις προς εσένα">
            {incoming.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-white">
                    {m.opponentTeam ?? m.opponentName} <span className="text-slate-400">({m.opponentName})</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {m.roomName ? `${m.roomName} · ` : ""}
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
            Δεν υπάρχουν φιλικά ακόμα. {noRooms ? "Χρειάζεσαι πρώτα μια ομάδα από draft." : "Στείλε την πρώτη σου πρόκληση!"}
          </div>
        )}
      </div>
    </div>
  );
}

function ModeBtn({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
        active ? "border-brand-500/50 bg-brand-500/15 text-white" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
      }`}
    >
      <div className="font-bold">{title}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>
    </button>
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
            {m.myTeam ?? "Η ομάδα σου"} <span className="text-slate-500">vs</span> {m.opponentTeam ?? m.opponentName}
            {m.status === "complete" && m.iWon != null && (
              <span className={`ml-2 text-xs font-bold ${m.iWon ? "text-emerald-400" : "text-rose-400"}`}>
                {m.iWon ? "ΝΙΚΗ" : "ΗΤΤΑ"}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400">
            {m.roomName ? `${m.roomName} · ` : ""}
            {m.mode === "fantasy" ? "Fantasy πόντοι" : "Σκορ αγώνα"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`chip ring-1 ${STATUS_TINT[m.status] ?? "text-slate-400 bg-white/5 ring-white/10"}`}>
          {STATUS_LABEL[m.status] ?? m.status}
        </span>
        <ChevronRight size={16} className="text-slate-500" />
      </div>
    </div>
  );
  return <Link href={`/friendly/${m.id}`}>{inner}</Link>;
}
