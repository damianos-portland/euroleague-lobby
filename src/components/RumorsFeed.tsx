"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
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

function relTime(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export function RumorsFeed({ items, teams }: { items: RumorRow[]; teams: string[] }) {
  const [kind, setKind] = useState<string>("all");
  const [team, setTeam] = useState<string>("all");

  const filtered = items.filter(
    (i) =>
      (kind === "all" || i.kind === kind) &&
      (team === "all" || i.teamCodes.includes(team))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {["all", "official", "rumor", "news"].map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={clsx(
              "btn !px-3 !py-1.5 font-mono text-xs",
              kind === k ? "bg-brand-500/20 text-brand-400 ring-1 ring-brand-500/40" : "btn-ghost"
            )}
          >
            {k.toUpperCase()}
          </button>
        ))}
        <select value={team} onChange={(e) => setTeam(e.target.value)} className="input ml-auto font-mono text-xs">
          <option value="all">ΟΛΕΣ ΟΙ ΟΜΑΔΕΣ</option>
          {teams.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <ul className="space-y-2">
        {filtered.length === 0 && (
          <li className="card card-pad text-sm text-slate-500">
            Κανένα item — το feed ανανεώνεται καθημερινά στις 06:00 UTC.
          </li>
        )}
        {filtered.map((i) => (
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
    </div>
  );
}
