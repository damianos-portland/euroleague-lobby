"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { PlayerDTO } from "@/lib/queries";
import { POSITIONS } from "@/lib/types";
import { PosBadge, RecBadge } from "@/components/ui";
import { RefreshCw, Save, Trash2, Upload, UserPlus, Search, Newspaper, CalendarClock, ShieldCheck, ShieldOff } from "lucide-react";

interface TeamLite { id: string; shortName: string; name: string }
interface RoomLite { id: string; name: string; status: string }

const STATUSES = ["signed", "rumored", "free_agent", "injured", "departing"];
const ROLES = ["starter", "rotation", "bench", "deep_bench", "unknown"];

interface UserLite { id: string; email: string; name: string; role: string }

export function AdminPanel({
  initialPlayers,
  teams,
  rooms,
  users,
  currentUserId,
}: {
  initialPlayers: PlayerDTO[];
  teams: TeamLite[];
  rooms: RoomLite[];
  users: UserLite[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [players] = useState(initialPlayers);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<PlayerDTO | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [recalcing, setRecalcing] = useState(false);
  const [fetchingNews, setFetchingNews] = useState(false);
  const [openingSeason, setOpeningSeason] = useState(false);

  const filtered = useMemo(
    () => players.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 60),
    [players, q]
  );

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function recalc() {
    setRecalcing(true);
    try {
      const res = await fetch("/api/admin/recalc", { method: "POST" });
      const data = await res.json();
      flash(`Recomputed ${data.recomputed} projections.`);
      router.refresh();
    } finally {
      setRecalcing(false);
    }
  }

  async function fetchNews() {
    setFetchingNews(true);
    try {
      const res = await fetch("/api/admin/fetch-news", { method: "POST" });
      const data = await res.json();
      flash(`Φρέσκα νέα: ${data.stored ?? 0} νέα items (από ${data.fetched ?? 0}).`);
      router.refresh();
    } finally {
      setFetchingNews(false);
    }
  }

  async function openSeason() {
    if (!confirm("Άνοιγμα νέας σεζόν: ξαναχτίζει το roster των παικτών από τα νέα ρόστερ (returning κρατούν περσινά stats, newcomers = unproven, όσοι έφυγαν = departed). Συνέχεια;")) return;
    setOpeningSeason(true);
    try {
      const res = await fetch("/api/admin/open-season", { method: "POST" });
      const data = await res.json();
      flash(`Σεζόν ${data.season}: ${data.returning} returning · ${data.unproven} unproven · ${data.departed} departed.`);
      router.refresh();
    } finally {
      setOpeningSeason(false);
    }
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed right-4 top-4 z-50 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm text-emerald-200 shadow-glow">
          {toast}
        </div>
      )}

      {/* Top actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={recalc} disabled={recalcing}>
          <RefreshCw size={16} className={recalcing ? "animate-spin" : ""} /> Recalculate projections
        </button>
        <span className="text-xs text-slate-400">
          Τρέχει ξανά projection + value engine για όλους τους παίκτες με βάση τα τρέχοντα δεδομένα.
        </span>

        <button className="btn-ghost" onClick={fetchNews} disabled={fetchingNews}>
          <Newspaper size={16} className={fetchingNews ? "animate-spin" : ""} /> Φέρε φρέσκα νέα
        </button>
        <span className="text-xs text-slate-400">
          Τραβάει τώρα τα τελευταία νέα από τις πηγές (Eurohoops GR/EN, TalkBasket).
        </span>

        <button className="btn-ghost !text-brand-300" onClick={openSeason} disabled={openingSeason}>
          <CalendarClock size={16} className={openingSeason ? "animate-spin" : ""} /> Άνοιγμα σεζόν 2026-27
        </button>
        <span className="text-xs text-slate-400">
          Ξαναχτίζει το roster των παικτών από τα νέα ρόστερ (returning + unproven newcomers· departed όσοι έφυγαν).
        </span>
      </div>

      <UsersSection users={users} currentUserId={currentUserId} onFlash={flash} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Player list + edit */}
        <section className="card card-pad lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Players</h2>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input className="input py-1.5 pl-8 text-xs" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full min-w-[520px]">
              <thead className="sticky top-0 bg-ink-850">
                <tr className="border-b border-white/5">
                  <th className="th">Player</th><th className="th">Pos</th><th className="th">Team</th>
                  <th className="th text-right">Price</th><th className="th">Rec</th><th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="td font-semibold text-white">{p.name}</td>
                    <td className="td"><PosBadge pos={p.position} /></td>
                    <td className="td text-slate-400">{p.teamShort ?? "FA"}</td>
                    <td className="td text-right stat">{p.fantasyPrice.toFixed(1)}</td>
                    <td className="td"><RecBadge rec={p.proj?.recommendation} /></td>
                    <td className="td text-right">
                      <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEditing(p)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Side: editor / add / import / rooms */}
        <div className="space-y-5">
          {editing ? (
            <PlayerEditor
              player={editing}
              teams={teams}
              onClose={() => setEditing(null)}
              onSaved={(msg) => { flash(msg); router.refresh(); }}
            />
          ) : (
            <AddPlayer teams={teams} onAdded={(msg) => { flash(msg); router.refresh(); }} />
          )}

          <ImportBox onDone={(msg) => { flash(msg); router.refresh(); }} />

          <section className="card card-pad">
            <h2 className="mb-3 text-sm font-bold text-white">Draft rooms</h2>
            <ul className="space-y-2">
              {rooms.length === 0 && <li className="text-sm text-slate-500">—</li>}
              {rooms.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
                  <span className="text-sm text-white">{r.name} <span className="text-xs text-slate-500">({r.status})</span></span>
                  <button
                    className="text-rose-400 hover:text-rose-300"
                    onClick={async () => {
                      if (!confirm("Διαγραφή room;")) return;
                      await fetch(`/api/draft/${r.id}`, { method: "DELETE" });
                      flash("Room deleted."); router.refresh();
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function PlayerEditor({
  player, teams, onClose, onSaved,
}: {
  player: PlayerDTO; teams: TeamLite[]; onClose: () => void; onSaved: (m: string) => void;
}) {
  const [teamId, setTeamId] = useState(player.teamId ?? "");
  const [status, setStatus] = useState(player.status);
  const [depthRole, setDepthRole] = useState(player.depthRole);
  const [price, setPrice] = useState(player.fantasyPrice);
  const [tags, setTags] = useState(player.tags.join(", "));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/admin/players/${player.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, status, depthRole, fantasyPrice: price, tags: tags.split(",").map((t) => t.trim()).filter(Boolean).join(",") }),
      });
      // Recompute so projection reflects new team/role immediately.
      await fetch("/api/admin/recalc", { method: "POST" });
      onSaved(`Saved ${player.name}.`);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card card-pad">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Edit — {player.name}</h2>
        <button className="text-xs text-slate-400 hover:text-white" onClick={onClose}>✕</button>
      </div>
      <div className="space-y-3">
        <L label="Ομάδα">
          <select className="input w-full" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="" className="bg-ink-850">Free agent</option>
            {teams.map((t) => <option key={t.id} value={t.id} className="bg-ink-850">{t.name}</option>)}
          </select>
        </L>
        <div className="grid grid-cols-2 gap-3">
          <L label="Status">
            <select className="input w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s} className="bg-ink-850">{s}</option>)}
            </select>
          </L>
          <L label="Depth role">
            <select className="input w-full" value={depthRole} onChange={(e) => setDepthRole(e.target.value)}>
              {ROLES.map((s) => <option key={s} value={s} className="bg-ink-850">{s}</option>)}
            </select>
          </L>
        </div>
        <L label={`Fantasy price: ${price.toFixed(1)}`}>
          <input type="range" min={1} max={12} step={0.5} value={price} onChange={(e) => setPrice(+e.target.value)} className="w-full accent-brand-500" />
        </L>
        <L label="Tags (comma)">
          <input className="input w-full" value={tags} onChange={(e) => setTags(e.target.value)} />
        </L>
        <button className="btn-primary w-full" onClick={save} disabled={saving}>
          <Save size={15} /> {saving ? "Saving…" : "Save + recalc"}
        </button>
      </div>
    </section>
  );
}

function AddPlayer({ teams, onAdded }: { teams: TeamLite[]; onAdded: (m: string) => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [position, setPosition] = useState("SG");
  const [teamId, setTeamId] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!firstName || !lastName) return;
    setSaving(true);
    try {
      await fetch("/api/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, position, teamId: teamId || null }),
      });
      onAdded(`Added ${firstName} ${lastName}.`);
      setFirstName(""); setLastName("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card card-pad">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white"><UserPlus size={16} className="text-brand-400" /> Add player</h2>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input className="input w-full" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <input className="input w-full" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select className="input w-full" value={position} onChange={(e) => setPosition(e.target.value)}>
            {POSITIONS.map((p) => <option key={p} value={p} className="bg-ink-850">{p}</option>)}
          </select>
          <select className="input w-full" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="" className="bg-ink-850">Free agent</option>
            {teams.map((t) => <option key={t.id} value={t.id} className="bg-ink-850">{t.shortName}</option>)}
          </select>
        </div>
        <button className="btn-primary w-full" onClick={add} disabled={saving}>Add</button>
      </div>
    </section>
  );
}

function ImportBox({ onDone }: { onDone: (m: string) => void }) {
  const [format, setFormat] = useState<"json" | "csv">("csv");
  const [payload, setPayload] = useState(
    "firstName,lastName,position,teamShort,age,fantasyPrice,season,minutes,points,rebounds,assists,steals,blocks,turnovers,usage,pir\nLuca,Vildoza,PG,RMB,29,6.5,2024-25,20,8.0,1.8,3.4,1.0,0.1,1.2,18,9.0"
  );
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, payload }),
      });
      const data = await res.json();
      if (data.error) onDone("Error: " + data.error);
      else onDone(`Imported: ${data.created} new, ${data.updated} updated, ${data.stats} stat lines.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card card-pad">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white"><Upload size={16} className="text-brand-400" /> Import CSV / JSON</h2>
      <div className="mb-2 flex gap-1.5">
        {(["csv", "json"] as const).map((f) => (
          <button key={f} className={`chip ${format === f ? "bg-brand-500 text-white" : "bg-white/5 text-slate-300"}`} onClick={() => setFormat(f)}>{f.toUpperCase()}</button>
        ))}
      </div>
      <textarea className="input min-h-[120px] w-full font-mono text-[11px]" value={payload} onChange={(e) => setPayload(e.target.value)} />
      <button className="btn-primary mt-2 w-full" onClick={run} disabled={busy}>{busy ? "Importing…" : "Import"}</button>
    </section>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

// --- Users & roles management ---------------------------------------------
function UsersSection({
  users,
  currentUserId,
  onFlash,
}: {
  users: { id: string; email: string; name: string; role: string }[];
  currentUserId: string;
  onFlash: (msg: string) => void;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setRole(userId: string, role: "admin" | "user") {
    setBusyId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        onFlash(data?.error ?? "Σφάλμα.");
        return;
      }
      onFlash(`Ο ρόλος ενημερώθηκε σε ${role}.`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card card-pad">
      <h2 className="mb-3 text-sm font-bold text-white">Users &amp; roles ({users.length})</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="border-b border-white/5">
              <th className="th">Name</th>
              <th className="th">Email</th>
              <th className="th">Role</th>
              <th className="th text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isAdmin = u.role === "admin";
              const self = u.id === currentUserId;
              return (
                <tr key={u.id} className="border-b border-white/5">
                  <td className="td font-semibold text-white">
                    {u.name} {self && <span className="text-[10px] text-slate-500">(εσύ)</span>}
                  </td>
                  <td className="td font-mono text-xs text-slate-400">{u.email}</td>
                  <td className="td">
                    <span className={clsx("chip font-mono", isAdmin ? "bg-brand-500/15 text-brand-300" : "bg-white/5 text-slate-300")}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="td text-right">
                    {isAdmin ? (
                      <button
                        className="btn-ghost !px-2 !py-1 text-xs"
                        disabled={busyId === u.id || self}
                        title={self ? "Δεν μπορείς να αφαιρέσεις τον δικό σου ρόλο" : "Υποβίβαση σε user"}
                        onClick={() => setRole(u.id, "user")}
                      >
                        <ShieldOff size={14} /> Make user
                      </button>
                    ) : (
                      <button
                        className="btn-ghost !px-2 !py-1 text-xs"
                        disabled={busyId === u.id}
                        onClick={() => setRole(u.id, "admin")}
                      >
                        <ShieldCheck size={14} /> Make admin
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
