"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Loader2, Check, X, Swords, Trophy, Crown, Star, Clock, Users,
} from "lucide-react";

// ---- shapes mirrored from the server (lib/friendlyServer, lib/friendly) ----
type Bucket = "G" | "F" | "C";
interface PoolPlayer {
  id: string;
  name: string;
  position: string;
  bucket: Bucket;
  teamShort: string | null;
  projFantasyPoints: number;
}
interface LineupJSON {
  starters: string[];
  bench: string[];
}
interface TimelineEvent {
  offsetMs: number;
  clock: string;
  side: "home" | "away";
  playerId: string;
  kind: string;
  pts: number;
  homeScore: number;
  awayScore: number;
  text: string;
}
interface BoxLine {
  playerId: string;
  name: string;
  side: "home" | "away";
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  fp: number;
}
interface MatchTimeline {
  durationMs: number;
  events: TimelineEvent[];
  final: { home: number; away: number };
  fp: { home: number; away: number };
  box: BoxLine[];
  mvpPlayerId: string | null;
}
interface MatchView {
  id: string;
  mode: string;
  status: string;
  role: "challenger" | "opponent";
  me: { id: string; name: string; ready: boolean; lineup: LineupJSON | null };
  them: { id: string; name: string; ready: boolean; hasLineup: boolean };
  startedAt: string | null;
  durationMs: number;
  timeline: MatchTimeline | null;
  sides: { challengerId: string; opponentId: string } | null;
  result: {
    challengerScore: number | null;
    opponentScore: number | null;
    challengerFp: number | null;
    opponentFp: number | null;
    winnerId: string | null;
    mvpPlayerId: string | null;
  } | null;
}

const STARTER_QUOTA: Record<Bucket, number> = { G: 2, F: 2, C: 1 };
const BUCKET_LABEL: Record<Bucket, string> = { G: "Guards", F: "Forwards", C: "Centers" };

export function FriendlyMatchRoom({ matchId }: { matchId: string }) {
  const [view, setView] = useState<MatchView | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/friendly/${matchId}`, { cache: "no-store" });
    if (r.status === 404) {
      setNotFound(true);
      return;
    }
    if (!r.ok) return;
    setView(await r.json());
  }, [matchId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while waiting for the opponent / for tip-off. Stop once complete.
  useEffect(() => {
    if (!view) return;
    if (view.status === "complete" || view.status === "declined" || view.status === "cancelled") return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [view, load]);

  if (notFound) {
    return (
      <Shell>
        <div className="card card-pad text-center text-sm text-slate-400">
          Το φιλικό δεν βρέθηκε ή δεν έχεις πρόσβαση.
        </div>
      </Shell>
    );
  }
  if (!view) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="animate-spin" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {view.status === "pending" && <PendingView view={view} reload={load} />}
      {view.status === "building" && <BuildingView view={view} reload={load} />}
      {(view.status === "live" || view.status === "complete") && <GameView view={view} reload={load} />}
      {(view.status === "declined" || view.status === "cancelled") && (
        <div className="card card-pad text-center text-sm text-slate-400">
          Το φιλικό {view.status === "declined" ? "απορρίφθηκε" : "ακυρώθηκε"}.
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Link href="/friendly" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft size={15} /> Πίσω στα Φιλικά
      </Link>
      {children}
    </>
  );
}

async function postAction(matchId: string, action: string, lineup?: LineupJSON) {
  const r = await fetch(`/api/friendly/${matchId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, lineup }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error ?? "Σφάλμα.");
  return d as MatchView;
}

// ---------------------------------------------------------------- PENDING ----
function PendingView({ view, reload }: { view: MatchView; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const isOpponent = view.role === "opponent";

  const act = async (action: "accept" | "decline" | "cancel") => {
    setBusy(true);
    try {
      await postAction(view.id, action);
    } finally {
      reload();
      setBusy(false);
    }
  };

  return (
    <div className="card card-pad mx-auto max-w-md text-center">
      <Swords size={30} className="mx-auto mb-3 text-brand-400" />
      <h2 className="text-lg font-bold text-white">
        {isOpponent ? `${view.them.name} σε προκαλεί!` : `Πρόκληση προς ${view.them.name}`}
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Τρόπος νίκης: {view.mode === "fantasy" ? "Fantasy πόντοι (PIR)" : "Σκορ αγώνα"}
      </p>
      {isOpponent ? (
        <div className="mt-5 flex justify-center gap-3">
          <button className="btn-primary" disabled={busy} onClick={() => act("accept")}>
            <Check size={16} /> Δέξου την πρόκληση
          </button>
          <button className="btn-ghost" disabled={busy} onClick={() => act("decline")}>
            <X size={16} /> Άρνηση
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-400">
            <Loader2 size={15} className="animate-spin" /> Αναμονή αποδοχής…
          </div>
          <button className="btn-ghost mx-auto mt-4" disabled={busy} onClick={() => act("cancel")}>
            <X size={15} /> Ακύρωση πρόκλησης
          </button>
        </>
      )}
    </div>
  );
}

// --------------------------------------------------------------- BUILDING ----
function BuildingView({ view, reload }: { view: MatchView; reload: () => void }) {
  const [pool, setPool] = useState<PoolPlayer[]>([]);
  const [starters, setStarters] = useState<string[]>(view.me.lineup?.starters ?? []);
  const [bench, setBench] = useState<string[]>(view.me.lineup?.bench ?? []);
  const [tab, setTab] = useState<Bucket>("G");
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedLineup, setSavedLineup] = useState(!!view.me.lineup);
  const locked = view.me.ready;

  useEffect(() => {
    fetch("/api/friendly/pool", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPool(d.pool ?? []))
      .catch(() => {});
  }, []);

  const byId = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);
  const chosen = useMemo(() => new Set([...starters, ...bench]), [starters, bench]);
  const starterCounts = useMemo(() => {
    const c: Record<Bucket, number> = { G: 0, F: 0, C: 0 };
    for (const id of starters) {
      const b = byId.get(id)?.bucket;
      if (b) c[b]++;
    }
    return c;
  }, [starters, byId]);

  const valid =
    starters.length === 5 &&
    bench.length === 5 &&
    starterCounts.G === 2 &&
    starterCounts.F === 2 &&
    starterCounts.C === 1;

  const addPlayer = (p: PoolPlayer) => {
    if (locked || chosen.has(p.id)) return;
    setSavedLineup(false);
    // Prefer a starter slot of this bucket, else bench.
    if (starterCounts[p.bucket] < STARTER_QUOTA[p.bucket] && starters.length < 5) {
      setStarters((s) => [...s, p.id]);
    } else if (bench.length < 5) {
      setBench((b) => [...b, p.id]);
    } else {
      setErr("Η σύνθεση είναι γεμάτη — αφαίρεσε κάποιον πρώτα.");
    }
  };
  const remove = (id: string) => {
    if (locked) return;
    setSavedLineup(false);
    setStarters((s) => s.filter((x) => x !== id));
    setBench((b) => b.filter((x) => x !== id));
  };
  const toBench = (id: string) => {
    if (locked || bench.length >= 5) return;
    setSavedLineup(false);
    setStarters((s) => s.filter((x) => x !== id));
    setBench((b) => [...b, id]);
  };
  const toStarter = (id: string) => {
    if (locked) return;
    const b = byId.get(id)?.bucket;
    if (!b || starterCounts[b] >= STARTER_QUOTA[b] || starters.length >= 5) {
      setErr(`Δεν χωράει άλλος ${b ?? ""} βασικός.`);
      return;
    }
    setSavedLineup(false);
    setBench((x) => x.filter((y) => y !== id));
    setStarters((s) => [...s, id]);
  };

  const save = async () => {
    setErr(null);
    setSaving(true);
    try {
      await postAction(view.id, "setLineup", { starters, bench });
      setSavedLineup(true);
    } catch (e: any) {
      setErr(e?.message ?? "Σφάλμα.");
    } finally {
      setSaving(false);
    }
  };
  const ready = async () => {
    setErr(null);
    setSaving(true);
    try {
      if (!savedLineup) await postAction(view.id, "setLineup", { starters, bench });
      await postAction(view.id, "ready");
      reload();
    } catch (e: any) {
      setErr(e?.message ?? "Σφάλμα.");
    } finally {
      setSaving(false);
    }
  };

  const filtered = pool.filter(
    (p) => p.bucket === tab && (!q || p.name.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Στήσε τη σύνθεσή σου</h2>
          <p className="text-sm text-slate-400">
            2 Guards · 2 Forwards · 1 Center + 5 στον πάγκο · vs {view.them.name}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Users size={14} />
          {view.them.name}: {view.them.ready ? <span className="text-emerald-400">έτοιμος ✓</span> : view.them.hasLineup ? "έφτιαξε σύνθεση" : "στήνει…"}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,360px)]">
        {/* Player pool */}
        <div className="card card-pad">
          <div className="mb-3 flex items-center gap-2">
            {(["G", "F", "C"] as Bucket[]).map((b) => (
              <button
                key={b}
                onClick={() => setTab(b)}
                className={`chip ring-1 ${
                  tab === b ? "bg-brand-500/15 text-white ring-brand-500/30" : "bg-white/5 text-slate-400 ring-white/10"
                }`}
              >
                {BUCKET_LABEL[b]} · {starterCounts[b]}/{STARTER_QUOTA[b]}
              </button>
            ))}
            <input
              className="input ml-auto w-36"
              placeholder="Αναζήτηση…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="max-h-[460px] overflow-y-auto pr-1">
            {pool.length === 0 && <div className="py-10 text-center text-slate-500"><Loader2 className="mx-auto animate-spin" /></div>}
            {filtered.map((p) => {
              const picked = chosen.has(p.id);
              return (
                <button
                  key={p.id}
                  disabled={locked || picked}
                  onClick={() => addPlayer(p)}
                  className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                    picked ? "cursor-default bg-brand-500/10 text-slate-500" : "bg-white/[0.03] text-slate-200 hover:bg-white/[0.07]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-[10px] text-slate-500">{p.teamShort ?? "—"} · {p.position}</span>
                  </span>
                  <span className="stat text-xs text-slate-400">{p.projFantasyPoints.toFixed(1)} FP</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* My lineup */}
        <div className="card card-pad h-fit">
          <div className="section-title mb-2">Βασική πεντάδα</div>
          <div className="mb-3 flex flex-col gap-1.5">
            {(["G", "G", "F", "F", "C"] as Bucket[]).map((slot, i) => {
              // Fill slots by bucket in order.
              const idsOfBucket = starters.filter((id) => byId.get(id)?.bucket === slot);
              const slotIndexInBucket = (["G", "G", "F", "F", "C"] as Bucket[]).slice(0, i).filter((s) => s === slot).length;
              const id = idsOfBucket[slotIndexInBucket];
              const p = id ? byId.get(id) : null;
              return (
                <LineupSlot
                  key={i}
                  label={BUCKET_LABEL[slot]}
                  player={p ?? null}
                  onRemove={id ? () => remove(id) : undefined}
                  onBench={id ? () => toBench(id) : undefined}
                  locked={locked}
                />
              );
            })}
          </div>
          <div className="section-title mb-2 mt-4">Πάγκος ({bench.length}/5)</div>
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => {
              const id = bench[i];
              const p = id ? byId.get(id) : null;
              return (
                <LineupSlot
                  key={i}
                  label="Πάγκος"
                  player={p ?? null}
                  onRemove={id ? () => remove(id) : undefined}
                  onStart={id ? () => toStarter(id) : undefined}
                  locked={locked}
                />
              );
            })}
          </div>

          {err && <div className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{err}</div>}

          {locked ? (
            <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 py-2.5 text-sm text-emerald-300">
              <Check size={16} /> Είσαι έτοιμος — αναμονή αντιπάλου…
            </div>
          ) : (
            <div className="mt-4 flex gap-2">
              <button className="btn-ghost flex-1" disabled={!valid || saving || savedLineup} onClick={save}>
                {savedLineup ? "Αποθηκεύτηκε ✓" : "Αποθήκευση"}
              </button>
              <button className="btn-primary flex-1" disabled={!valid || saving} onClick={ready}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Έτοιμος
              </button>
            </div>
          )}
          {!valid && !locked && (
            <p className="mt-2 text-center text-[11px] text-slate-500">
              Συμπλήρωσε 2G / 2F / 1C βασικούς και 5 πάγκο.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function LineupSlot({
  label, player, onRemove, onBench, onStart, locked,
}: {
  label: string;
  player: PoolPlayer | null;
  onRemove?: () => void;
  onBench?: () => void;
  onStart?: () => void;
  locked: boolean;
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
      player ? "border-white/10 bg-white/[0.04]" : "border-dashed border-white/10 bg-transparent"
    }`}>
      {player ? (
        <>
          <span className="flex items-center gap-2 truncate">
            <span className="w-16 shrink-0 text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
            <span className="truncate font-medium text-slate-100">{player.name}</span>
          </span>
          {!locked && (
            <span className="flex shrink-0 items-center gap-1.5">
              {onStart && <button onClick={onStart} title="Στη πεντάδα" className="text-[10px] text-emerald-400 hover:text-emerald-300">▲ βασικός</button>}
              {onBench && <button onClick={onBench} title="Στον πάγκο" className="text-[10px] text-sky-400 hover:text-sky-300">▼ πάγκος</button>}
              <button onClick={onRemove} className="text-slate-500 hover:text-rose-400"><X size={13} /></button>
            </span>
          )}
        </>
      ) : (
        <span className="text-[11px] uppercase tracking-wide text-slate-600">{label} — κενό</span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- GAME ----
function GameView({ view, reload }: { view: MatchView; reload: () => void }) {
  const tl = view.timeline;
  const startMs = view.startedAt ? new Date(view.startedAt).getTime() : 0;
  const [elapsed, setElapsed] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!startMs) return;
    const tick = () => setElapsed(Date.now() - startMs);
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [startMs]);

  const duration = tl?.durationMs ?? view.durationMs;
  const finished = view.status === "complete" || elapsed >= duration;

  // When playback wraps up, flip the server to complete.
  useEffect(() => {
    if (finished && view.status === "live") reload();
  }, [finished, view.status, reload]);

  const visible = useMemo(() => {
    if (!tl) return [];
    if (finished) return tl.events;
    return tl.events.filter((e) => e.offsetMs <= elapsed);
  }, [tl, elapsed, finished]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [visible.length]);

  if (!tl) {
    return <div className="card card-pad text-center text-slate-400"><Loader2 className="mx-auto animate-spin" /></div>;
  }

  const last = visible[visible.length - 1];
  const homeScore = finished ? tl.final.home : last?.homeScore ?? 0;
  const awayScore = finished ? tl.final.away : last?.awayScore ?? 0;
  const clock = finished ? "ΤΕΛΙΚΟ" : last?.clock ?? "Q1 10:00";

  const isChal = view.role === "challenger";
  const homeName = isChal ? view.me.name : view.them.name;
  const awayName = isChal ? view.them.name : view.me.name;
  const homeIsMe = isChal;

  const progress = Math.min(100, (elapsed / duration) * 100);
  const winnerId = view.result?.winnerId ?? null;
  const iWon = finished && winnerId != null ? winnerId === view.me.id : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Scoreboard */}
      <div className="card overflow-hidden">
        <div className="flex items-stretch">
          <TeamScore name={homeName} score={homeScore} isMe={homeIsMe} align="left" />
          <div className="flex flex-col items-center justify-center gap-1 px-4 py-5">
            <div className={`chip ring-1 ${finished ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20" : "bg-rose-500/15 text-rose-300 ring-rose-500/30"}`}>
              {finished ? <><Trophy size={12} /> Τελικό</> : <><span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-rose-500" /> {clock}</>}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-widest text-slate-500">
              {view.mode === "fantasy" ? "Fantasy μάχη" : "Φιλικός αγώνας"}
            </div>
          </div>
          <TeamScore name={awayName} score={awayScore} isMe={!homeIsMe} align="right" />
        </div>
        {/* fantasy tally */}
        <div className="grid grid-cols-2 border-t border-white/5 text-center text-xs">
          <div className={`py-1.5 ${view.mode === "fantasy" ? "text-slate-200" : "text-slate-500"}`}>
            {view.mode === "fantasy" && "🏆 "}{(finished ? tl.fp.home : sumFp(tl, visible, "home")).toFixed(1)} FP
          </div>
          <div className={`border-l border-white/5 py-1.5 ${view.mode === "fantasy" ? "text-slate-200" : "text-slate-500"}`}>
            {(finished ? tl.fp.away : sumFp(tl, visible, "away")).toFixed(1)} FP
          </div>
        </div>
        {!finished && (
          <div className="h-1 bg-white/5">
            <div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {finished && (
        <div className={`card card-pad flex items-center justify-center gap-3 text-center ${
          iWon ? "tint-green" : iWon === false ? "border-rose-400/20 bg-rose-500/[0.06]" : ""
        }`}>
          <Crown size={22} className={iWon ? "text-amber-400" : "text-slate-400"} />
          <div>
            <div className="text-lg font-extrabold text-white">
              {winnerId == null ? "Ισοπαλία!" : iWon ? "Νίκησες! 🎉" : "Ήττα"}
            </div>
            <div className="text-xs text-slate-400">
              {view.mode === "fantasy"
                ? "Κρίθηκε στους fantasy πόντους (PIR)"
                : "Κρίθηκε στο τελικό σκορ"}
              {tl.mvpPlayerId && <> · MVP: {tl.box.find((b) => b.playerId === tl.mvpPlayerId)?.name ?? "—"}</>}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Play-by-play */}
        <div className="card card-pad">
          <div className="section-title mb-2 flex items-center gap-2"><Clock size={13} /> Ρεπορτάζ αγώνα</div>
          <div ref={feedRef} className="flex max-h-[420px] flex-col gap-1 overflow-y-auto pr-1">
            {[...visible].reverse().slice(0, 120).map((e, i) => (
              <FeedLine key={visible.length - i} e={e} homeName={homeName} awayName={awayName} />
            ))}
            {visible.length === 0 && <div className="py-6 text-center text-sm text-slate-500">Τζάμπολ…</div>}
          </div>
        </div>

        {/* Box score (revealed as scoring accrues; full at end) */}
        <div className="card card-pad">
          <div className="section-title mb-2 flex items-center gap-2"><Star size={13} /> Στατιστικά</div>
          <BoxTable tl={tl} side="home" name={homeName} mvpId={tl.mvpPlayerId} />
          <div className="my-3 border-t border-white/5" />
          <BoxTable tl={tl} side="away" name={awayName} mvpId={tl.mvpPlayerId} />
        </div>
      </div>
    </div>
  );
}

function sumFp(tl: MatchTimeline, visible: TimelineEvent[], side: "home" | "away"): number {
  // Approximate running FP for the side from visible scoring only (display).
  // The authoritative total comes from tl.fp once finished.
  const ids = new Set(tl.box.filter((b) => b.side === side).map((b) => b.playerId));
  let fp = 0;
  for (const e of visible) {
    if (!ids.has(e.playerId)) continue;
    if (e.kind === "make2" || e.kind === "make3" || e.kind === "ft") fp += e.pts;
    else if (e.kind === "block" || e.kind === "steal" || e.kind === "rebound") fp += 1;
    else if (e.kind === "turnover") fp -= 1;
    else if (e.kind === "miss") fp -= 1;
  }
  return Math.max(0, fp);
}

function TeamScore({ name, score, isMe, align }: { name: string; score: number; isMe: boolean; align: "left" | "right" }) {
  return (
    <div className={`flex-1 px-4 py-5 ${align === "right" ? "text-right" : "text-left"}`}>
      <div className="flex items-center gap-2" style={{ justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        <span className="truncate text-sm font-semibold text-slate-200">{name}</span>
        {isMe && <span className="chip bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30">εσύ</span>}
      </div>
      <div className="stat mt-1 text-4xl font-black text-white sm:text-5xl">{score}</div>
    </div>
  );
}

function FeedLine({ e, homeName, awayName }: { e: TimelineEvent; homeName: string; awayName: string }) {
  const scoring = e.kind === "make2" || e.kind === "make3";
  const teamName = e.side === "home" ? homeName : awayName;
  return (
    <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${scoring ? "bg-white/[0.04]" : ""}`}>
      <span className="stat w-14 shrink-0 text-[10px] text-slate-500">{e.clock}</span>
      <span className={`w-10 shrink-0 text-[10px] font-bold ${e.side === "home" ? "text-brand-300" : "text-sky-300"}`}>
        {teamName.slice(0, 3).toUpperCase()}
      </span>
      <span className={`flex-1 ${scoring ? "font-medium text-slate-100" : "text-slate-400"}`}>{e.text}</span>
      {scoring && <span className="stat shrink-0 text-[10px] text-emerald-400">+{e.pts}</span>}
    </div>
  );
}

function BoxTable({ tl, side, name, mvpId }: { tl: MatchTimeline; side: "home" | "away"; name: string; mvpId: string | null }) {
  const rows = tl.box.filter((b) => b.side === side).sort((a, b) => b.fp - a.fp);
  return (
    <div>
      <div className="mb-1 text-xs font-bold text-slate-300">{name}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="py-1 text-left font-semibold">Παίκτης</th>
              <th className="py-1 text-right font-semibold">Π</th>
              <th className="py-1 text-right font-semibold">Ρ</th>
              <th className="py-1 text-right font-semibold">Α</th>
              <th className="py-1 text-right font-semibold">FP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.playerId} className="border-t border-white/[0.04]">
                <td className="py-1 text-left text-slate-300">
                  {b.playerId === mvpId && <Crown size={11} className="mr-1 inline text-amber-400" />}
                  {b.name}
                </td>
                <td className="stat py-1 text-right text-slate-200">{b.pts}</td>
                <td className="stat py-1 text-right text-slate-400">{b.reb}</td>
                <td className="stat py-1 text-right text-slate-400">{b.ast}</td>
                <td className="stat py-1 text-right font-semibold text-brand-300">{b.fp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
