"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import clsx from "clsx";
import { Dice5, Trash2, Users, ChevronDown } from "lucide-react";

interface Slot { id: string; teamName: string; userId: string | null; draftOrder: number }
interface Room { id: string; name: string; status: string; rounds: number; participants: Slot[] }
interface UserLite { id: string; name: string; email: string }

const TONE: Record<string, string> = {
  lottery: "bg-brand-500/15 text-brand-300",
  lobby: "bg-sky-500/15 text-sky-300",
  drafting: "bg-emerald-500/15 text-emerald-300",
  paused: "bg-amber-500/15 text-amber-300",
  complete: "bg-slate-500/15 text-slate-300",
};

export function LotteryRoomList({ rooms, users }: { rooms: Room[]; users: UserLite[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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

  async function assign(roomId: string, participantId: string, userId: string) {
    setNote(null);
    const res = await fetch(`/api/draft/${roomId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, userId: userId || null }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setNote(d?.error ?? "Σφάλμα ανάθεσης.");
    }
  }

  function userLabel(u: UserLite) {
    return u.name ? `${u.name} (${u.email})` : u.email;
  }

  if (rooms.length === 0) return <p className="text-sm text-slate-500">Καμία ακόμη.</p>;

  return (
    <div className="space-y-3">
      {note && <p className="text-xs text-rose-400">{note}</p>}
      {rooms.map((r) => {
        const assigned = r.participants.filter((p) => p.userId).length;
        const open = openId === r.id;
        return (
          <div key={r.id} className="card card-pad">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={r.status === "lottery" ? `/draft/lottery/${r.id}` : `/draft/${r.id}`}
                className="min-w-0 flex-1"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate font-bold text-white">{r.name}</span>
                  <span className={clsx("chip shrink-0", TONE[r.status] ?? "bg-white/5 text-slate-300")}>{r.status}</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {r.participants.length} ομάδες · {r.rounds} γύροι · {assigned} με χρήστη
                </div>
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => setOpenId(open ? null : r.id)}
                  className={clsx(
                    "btn-ghost !px-2.5 !py-1.5 text-xs",
                    open && "bg-brand-500/15 text-brand-300"
                  )}
                  title="Ανάθεση χρηστών"
                >
                  <Users size={14} /> Χρήστες
                  <ChevronDown size={13} className={clsx("transition", open && "rotate-180")} />
                </button>
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

            {open && (
              <div className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
                {r.participants
                  .slice()
                  .sort((a, b) => (a.draftOrder < 0 ? 999 : a.draftOrder) - (b.draftOrder < 0 ? 999 : b.draftOrder))
                  .map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-center font-mono text-[11px] text-slate-500">
                        {p.draftOrder >= 0 ? p.draftOrder + 1 : "—"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-200">{p.teamName}</span>
                      <select
                        value={p.userId ?? ""}
                        onChange={(e) => assign(r.id, p.id, e.target.value)}
                        className="input max-w-[220px] flex-1 text-xs"
                      >
                        <option value="">— CPU / άδειο —</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{userLabel(u)}</option>
                        ))}
                      </select>
                    </div>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
