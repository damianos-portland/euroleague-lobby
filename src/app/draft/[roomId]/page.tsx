"use client";

import { useCallbackRef } from "@/components/useCallbackRef";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { PageHeader } from "@/components/PageHeader";
import { PosBadge, RecBadge } from "@/components/ui";
import { advise, AdviceKind, DraftablePlayer, gradeRoster } from "@/lib/draft";
import { POSITIONS, Position } from "@/lib/types";
import {
  Play, Pause, RotateCcw, Zap, ListPlus, ArrowLeft, Search, Trophy,
} from "lucide-react";

type State = any; // shape from loadDraftState

const LENSES: { key: AdviceKind; label: string }[] = [
  { key: "best", label: "Best Available" },
  { key: "fit", label: "Best Fit" },
  { key: "upside", label: "Highest Upside" },
  { key: "safe", label: "Safe Pick" },
  { key: "avoid", label: "Avoid" },
];

export default function DraftRoomPage({ params }: { params: { roomId: string } }) {
  const roomId = params.roomId;
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [lens, setLens] = useState<AdviceKind>("best");
  const [q, setQ] = useState("");
  const [posFilter, setPosFilter] = useState<string>("ALL");
  const [notes, setNotes] = useState("");
  const actingRef = useRef(false);

  const refresh = useCallbackRef(async () => {
    const res = await fetch(`/api/draft/${roomId}`);
    const data = await res.json();
    if (data.state) setState(data.state);
  });

  async function act(body: Record<string, any>) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/draft/${roomId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) console.warn(data.error);
      if (data.state) setState(data.state);
    } finally {
      setBusy(false);
    }
  }

  // Initial load + polling for sync.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [refresh]);

  const you = useMemo(
    () => state?.participants.find((p: any) => !p.isAutopick) ?? state?.participants[0] ?? null,
    [state]
  );
  const onClockId = state?.onTheClock?.id;
  const onClockParticipant = state?.participants.find((p: any) => p.id === onClockId) ?? null;
  const yourTurn = onClockId && you && onClockId === you.id;

  // CPU auto-advance: when a bot is on the clock, pick automatically.
  useEffect(() => {
    if (!state || state.complete || state.room.status !== "drafting") return;
    if (!onClockParticipant) return;
    if (onClockParticipant.isAutopick && !actingRef.current) {
      actingRef.current = true;
      const t = setTimeout(async () => {
        await act({ action: "autopick" });
        actingRef.current = false;
      }, 1100);
      return () => { clearTimeout(t); actingRef.current = false; };
    }
  }, [state, onClockParticipant]);

  const available: DraftablePlayer[] = state?.available ?? [];
  const yourPositions: Position[] = (you?.roster ?? []).map((r: DraftablePlayer) => r.position);

  const ranked = useMemo(() => {
    if (!state) return [];
    const list = advise(available, yourPositions, state.room.rosterSlots, lens, 200);
    return list.filter(
      (p) =>
        (posFilter === "ALL" || p.position === posFilter) &&
        (!q || p.name.toLowerCase().includes(q.toLowerCase()))
    );
  }, [state, available, lens, posFilter, q, yourPositions]);

  if (!state) {
    return <div className="py-20 text-center text-slate-400">Φόρτωση draft room…</div>;
  }

  const { room } = state;
  const drafting = room.status === "drafting";

  return (
    <>
      <Link href="/draft" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
        <ArrowLeft size={15} /> Draft Lobby
      </Link>

      {/* Control bar */}
      <div className="card card-pad mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-white">{room.name}</h1>
            <span className="chip bg-white/5 capitalize text-slate-300">{room.status}</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Snake draft · {state.participants.length} ομάδες · {room.rounds} γύροι
          </div>
        </div>

        {/* On the clock */}
        {!state.complete ? (
          <div className="flex items-center gap-4">
            <div className={clsx("rounded-2xl border px-4 py-2", yourTurn ? "border-brand-500/40 bg-brand-500/10 animate-pulseRing" : "border-white/10 bg-white/[0.03]")}>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">On the clock — R{state.round}.{state.pickInRound}</div>
              <div className="font-bold text-white">{state.onTheClock?.teamName ?? "—"} {yourTurn && <span className="text-brand-400">(εσύ)</span>}</div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 font-bold text-emerald-300">
            <Trophy size={16} className="mr-1 inline" /> Draft Complete
          </div>
        )}

        {/* Admin controls */}
        <div className="flex flex-wrap items-center gap-2">
          {room.status === "lobby" && <button className="btn-primary" onClick={() => act({ action: "start" })}><Play size={15} /> Start</button>}
          {drafting && <button className="btn-ghost" onClick={() => act({ action: "pause" })}><Pause size={15} /> Pause</button>}
          {room.status === "paused" && <button className="btn-primary" onClick={() => act({ action: "resume" })}><Play size={15} /> Resume</button>}
          {!state.complete && drafting && <button className="btn-ghost" onClick={() => act({ action: "autopick" })}><Zap size={15} /> Auto-pick</button>}
          <button className="btn-ghost" onClick={() => act({ action: "undo" })} title="Admin undo"><RotateCcw size={15} /> Undo</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Available players + advice */}
        <section className="card card-pad xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-white">Διαθέσιμοι παίκτες ({available.length})</h2>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input className="input py-1.5 pl-8 text-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <select className="input py-1.5 text-xs" value={posFilter} onChange={(e) => setPosFilter(e.target.value)}>
                <option value="ALL" className="bg-ink-850">Όλες θέσεις</option>
                {POSITIONS.map((p) => <option key={p} value={p} className="bg-ink-850">{p}</option>)}
              </select>
            </div>
          </div>

          {/* Lens tabs */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {LENSES.map((l) => (
              <button
                key={l.key}
                onClick={() => setLens(l.key)}
                className={clsx("chip transition", lens === l.key ? "bg-brand-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10")}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full min-w-[560px]">
              <thead className="sticky top-0 bg-ink-850">
                <tr className="border-b border-white/5">
                  <th className="th">Player</th><th className="th">Pos</th><th className="th">Team</th>
                  <th className="th text-right">Price</th><th className="th text-right">Proj FP</th>
                  <th className="th">Rec</th><th className="th text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((p) => {
                  const inQueue = (you?.queue ?? []).some((qp: DraftablePlayer) => qp.id === p.id);
                  return (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="td"><Link href={`/players/${p.id}`} className="font-semibold text-white hover:text-brand-400">{p.name}</Link></td>
                      <td className="td"><PosBadge pos={p.position} /></td>
                      <td className="td text-slate-400">{p.teamShort ?? "FA"}</td>
                      <td className="td text-right stat">{p.fantasyPrice.toFixed(1)}</td>
                      <td className="td text-right stat font-bold text-white">{p.projFantasyPoints.toFixed(1)}</td>
                      <td className="td"><RecBadge rec={p.recommendation} /></td>
                      <td className="td text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            className="btn-ghost !px-2 !py-1"
                            title="Add to queue"
                            onClick={() => act({ action: inQueue ? "queueRemove" : "queueAdd", participantId: you?.id, playerId: p.id })}
                          >
                            <ListPlus size={14} className={inQueue ? "text-brand-400" : ""} />
                          </button>
                          <button
                            className="btn-primary !px-2.5 !py-1 text-xs disabled:opacity-40"
                            disabled={!drafting || !yourTurn || busy}
                            onClick={() => act({ action: "pick", playerId: p.id })}
                          >
                            Draft
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {ranked.length === 0 && <tr><td className="td text-slate-500" colSpan={7}>—</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* Your roster + queue + notes */}
        <div className="space-y-5">
          <section className="card card-pad">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Το roster σου</h2>
              <span className="chip bg-white/5 text-slate-300">Grade {you?.grade.grade}</span>
            </div>
            <RosterNeeds participant={you} />
            <ul className="mt-3 space-y-1.5">
              {(you?.roster ?? []).map((p: DraftablePlayer, i: number) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                  <span className="flex items-center gap-2 text-sm text-white"><PosBadge pos={p.position} /> {p.name}</span>
                  <span className="stat text-xs text-slate-400">{p.projFantasyPoints.toFixed(0)} FP</span>
                </li>
              ))}
              {(you?.roster ?? []).length === 0 && <li className="text-sm text-slate-500">Άδειο — κάνε το πρώτο σου pick.</li>}
            </ul>
          </section>

          {(you?.queue ?? []).length > 0 && (
            <section className="card card-pad">
              <h2 className="mb-2 text-sm font-bold text-white">Queue σου</h2>
              <ul className="space-y-1.5">
                {you.queue.map((p: DraftablePlayer) => (
                  <li key={p.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-sm">
                    <span className="text-white">{p.name}</span>
                    <button className="text-xs text-rose-400 hover:underline" onClick={() => act({ action: "queueRemove", participantId: you.id, playerId: p.id })}>remove</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card card-pad">
            <h2 className="mb-2 text-sm font-bold text-white">Notes</h2>
            <textarea className="input min-h-[90px] w-full text-sm" placeholder="Draft notes / στρατηγική…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </section>
        </div>
      </div>

      {/* Draft board */}
      <section className="card mt-5 overflow-x-auto p-4">
        <h2 className="mb-3 text-sm font-bold text-white">Draft Board</h2>
        <DraftBoard state={state} youId={you?.id} />
      </section>

      {/* Post-draft grades + comparison */}
      <section className="card card-pad mt-5">
        <h2 className="mb-3 text-sm font-bold text-white">{state.complete ? "Post-Draft Grades & σύγκριση" : "Live Standings (projected)"}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...state.participants]
            .sort((a: any, b: any) => b.grade.score - a.grade.score)
            .map((p: any, i: number) => (
              <div key={p.id} className={clsx("rounded-xl border p-3", p.id === you?.id ? "border-brand-500/40 bg-brand-500/[0.06]" : "border-white/5 bg-white/[0.02]")}>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">#{i + 1} {p.teamName}</span>
                  <span className="text-lg font-black text-brand-400">{p.grade.grade}</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {p.roster.length} παίκτες · {p.roster.reduce((a: number, r: DraftablePlayer) => a + r.projFantasyPoints, 0).toFixed(0)} proj FP
                </div>
                {p.missingRequired.length > 0 && (
                  <div className="mt-1 text-[11px] text-rose-400">Λείπουν: {p.missingRequired.join(", ")}</div>
                )}
              </div>
            ))}
        </div>
      </section>
    </>
  );
}

function RosterNeeds({ participant }: { participant: any }) {
  if (!participant) return null;
  const missing: string[] = participant.missingRequired ?? [];
  if (missing.length === 0) {
    return <div className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">✓ Καλυμμένες οι βασικές θέσεις.</div>;
  }
  return (
    <div className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300">
      ⚠ Ελλείψεις θέσεων: <span className="font-semibold">{missing.join(", ")}</span>
    </div>
  );
}

function DraftBoard({ state, youId }: { state: any; youId?: string }) {
  const parts = state.participants;
  const rounds = state.room.rounds;
  // pick lookup by overall.
  const byOverall = new Map<number, any>();
  for (const pk of state.picks) byOverall.set(pk.overall, pk);
  const n = parts.length;

  return (
    <table className="w-full min-w-[700px] border-separate border-spacing-1">
      <thead>
        <tr>
          <th className="th w-10">R</th>
          {parts.map((p: any) => (
            <th key={p.id} className={clsx("th text-center", p.id === youId && "text-brand-400")}>{p.teamName}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rounds }).map((_, r) => (
          <tr key={r}>
            <td className="td text-center text-slate-500">{r + 1}</td>
            {parts.map((_: any, col: number) => {
              // snake: even round left-to-right, odd reversed
              const orderIdx = r % 2 === 0 ? col : n - 1 - col;
              const overall = r * n + col;
              const part = parts.find((p: any) => p.draftOrder === orderIdx);
              const pick = byOverall.get(overall);
              const isCurrent = overall === state.room.currentPickIndex && !state.complete;
              return (
                <td key={col} className={clsx(
                  "rounded-lg px-2 py-1.5 text-center text-[11px]",
                  isCurrent ? "bg-brand-500/20 ring-1 ring-brand-500/40" : pick ? "bg-white/[0.04]" : "bg-white/[0.015]",
                  part?.id === youId && "outline outline-1 outline-brand-500/20"
                )}>
                  {pick ? (
                    <div>
                      <div className="truncate font-semibold text-white">{pick.player.name.split(" ").slice(-1)[0]}</div>
                      <div className="text-slate-500">{pick.player.position}{pick.auto ? " ·A" : ""}</div>
                    </div>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
