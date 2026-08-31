"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { Dice5, Trash2 } from "lucide-react";

interface Room { id: string; name: string; status: string; rounds: number; participants: number }

const TONE: Record<string, string> = {
  lottery: "bg-brand-500/15 text-brand-300",
  lobby: "bg-sky-500/15 text-sky-300",
  drafting: "bg-emerald-500/15 text-emerald-300",
  paused: "bg-amber-500/15 text-amber-300",
  complete: "bg-slate-500/15 text-slate-300",
};

export function LotteryRoomList({ rooms }: { rooms: Room[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function del(id: string, name: string) {
    if (!confirm(`Διαγραφή room "${name}"; (μη αναστρέψιμο)`)) return;
    setBusyId(id);
    try {
      await fetch(`/api/draft/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (rooms.length === 0) return <p className="text-sm text-slate-500">Καμία ακόμη.</p>;

  return (
    <div className="space-y-3">
      {rooms.map((r) => (
        <div key={r.id} className="card card-pad flex items-center justify-between gap-3">
          <Link
            href={r.status === "lottery" ? `/draft/lottery/${r.id}` : `/draft/${r.id}`}
            className="min-w-0 flex-1"
          >
            <div className="flex items-center gap-2">
              <span className="truncate font-bold text-white">{r.name}</span>
              <span className={clsx("chip shrink-0", TONE[r.status] ?? "bg-white/5 text-slate-300")}>{r.status}</span>
            </div>
            <div className="mt-1 text-xs text-slate-400">{r.participants} ομάδες · {r.rounds} γύροι</div>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={r.status === "lottery" ? `/draft/lottery/${r.id}` : `/draft/${r.id}`}
              className="btn-ghost !px-2.5 !py-1.5 text-xs"
            >
              {r.status === "lottery" ? <><Dice5 size={14} /> Κλήρωση</> : "Άνοιγμα →"}
            </Link>
            <button
              onClick={() => del(r.id, r.name)}
              disabled={busyId === r.id}
              className="rounded-lg p-2 text-rose-400 transition hover:bg-rose-500/10 hover:text-rose-300"
              title="Διαγραφή room"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
