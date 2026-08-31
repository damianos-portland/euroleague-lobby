"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { ConfidenceBadge } from "@/components/desk";

export interface RumorRow {
  id: string;
  url: string;
  source: string;
  title: string;
  publishedAt: string; // ISO
  kind: string;
  confidence: number;
  teamCodes: string[];
  player: { id: string; name: string } | null;
}

const PAGE_SIZE = 15;

function relTime(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export function RumorsFeed({ items, teams, isAdmin }: { items: RumorRow[]; teams: string[]; isAdmin?: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<string>("all");
  const [team, setTeam] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function refreshNews() {
    setRefreshing(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/fetch-news", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNote(`+${data?.stored ?? 0} νέα (από ${data?.fetched ?? 0})`);
        router.refresh();
      } else {
        setNote(data?.error ?? "Σφάλμα ανανέωσης.");
      }
    } finally {
      setRefreshing(false);
    }
  }

  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (kind === "all" || i.kind === kind) &&
          (team === "all" || i.teamCodes.includes(team))
      ),
    [items, kind, team]
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1); // clamp when filters shrink the list
  const pageItems = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  // Reset to the first page whenever a filter changes.
  function changeKind(k: string) {
    setKind(k);
    setPage(0);
  }
  function changeTeam(t: string) {
    setTeam(t);
    setPage(0);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {["all", "official", "rumor", "news"].map((k) => (
          <button
            key={k}
            onClick={() => changeKind(k)}
            className={clsx(
              "btn !px-3 !py-1.5 font-mono text-xs",
              kind === k ? "bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/40" : "btn-ghost"
            )}
          >
            {k.toUpperCase()}
          </button>
        ))}
        <select
          value={team}
          onChange={(e) => changeTeam(e.target.value)}
          className={clsx("input font-mono text-xs", isAdmin ? "" : "ml-auto")}
        >
          <option value="all">ΟΛΕΣ ΟΙ ΟΜΑΔΕΣ</option>
          {teams.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {isAdmin && (
          <button
            onClick={refreshNews}
            disabled={refreshing}
            className="btn-primary ml-auto !px-3 !py-1.5 text-xs"
            title="Τράβα φρέσκα νέα από τα feeds"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Ανανέωση…" : "Φέρε φρέσκα νέα"}
          </button>
        )}
      </div>
      {note && <p className="font-mono text-[11px] text-brand-400">{note}</p>}

      <ul className="space-y-2">
        {filtered.length === 0 && (
          <li className="card card-pad text-sm text-slate-500">
            Κανένα item — το feed ανανεώνεται καθημερινά στις 06:00 UTC.
          </li>
        )}
        {pageItems.map((i) => (
          <li key={i.id} className={clsx("card px-4 py-3", i.kind === "rumor" && "tint-amber")}>
            <div className="flex items-start justify-between gap-3">
              <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-white hover:text-brand-400">
                {i.title}
              </a>
              <ConfidenceBadge kind={i.kind} confidence={i.confidence} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-500">
              <span>{i.source}</span>
              <span>· {relTime(i.publishedAt)}</span>
              {i.teamCodes.map((t) => (
                <span key={t} className="chip bg-white/5 text-slate-300">{t}</span>
              ))}
              {i.player && (
                <Link href={`/players/${i.player.id}`} className="chip bg-sky-500/10 text-sky-300 hover:bg-sky-500/20">
                  {i.player.name} →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-1">
          <span className="font-mono text-[11px] text-slate-500">
            {current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, filtered.length)} από {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="btn-ghost !px-2 !py-1 text-xs"
              disabled={current === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft size={14} /> Προηγ.
            </button>
            <span className="font-mono text-[11px] text-slate-400">
              {current + 1} / {pageCount}
            </span>
            <button
              className="btn-ghost !px-2 !py-1 text-xs"
              disabled={current >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Επόμ. <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
