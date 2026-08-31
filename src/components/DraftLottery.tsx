"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Dice5, Eye, RotateCcw, Trophy, Sparkles } from "lucide-react";

interface Participant { id: string; teamName: string; weight: number; draftOrder: number }
interface RoomState {
  id: string;
  name: string;
  status: string;
  lotteryRevealed: number;
  drawn: boolean;
  participants: Participant[];
}

export function DraftLottery({ initial, isAdmin }: { initial: RoomState; isAdmin: boolean }) {
  const [room, setRoom] = useState<RoomState>(initial);
  const [busy, setBusy] = useState(false);
  const lastRevealed = useRef(initial.lotteryRevealed);

  const n = room.participants.length;
  const byPick = new Map(room.participants.map((p) => [p.draftOrder, p]));

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/draft/lottery/${room.id}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setRoom(data.room);
    }
  }, [room.id]);

  // Poll so the group can watch the reveal live on their own screens.
  useEffect(() => {
    if (room.status === "lobby") return;
    const t = setInterval(refresh, 1600);
    return () => clearInterval(t);
  }, [refresh, room.status]);

  useEffect(() => {
    lastRevealed.current = room.lotteryRevealed;
  }, [room.lotteryRevealed]);

  async function act(action: string) {
    setBusy(true);
    try {
      await fetch(`/api/draft/lottery/${room.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const fullyRevealed = room.drawn && room.lotteryRevealed >= n;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="text-center">
        <div className="mb-1 font-mono text-[11px] font-semibold tracking-wider text-brand-400">
          <Sparkles className="mr-1 inline" size={12} /> DRAFT LOTTERY
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">{room.name}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {!room.drawn
            ? `${n} ομάδες — έτοιμες για κλήρωση`
            : fullyRevealed
            ? "Η σειρά επιλογής κληρώθηκε ✓"
            : `Αποκάλυψη ${room.lotteryRevealed}/${n} — από το τελευταίο pick προς το #1`}
        </p>
      </div>

      {/* Board: pick #1 at top … #N at bottom. Revealed from the bottom up. */}
      <div className="card card-pad space-y-1.5">
        {Array.from({ length: n }, (_, pos) => {
          const revealed = room.drawn && pos >= n - room.lotteryRevealed;
          const p = byPick.get(pos);
          const isFirst = pos === 0;
          const justRevealed = pos === n - room.lotteryRevealed; // top-most revealed row
          return (
            <div
              key={pos}
              className={clsx(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition",
                revealed
                  ? isFirst
                    ? "border-brand-500/40 bg-brand-500/10"
                    : "border-white/5 bg-white/[0.03]"
                  : "border-white/5 bg-white/[0.015]",
                justRevealed && "ring-1 ring-brand-500/40"
              )}
            >
              <span
                className={clsx(
                  "stat grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold",
                  isFirst ? "bg-brand-500/20 text-brand-300" : "bg-white/5 text-slate-300"
                )}
              >
                {pos + 1}
              </span>
              <span className="flex-1 truncate text-sm font-semibold">
                {revealed ? (
                  <span className="text-white">{p?.teamName ?? "—"}</span>
                ) : (
                  <span className="font-mono tracking-widest text-slate-600">? ? ?</span>
                )}
              </span>
              {isFirst && revealed && <Trophy size={15} className="text-brand-400" />}
              {revealed && n > 2 && (
                <span className="stat text-[10px] text-slate-500">{p?.weight ?? 1} tix</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Admin controls */}
      {isAdmin && !fullyRevealed && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {!room.drawn ? (
            <button className="btn-primary" onClick={() => act("run")} disabled={busy}>
              <Dice5 size={16} /> Κλήρωσε σειρά
            </button>
          ) : (
            <>
              <button className="btn-primary" onClick={() => act("revealNext")} disabled={busy}>
                <Eye size={16} /> Αποκάλυψη #{n - room.lotteryRevealed}
              </button>
              <button className="btn-ghost" onClick={() => act("reset")} disabled={busy}>
                <RotateCcw size={15} /> Reset
              </button>
            </>
          )}
        </div>
      )}

      {isAdmin && fullyRevealed && room.status !== "lobby" && (
        <div className="flex justify-center">
          <button className="btn-primary" onClick={() => act("finish")} disabled={busy}>
            <Trophy size={16} /> Κλείδωσε & πήγαινε στο Draft
          </button>
        </div>
      )}

      {room.status === "lobby" && (
        <div className="flex justify-center">
          <Link href={`/draft/${room.id}`} className="btn-primary">
            <Trophy size={16} /> Άνοιγμα Draft Room →
          </Link>
        </div>
      )}

      {!isAdmin && !fullyRevealed && (
        <p className="text-center text-xs text-slate-500">Ο admin τρέχει την κλήρωση — παρακολούθησε live.</p>
      )}
    </div>
  );
}
