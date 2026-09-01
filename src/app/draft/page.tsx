"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Plus, Trophy, Users, Trash2 } from "lucide-react";

interface RoomRow {
  id: string;
  name: string;
  status: string;
  rounds: number;
  mine?: boolean;
  _count: { participants: number; picks: number };
}

export default function DraftLobbyPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [name, setName] = useState("My EuroLeague League");
  const [rounds, setRounds] = useState(10);
  const [teamsText, setTeamsText] = useState("You, CPU Bartzokas, CPU Ataman, CPU Obradović, CPU Messina, CPU Spanoulis");
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch("/api/draft");
    const data = await res.json();
    setRooms(data.rooms ?? []);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    const teamNames = teamsText.split(",").map((t) => t.trim()).filter(Boolean);
    if (teamNames.length < 2) return alert("Χρειάζονται τουλάχιστον 2 ομάδες.");
    setCreating(true);
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, rounds, teamNames }),
      });
      const data = await res.json();
      if (data.roomId) router.push(`/draft/${data.roomId}`);
    } finally {
      setCreating(false);
    }
  }

  const mineRooms = rooms.filter((r) => r.mine);

  const statusTone: Record<string, string> = {
    lobby: "bg-sky-500/15 text-sky-300",
    drafting: "bg-emerald-500/15 text-emerald-300 animate-pulse",
    paused: "bg-amber-500/15 text-amber-300",
    complete: "bg-slate-500/15 text-slate-300",
  };

  return (
    <>
      <PageHeader
        title="Draft Mode 2026"
        subtitle="Στήσε snake draft room, κλήρωσε σειρά επιλογής και τρέξε live draft με auto-pick, queue, best-available & post-draft grades."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Create */}
        <section className="card card-pad lg:col-span-1">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
            <Plus size={16} className="text-brand-400" /> Νέο Draft Room
          </h2>
          <div className="space-y-3">
            <Field label="Όνομα league">
              <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Γύροι (rounds)">
              <input type="number" min={3} max={15} className="input w-full" value={rounds} onChange={(e) => setRounds(+e.target.value)} />
            </Field>
            <Field label="Ομάδες / users (χωρισμένα με κόμμα — η 1η είσαι εσύ)">
              <textarea className="input min-h-[80px] w-full" value={teamsText} onChange={(e) => setTeamsText(e.target.value)} />
            </Field>
            <button className="btn-primary w-full" onClick={create} disabled={creating}>
              <Trophy size={16} /> {creating ? "Δημιουργία…" : "Δημιουργία & κλήρωση σειράς"}
            </button>
          </div>
        </section>

        {/* Existing rooms */}
        <section className="lg:col-span-2 space-y-5">
          {mineRooms.length > 0 && (
            <div className="space-y-3">
              <h2 className="section-title">Τα rooms μου</h2>
              {mineRooms.map((r) => (
                <RoomCard key={r.id} room={r} statusTone={statusTone} />
              ))}
            </div>
          )}

          <div className="space-y-3">
            <h2 className="section-title">{mineRooms.length > 0 ? "Όλα τα draft rooms" : "Draft Rooms"}</h2>
            {rooms.length === 0 && <p className="text-sm text-slate-500">Κανένα room ακόμη — φτιάξε ένα.</p>}
            {rooms.map((r) => (
              <RoomCard key={r.id} room={r} statusTone={statusTone} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function RoomCard({ room: r, statusTone }: { room: RoomRow; statusTone: Record<string, string> }) {
  return (
    <Link href={`/draft/${r.id}`} className="card card-pad flex items-center justify-between transition hover:ring-1 hover:ring-brand-500/30">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-white">{r.name}</span>
          <span className={`chip ${statusTone[r.status] ?? "bg-white/5 text-slate-300"}`}>{r.status}</span>
          {r.mine && <span className="chip bg-brand-500/15 text-brand-300">🏀 δικό σου</span>}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1"><Users size={12} /> {r._count.participants} ομάδες</span>
          <span>{r.rounds} γύροι</span>
          <span>{r._count.picks} picks</span>
        </div>
      </div>
      <span className="btn-ghost">Άνοιγμα →</span>
    </Link>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-slate-400">{label}</span>
      {children}
    </label>
  );
}
