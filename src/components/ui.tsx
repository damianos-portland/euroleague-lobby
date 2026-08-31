// Small shared presentational primitives: badges, bars, sparkline, etc.
import clsx from "clsx";
import { ReactNode } from "react";

const REC_STYLES: Record<string, { label: string; cls: string }> = {
  premium_pick: { label: "PREMIUM", cls: "bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/30" },
  value_pick: { label: "VALUE", cls: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30" },
  watchlist: { label: "WATCH", cls: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30" },
  avoid: { label: "AVOID", cls: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30" },
};

export function RecBadge({ rec }: { rec?: string | null }) {
  const s = REC_STYLES[rec ?? ""] ?? { label: rec ?? "—", cls: "bg-white/5 text-slate-300" };
  return <span className={clsx("chip", s.cls)}>{s.label}</span>;
}

const SIGNAL_STYLES: Record<string, string> = {
  buy: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20",
  sell: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20",
  hold: "bg-slate-500/15 text-slate-300 ring-1 ring-slate-400/20",
};
export function SignalBadge({ signal }: { signal?: string | null }) {
  return (
    <span className={clsx("chip font-mono", SIGNAL_STYLES[signal ?? "hold"])}>
      {(signal ?? "hold").toUpperCase()}
    </span>
  );
}

const POS_STYLES: Record<string, string> = {
  PG: "bg-sky-500/15 text-sky-300",
  SG: "bg-cyan-500/15 text-cyan-300",
  SF: "bg-emerald-500/15 text-emerald-300",
  PF: "bg-amber-500/15 text-amber-300",
  C: "bg-rose-500/15 text-rose-300",
};
export function PosBadge({ pos }: { pos: string }) {
  return <span className={clsx("chip font-bold", POS_STYLES[pos] ?? "bg-white/10 text-slate-200")}>{pos}</span>;
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  signed: { label: "Signed", cls: "bg-emerald-500/10 text-emerald-300" },
  rumored: { label: "Rumored", cls: "bg-amber-500/10 text-amber-300" },
  free_agent: { label: "Free Agent", cls: "bg-rose-500/10 text-rose-300" },
  injured: { label: "Injured", cls: "bg-rose-500/15 text-rose-300" },
  departing: { label: "Departing", cls: "bg-slate-500/10 text-slate-300" },
  unproven: { label: "NEW · Unproven", cls: "bg-sky-500/15 text-sky-300" },
  departed: { label: "Departed", cls: "bg-slate-500/15 text-slate-400" },
};
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { label: status, cls: "bg-white/5 text-slate-300" };
  return <span className={clsx("chip", s.cls)}>{s.label}</span>;
}

export function RiskBadge({ level }: { level: "low" | "medium" | "high" }) {
  const map = {
    low: "bg-emerald-500/15 text-emerald-300",
    medium: "bg-amber-500/15 text-amber-300",
    high: "bg-rose-500/15 text-rose-300",
  };
  return <span className={clsx("chip", map[level])}>RISK {level.toUpperCase()}</span>;
}

// Horizontal 0-100 meter.
export function Meter({ value, label, tone = "brand" }: { value: number; label?: string; tone?: "brand" | "good" | "warn" | "bad" | "blue" }) {
  const tones: Record<string, string> = {
    brand: "bg-brand-500",
    good: "bg-emerald-500",
    warn: "bg-amber-500",
    bad: "bg-rose-500",
    blue: "bg-sky-500",
  };
  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
          <span>{label}</span>
          <span className="stat text-slate-200">{Math.round(value)}</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
        <div className={clsx("h-full rounded-full", tones[tone])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="stat text-lg font-bold text-white">{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function TeamDot({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white/20" style={{ background: color }} />;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="section-title">{title}</h2>
      {action}
    </div>
  );
}

export function valueTone(v: number): "good" | "warn" | "bad" | "blue" {
  if (v >= 65) return "good";
  if (v >= 50) return "blue";
  if (v >= 38) return "warn";
  return "bad";
}
