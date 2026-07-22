// Trading-desk primitives: ticker tape, board gateway cards, progress bars,
// rumor confidence badges. Server-component friendly (no hooks).
import Link from "next/link";
import clsx from "clsx";
import { ReactNode } from "react";

export interface TickerItem {
  id: string;
  kind: "official" | "rumor" | "news" | "meta";
  text: string;
  href?: string;
}

const TICKER_TONE: Record<TickerItem["kind"], string> = {
  official: "text-emerald-400",
  rumor: "text-amber-400",
  news: "text-sky-400",
  meta: "text-slate-400",
};
const TICKER_MARK: Record<TickerItem["kind"], string> = {
  official: "▲",
  rumor: "?",
  news: "•",
  meta: "◆",
};

export function Ticker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;
  // Duplicate content so the -50% marquee loops seamlessly.
  const strip = (key: string, hidden: boolean) => (
    <div key={key} aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-8 pr-8">
      {items.map((it) => {
        const body = (
          <span className={clsx("font-mono text-[11px] font-semibold", TICKER_TONE[it.kind])}>
            {TICKER_MARK[it.kind]} {it.text}
          </span>
        );
        return it.href ? (
          <a
            key={key + it.id}
            href={it.href}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={hidden ? -1 : undefined}
            className="hover:opacity-70"
          >
            {body}
          </a>
        ) : (
          <span key={key + it.id}>{body}</span>
        );
      })}
    </div>
  );
  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-white/[0.07] bg-ink-900/80 py-2">
      <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
        {strip("a", false)}
        {strip("b", true)}
      </div>
    </div>
  );
}

export function BoardCard({
  href,
  tint,
  icon,
  title,
  stat,
  sub,
}: {
  href: string;
  tint: "amber" | "sky" | "violet" | "green";
  icon: ReactNode;
  title: string;
  stat: ReactNode;
  sub: string;
}) {
  const titleTone = {
    amber: "text-amber-300",
    sky: "text-sky-300",
    violet: "text-violet-300",
    green: "text-emerald-300",
  }[tint];
  return (
    <Link
      href={href}
      className={clsx("card card-pad block transition hover:-translate-y-0.5 hover:bg-white/[0.05]", `tint-${tint}`)}
    >
      <div className={clsx("flex items-center gap-1.5 text-xs font-extrabold", titleTone)}>
        {icon} {title}
      </div>
      <div className="stat mt-1.5 text-2xl font-bold text-white">{stat}</div>
      <div className="mt-0.5 truncate text-[11px] text-slate-400">{sub}</div>
    </Link>
  );
}

export function ProgressBar({ value, max, tone = "sky" }: { value: number; max: number; tone?: "sky" | "green" | "red" }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100));
  const bar = { sky: "bg-sky-400", green: "bg-emerald-400", red: "bg-rose-400" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div className={clsx("h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// kind: "official" | "rumor" | anything else renders as NEWS
export function ConfidenceBadge({ kind, confidence }: { kind: string; confidence?: number }) {
  if (kind === "official") {
    return <span className="chip bg-emerald-500/15 font-mono text-emerald-300">ΕΠΙΣΗΜΟ</span>;
  }
  if (kind === "rumor") {
    return (
      <span className="chip bg-amber-500/15 font-mono text-amber-300">
        RUMOR{typeof confidence === "number" ? ` ${confidence}%` : ""}
      </span>
    );
  }
  return <span className="chip bg-sky-500/15 font-mono text-sky-300">NEWS</span>;
}

// Δ value vs yesterday: green ▲ / red ▼ / slate —
export function DeltaTag({ delta }: { delta: number | null | undefined }) {
  if (delta === null || delta === undefined || Math.abs(delta) < 0.05) {
    return <span className="stat text-xs text-slate-500">—</span>;
  }
  const up = delta > 0;
  return (
    <span className={clsx("stat text-xs font-bold", up ? "text-emerald-400" : "text-rose-400")}>
      {up ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}
    </span>
  );
}
