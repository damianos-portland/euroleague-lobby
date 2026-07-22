# Trading Desk Redesign + Offseason Lobby — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole app to a "trading desk" aesthetic and add real offseason content: RSS transfer news/rumors, real 2026-27 roster tracking, team budgets, and value movers.

**Architecture:** Design tokens + shared components carry the restyle app-wide; three new Prisma models (`NewsItem`, `RosterEntry`, `ProjectionSnapshot`) are filled by new ingest steps chained into the existing daily cron; three new pages plus a rebuilt lobby read them via `queries.ts` helpers.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma/PostgreSQL (Neon), Tailwind, `next/font` (Inter + JetBrains Mono), vitest (new, logic tests only).

**Spec:** `docs/superpowers/specs/2026-07-21-trading-desk-redesign-design.md`

**Conventions for this plan:**
- Repo root: `/Users/vasileioscharalampopoulos/Documents/MyProjects/euroleague-lobby`. All commands run there.
- `DATABASE_URL` in `.env` points at Neon (production DB — the app has no separate staging). `prisma db push` is additive here (new tables only).
- No test framework exists yet; Task 5 adds vitest. UI tasks are verified by `npm run build` + route checks (no UI unit tests — YAGNI).
- The spec's "SignalChip" is implemented by restyling the existing `SignalBadge` in place (same export name, ~6 call sites untouched).

---

### Task 1: Design tokens + fonts (foundation)

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `tailwind.config.ts`
- Modify: `src/app/globals.css`

- [ ] **Step 1.1: Wire next/font in `src/app/layout.tsx`** — replace the whole file with:

```tsx
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin", "greek"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "EuroLeague Lobby — Fantasy & Draft 2026",
  description:
    "Premium EuroLeague fantasy analytics: rosters, projections, fantasy value engine and live snake draft.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <Sidebar />
        <main className="md:pl-64">
          <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </body>
    </html>
  );
}
```

- [ ] **Step 1.2: Tokens in `tailwind.config.ts`** — apply these edits:

(a) In `colors.ink`, change `950: "#070912"` → `950: "#080b12"`.

(b) In `fontFamily`, add mono:
```ts
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
```

(c) In `keyframes`, add marquee (keep `pulseRing`):
```ts
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
```

(d) In `animation`, add:
```ts
        marquee: "marquee 45s linear infinite",
```

- [ ] **Step 1.3: Globals in `src/app/globals.css`** — three edits:

(a) Replace the `html, body` background rule with:
```css
html,
body {
  background: radial-gradient(1000px 500px at 85% -10%, rgba(227, 82, 5, 0.07), transparent 60%),
    #080b12;
  color: #e7ecf5;
}
```

(b) Replace `.card` and `.stat` inside `@layer components`:
```css
  .card {
    @apply rounded-2xl border border-white/[0.07] bg-white/[0.025] shadow-card backdrop-blur-sm;
  }
  .stat {
    @apply font-mono tabular-nums;
  }
```

(c) Append inside `@layer components` (after `.section-title`):
```css
  .tint-amber {
    @apply border-amber-400/20 bg-gradient-to-br from-amber-400/10 to-white/[0.02];
  }
  .tint-sky {
    @apply border-sky-400/20 bg-gradient-to-br from-sky-400/10 to-white/[0.02];
  }
  .tint-violet {
    @apply border-violet-400/20 bg-gradient-to-br from-violet-400/10 to-white/[0.02];
  }
  .tint-green {
    @apply border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 to-white/[0.02];
  }
```

- [ ] **Step 1.4: Verify** — Run: `npm run build`. Expected: `✓ Compiled successfully`, all routes listed, exit 0.

- [ ] **Step 1.5: Commit**
```bash
git add src/app/layout.tsx tailwind.config.ts src/app/globals.css
git commit -m "feat(ui): trading-desk tokens — JetBrains Mono/Inter fonts, glass cards, tints, marquee"
```

---

### Task 2: New desk components

**Files:**
- Create: `src/components/desk.tsx`

- [ ] **Step 2.1: Create `src/components/desk.tsx`:**

```tsx
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
  const strip = (key: string) => (
    <div key={key} className="flex shrink-0 items-center gap-8 pr-8">
      {items.map((it) => {
        const body = (
          <span className={clsx("font-mono text-[11px] font-semibold", TICKER_TONE[it.kind])}>
            {TICKER_MARK[it.kind]} {it.text}
          </span>
        );
        return it.href ? (
          <a key={key + it.id} href={it.href} target="_blank" rel="noopener noreferrer" className="hover:opacity-70">
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
        {strip("a")}
        {strip("b")}
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
```

- [ ] **Step 2.2: Verify** — Run: `npx tsc --noEmit`. Expected: exit 0, no errors.

- [ ] **Step 2.3: Commit**
```bash
git add src/components/desk.tsx
git commit -m "feat(ui): desk components — Ticker, BoardCard, ProgressBar, ConfidenceBadge, DeltaTag"
```

---

### Task 3: Restyle shared primitives

**Files:**
- Modify: `src/components/ui.tsx`
- Modify: `src/components/PageHeader.tsx`

- [ ] **Step 3.1: In `src/components/ui.tsx`** — two edits:

(a) Replace `SignalBadge` (mono, terminal look):
```tsx
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
```

(b) In `Stat`, change the value div class from `"stat text-lg font-bold text-slate-100"` to `"stat text-lg font-bold text-white"`.

- [ ] **Step 3.2: In `src/components/PageHeader.tsx`** — replace the whole file (adds a mono status line slot):

```tsx
import { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
  status,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  status?: string; // mono terminal-style line, e.g. "● LIVE · OFFSEASON 2026-27"
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {status && (
          <div className="mb-1 font-mono text-[10px] font-semibold tracking-wider text-emerald-400">{status}</div>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 3.3: Verify + commit** — Run: `npm run build` (expected: clean). Then:
```bash
git add src/components/ui.tsx src/components/PageHeader.tsx
git commit -m "feat(ui): restyle SignalBadge/Stat/PageHeader for trading-desk look"
```

---

### Task 4: Prisma models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 4.1: Append models at end of `prisma/schema.prisma`:**

```prisma
// ---------------------------------------------------------------------------
// Offseason data: scraped news/rumors, next-season rosters, value snapshots
// ---------------------------------------------------------------------------

model NewsItem {
  id          String   @id @default(cuid())
  url         String   @unique // dedupe key
  source      String // "eurohoops" | "sportando"
  title       String
  summary     String   @default("")
  publishedAt DateTime
  // kind: "official" | "rumor" | "news"
  kind        String
  confidence  Int      @default(0) // 0-100, rumors only
  playerId    String?
  player      Player?  @relation(fields: [playerId], references: [id], onDelete: SetNull)
  teamCodes   String   @default("") // comma-separated matched club codes
  createdAt   DateTime @default(now())

  @@index([publishedAt])
  @@index([kind])
}

model RosterEntry {
  id         String   @id @default(cuid())
  season     String // "2026-27"
  teamCode   String
  teamName   String
  personCode String
  name       String // "Firstname Lastname" cleaned
  position   String   @default("")
  dorsal     String   @default("")
  // status: "returning" | "transfer" | "new"
  status     String   @default("new")
  playerId   String?
  player     Player?  @relation(fields: [playerId], references: [id], onDelete: SetNull)
  updatedAt  DateTime @updatedAt

  @@unique([season, teamCode, personCode])
  @@index([season, teamCode])
}

model ProjectionSnapshot {
  id                String @id @default(cuid())
  playerId          String
  player            Player @relation(fields: [playerId], references: [id], onDelete: Cascade)
  date              String // "YYYY-MM-DD" UTC
  valueScore        Float
  projFantasyPoints Float

  @@unique([playerId, date])
  @@index([date])
}
```

- [ ] **Step 4.2: Add back-relations on `Player`** — after the line `queueItems  DraftQueueItem[]` add:

```prisma
  newsItems     NewsItem[]
  rosterEntries RosterEntry[]
  snapshots     ProjectionSnapshot[]
```

- [ ] **Step 4.3: Push + verify** — Run: `npx prisma db push`. Expected: "Your database is now in sync", client regenerated. Then `npx tsc --noEmit` → exit 0.

- [ ] **Step 4.4: Commit**
```bash
git add prisma/schema.prisma
git commit -m "feat(db): NewsItem, RosterEntry, ProjectionSnapshot models"
```

---

### Task 5: News scraper (vitest + TDD for the pure logic)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/newsScraper.ts`
- Test: `src/lib/newsScraper.test.ts`

- [ ] **Step 5.1: Install vitest** — Run: `npm install -D vitest`. Then in `package.json` scripts add: `"test": "vitest run"`.

- [ ] **Step 5.2: Create `vitest.config.ts`:**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 5.3: Write the failing tests — create `src/lib/newsScraper.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { parseRss, classifyItem, matchEntities, CLUB_ALIASES } from "./newsScraper";

const RSS_FIXTURE = `<?xml version="1.0"?>
<rss><channel>
<item>
  <title><![CDATA[Evan Fournier officially signs two-year extension with Olympiacos]]></title>
  <link>https://example.com/fournier</link>
  <description><![CDATA[The French guard commits through 2028.]]></description>
  <pubDate>Mon, 20 Jul 2026 10:00:00 +0000</pubDate>
</item>
<item>
  <title>Kendrick Nunn reportedly close to NBA return &#8211; sources</title>
  <link>https://example.com/nunn</link>
  <description>Advanced talks, according to sources.</description>
  <pubDate>Sun, 19 Jul 2026 09:00:00 +0000</pubDate>
</item>
</channel></rss>`;

describe("parseRss", () => {
  it("extracts items with CDATA and entities decoded", () => {
    const items = parseRss(RSS_FIXTURE);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Evan Fournier officially signs two-year extension with Olympiacos");
    expect(items[0].link).toBe("https://example.com/fournier");
    expect(items[1].title).toContain("Nunn reportedly close to NBA return – sources");
    expect(items[0].pubDate.getUTCFullYear()).toBe(2026);
  });
});

describe("classifyItem", () => {
  it("classifies official signings", () => {
    const c = classifyItem("Fournier officially signs extension", "");
    expect(c.kind).toBe("official");
  });
  it("classifies rumors with confidence boosts", () => {
    const c = classifyItem("Nunn reportedly close to NBA return", "advanced talks, according to sources");
    expect(c.kind).toBe("rumor");
    // base 40 + 20 (close to) + 15 (advanced talks) + 10 (sources) = 85
    expect(c.confidence).toBe(85);
  });
  it("caps confidence at 90 and floors at 10", () => {
    expect(classifyItem("x reportedly close to set to sign advanced talks per sources", "").confidence).toBeLessThanOrEqual(90);
    expect(classifyItem("x reportedly signs, deal denied and unlikely", "").confidence).toBeGreaterThanOrEqual(10);
  });
  it("falls back to news", () => {
    expect(classifyItem("EuroLeague announces schedule", "").kind).toBe("news");
  });
});

describe("matchEntities", () => {
  const players = [
    { id: "p1", firstName: "Evan", lastName: "Fournier" },
    { id: "p2", firstName: "Mike", lastName: "James" },
    { id: "p3", firstName: "Lebron", lastName: "James" },
  ];
  it("matches unique lastName", () => {
    expect(matchEntities("Fournier stays in Piraeus", players).playerId).toBe("p1");
  });
  it("needs firstName when lastName is ambiguous", () => {
    expect(matchEntities("James scores 30", players).playerId).toBeNull();
    expect(matchEntities("Mike James scores 30", players).playerId).toBe("p2");
  });
  it("matches club aliases to codes", () => {
    const m = matchEntities("Olympiacos and Real Madrid discuss deal", players);
    expect(m.teamCodes).toContain("OLY");
    expect(m.teamCodes).toContain("MAD");
  });
  it("exports aliases for all 20 clubs", () => {
    expect(Object.keys(CLUB_ALIASES)).toHaveLength(20);
  });
});
```

- [ ] **Step 5.4: Run tests, verify they fail** — Run: `npm test`. Expected: FAIL (`newsScraper` module not found).

- [ ] **Step 5.5: Create `src/lib/newsScraper.ts`:**

```ts
// ---------------------------------------------------------------------------
// Transfer news scraper: RSS feeds -> entity-matched, classified NewsItems.
// Pure helpers (parseRss/classifyItem/matchEntities) are unit-tested; the
// scrapeNews() orchestrator fetches feeds and upserts into the DB.
// ---------------------------------------------------------------------------

import { prisma } from "./db";

export interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: Date;
}

export interface Classification {
  kind: "official" | "rumor" | "news";
  confidence: number; // 0 unless rumor
}

export const FEEDS: { source: string; url: string }[] = [
  { source: "eurohoops", url: "https://www.eurohoops.net/en/feed/" },
  { source: "sportando", url: "https://sportando.basketball/feed/" },
];

// Club alias -> E-code for the 20 EuroLeague clubs (lowercase substrings).
export const CLUB_ALIASES: Record<string, string[]> = {
  MAD: ["real madrid"],
  BAR: ["barcelona", "barça"],
  PAN: ["panathinaikos"],
  OLY: ["olympiacos"],
  ULK: ["fenerbahce", "fenerbahçe"],
  IST: ["anadolu efes", "efes"],
  MCO: ["monaco"],
  ASV: ["asvel", "villeurbanne"],
  PRS: ["paris basketball"],
  MIL: ["olimpia milano", "milan", "armani"],
  VIR: ["virtus bologna", "virtus"],
  RED: ["crvena zvezda", "red star"],
  PAR: ["partizan"],
  MUN: ["bayern"],
  BAS: ["baskonia"],
  PAM: ["valencia basket", "valencia"],
  ZAL: ["zalgiris", "žalgiris"],
  TEL: ["maccabi tel aviv", "maccabi"],
  HTA: ["hapoel tel aviv", "hapoel"],
  DUB: ["dubai basketball", "dubai"],
};

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/<[^>]+>/g, "") // strip any leftover HTML tags
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const title = tag(block, "title");
    const link = tag(block, "link");
    if (!title || !link) continue;
    const pub = new Date(tag(block, "pubDate"));
    items.push({
      title,
      link,
      description: tag(block, "description").slice(0, 500),
      pubDate: isNaN(pub.getTime()) ? new Date() : pub,
    });
  }
  return items;
}

const OFFICIAL_RE = /\b(officially|signs|signed|agrees|announces|announced|commits|extends|completed|inks)\b/;
const RUMOR_RE = /\b(reportedly|rumor|rumour|linked|target|targets|interest|interested|negotiating|talks|close to|frontrunner|eyeing|monitoring)\b/;

export function classifyItem(title: string, description: string): Classification {
  const text = `${title} ${description}`.toLowerCase();
  // Rumor language wins over official verbs ("reportedly signs" is a rumor).
  if (RUMOR_RE.test(text)) {
    let c = 40;
    if (/\bclose to\b|\bagreement (is )?near\b|\bset to sign\b/.test(text)) c += 20;
    if (/\badvanced talks\b|\bnegotiat/.test(text)) c += 15;
    if (/\baccording to\b|\bsources?\b|\bper\b/.test(text)) c += 10;
    if (/\bdenie[sd]\b|\bunlikely\b|\bno deal\b/.test(text)) c -= 15;
    return { kind: "rumor", confidence: Math.max(10, Math.min(90, c)) };
  }
  if (OFFICIAL_RE.test(text)) return { kind: "official", confidence: 0 };
  return { kind: "news", confidence: 0 };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface EntityMatch {
  playerId: string | null;
  teamCodes: string[];
}

export function matchEntities(
  text: string,
  players: { id: string; firstName: string; lastName: string }[]
): EntityMatch {
  const lower = text.toLowerCase();

  const teamCodes: string[] = [];
  for (const [code, aliases] of Object.entries(CLUB_ALIASES)) {
    if (aliases.some((a) => lower.includes(a))) teamCodes.push(code);
  }

  let playerId: string | null = null;
  const lastCount = new Map<string, number>();
  for (const p of players) {
    const k = p.lastName.toLowerCase();
    lastCount.set(k, (lastCount.get(k) ?? 0) + 1);
  }
  for (const p of players) {
    const last = p.lastName.toLowerCase();
    if (!new RegExp(`\\b${escapeRe(last)}\\b`).test(lower)) continue;
    const unique = (lastCount.get(last) ?? 0) === 1;
    const firstToo = new RegExp(`\\b${escapeRe(p.firstName.toLowerCase())}\\b`).test(lower);
    if (unique || firstToo) {
      playerId = p.id;
      break;
    }
  }
  return { playerId, teamCodes };
}

// ---------------------------------------------------------------------------
// Orchestrator: fetch feeds, classify, upsert. Keeps newest 500 items.
// ---------------------------------------------------------------------------
export async function scrapeNews(): Promise<{ fetched: number; stored: number }> {
  const players = await prisma.player.findMany({
    select: { id: true, firstName: true, lastName: true },
  });

  let fetched = 0;
  let stored = 0;
  for (const feed of FEEDS) {
    let xml = "";
    try {
      const r = await fetch(feed.url, {
        headers: { "User-Agent": "Mozilla/5.0 (EuroLeagueLobby)", Accept: "application/rss+xml,application/xml,*/*" },
      });
      if (!r.ok) continue;
      xml = await r.text();
    } catch {
      continue; // a dead feed must not kill the run
    }
    for (const item of parseRss(xml)) {
      fetched++;
      const text = `${item.title} ${item.description}`;
      const { playerId, teamCodes } = matchEntities(text, players);
      // Keep only items about our league: a matched player, a matched club,
      // or at least an explicit EuroLeague mention.
      if (!playerId && teamCodes.length === 0 && !/euroleague/i.test(text)) continue;
      const cls = classifyItem(item.title, item.description);
      await prisma.newsItem.upsert({
        where: { url: item.link },
        update: {}, // never rewrite an existing story
        create: {
          url: item.link,
          source: feed.source,
          title: item.title,
          summary: item.description,
          publishedAt: item.pubDate,
          kind: cls.kind,
          confidence: cls.confidence,
          playerId,
          teamCodes: teamCodes.join(","),
        },
      });
      stored++;
    }
  }

  // Prune: keep the newest 500 by publishedAt.
  const excess = await prisma.newsItem.findMany({
    orderBy: { publishedAt: "desc" },
    skip: 500,
    select: { id: true },
  });
  if (excess.length > 0) {
    await prisma.newsItem.deleteMany({ where: { id: { in: excess.map((e) => e.id) } } });
  }
  return { fetched, stored };
}
```

- [ ] **Step 5.6: Run tests, verify they pass** — Run: `npm test`. Expected: all tests in `newsScraper.test.ts` PASS.

- [ ] **Step 5.7: Live smoke test** — Run:
```bash
npx tsx -e "import{scrapeNews}from'./src/lib/newsScraper';scrapeNews().then(r=>{console.log(r);process.exit(0)})"
```
Expected: `{ fetched: <n≥20>, stored: <n≥1> }`. Then spot-check: `npx tsx -e "import{prisma}from'./src/lib/db';prisma.newsItem.findMany({take:5,orderBy:{publishedAt:'desc'}}).then(r=>{console.table(r.map(x=>({kind:x.kind,conf:x.confidence,title:x.title.slice(0,60)})));process.exit(0)})"` — verify classifications look sane.

- [ ] **Step 5.8: Commit**
```bash
git add package.json package-lock.json vitest.config.ts src/lib/newsScraper.ts src/lib/newsScraper.test.ts
git commit -m "feat(data): RSS news scraper with entity matching + classification (vitest)"
```

---

### Task 6: Next-season roster ingest

**Files:**
- Create: `src/lib/names.ts` (extract shared name helpers)
- Modify: `src/lib/ingest.ts`
- Test: `src/lib/rosterStatus.test.ts`
- Create: `src/lib/rosterStatus.ts`

- [ ] **Step 6.1: Create `src/lib/names.ts`** — move (verbatim) `titleCase` and `splitStatsName` out of `ingest.ts`:

```ts
// Shared name-normalisation helpers for API ingestion.

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'.])([a-zà-ÿ])/g, (_m, b, c) => b + c.toUpperCase())
    // Keep Roman-numeral suffixes and "Mc"/"Mac" prefixes readable.
    .replace(/\b(Ii|Iii|Iv|Vi|Vii|Jr|Sr)\b/g, (m) => m.toUpperCase())
    .replace(/\bMc([a-z])/g, (_m, c) => "Mc" + c.toUpperCase());
}

// Split the stats "SURNAME, FIRSTNAME" common name into { first, last }.
export function splitStatsName(name: string): { first: string; last: string } {
  const parts = String(name || "").split(",");
  return {
    last: titleCase((parts[0] || "").trim()),
    first: titleCase((parts[1] || "").trim()),
  };
}
```

In `src/lib/ingest.ts`: delete the local `titleCase` and `splitStatsName` definitions and add `import { titleCase, splitStatsName } from "./names";`.

- [ ] **Step 6.2: Write failing test — create `src/lib/rosterStatus.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { rosterStatus } from "./rosterStatus";

describe("rosterStatus", () => {
  it("new when no matching player in DB", () => {
    expect(rosterStatus(null, "OLY")).toBe("new");
  });
  it("returning when last season team matches this club", () => {
    expect(rosterStatus({ teamSnapshot: "OLY" }, "OLY")).toBe("returning");
  });
  it("transfer when last season team differs", () => {
    expect(rosterStatus({ teamSnapshot: "MCO" }, "OLY")).toBe("transfer");
  });
  it("transfer when player known but has no season snapshot", () => {
    expect(rosterStatus({ teamSnapshot: null }, "OLY")).toBe("transfer");
  });
});
```

- [ ] **Step 6.3: Run** `npm test` — Expected: FAIL (`rosterStatus` not found).

- [ ] **Step 6.4: Create `src/lib/rosterStatus.ts`:**

```ts
// Classify a next-season roster entry relative to our current player DB.
export type RosterEntryStatus = "returning" | "transfer" | "new";

export function rosterStatus(
  matched: { teamSnapshot: string | null } | null,
  teamCode: string
): RosterEntryStatus {
  if (!matched) return "new";
  return matched.teamSnapshot === teamCode ? "returning" : "transfer";
}
```

- [ ] **Step 6.5: Run** `npm test` — Expected: PASS (all files).

- [ ] **Step 6.6: Add `ingestRosters()` to `src/lib/ingest.ts`** (append at end of file):

```ts
// ---------------------------------------------------------------------------
// Next-season roster ingest ("Roster Race"): who has signed where for the
// upcoming season. Source: feeds clubs/{code}/people for EL_NEXT_SEASON_CODE.
// ---------------------------------------------------------------------------
export async function ingestRosters(
  seasonCode = process.env.EL_NEXT_SEASON_CODE || "E2026"
): Promise<{ season: string; teams: number; entries: number }> {
  const SEASON = seasonLabel(seasonCode);
  const FEED =
    "https://feeds.incrowdsports.com/provider/euroleague-feeds/v2/competitions/E/seasons/" +
    seasonCode;
  const { rosterStatus } = await import("./rosterStatus");

  const clubsRaw = await getJson(`${FEED}/clubs`);
  const clubs: any[] = clubsRaw.data ?? [];

  // Players with their latest season snapshot, for returning/transfer matching.
  const dbPlayers = await prisma.player.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      seasonStats: { orderBy: { season: "desc" }, take: 1, select: { teamSnapshot: true } },
    },
  });
  const byName = new Map(
    dbPlayers.map((p) => [`${p.firstName.toLowerCase()}|${p.lastName.toLowerCase()}`, p])
  );

  let entries = 0;
  for (const c of clubs) {
    let people: any[] = [];
    try {
      people = await getJson(`${FEED}/clubs/${c.code}/people`);
    } catch {
      continue; // clubs without a published roster yet are fine
    }
    for (const rec of people) {
      if (rec.typeName !== "Player" || !rec.person?.code) continue;
      const { first, last } = splitStatsName(rec.person.name || "");
      if (!last) continue;
      const matched = byName.get(`${first.toLowerCase()}|${last.toLowerCase()}`) ?? null;
      const status = rosterStatus(
        matched ? { teamSnapshot: matched.seasonStats[0]?.teamSnapshot ?? null } : null,
        c.code
      );
      const data = {
        teamName: c.name ?? c.code,
        name: `${first} ${last}`.trim(),
        position: rec.positionName ?? "",
        dorsal: rec.dorsal ?? "",
        status,
        playerId: matched?.id ?? null,
      };
      await prisma.rosterEntry.upsert({
        where: { season_teamCode_personCode: { season: SEASON, teamCode: c.code, personCode: rec.person.code } },
        update: data,
        create: { season: SEASON, teamCode: c.code, personCode: rec.person.code, ...data },
      });
      entries++;
    }
  }
  return { season: SEASON, teams: clubs.length, entries };
}

// ---------------------------------------------------------------------------
// Daily projection snapshot (feeds the "Movers" board: Δ value vs yesterday).
// ---------------------------------------------------------------------------
export async function snapshotProjections(): Promise<{ date: string; count: number }> {
  const date = new Date().toISOString().slice(0, 10);
  const projections = await prisma.projection.findMany({
    select: { playerId: true, valueScore: true, projFantasyPoints: true },
  });
  for (const p of projections) {
    await prisma.projectionSnapshot.upsert({
      where: { playerId_date: { playerId: p.playerId, date } },
      update: { valueScore: p.valueScore, projFantasyPoints: p.projFantasyPoints },
      create: { playerId: p.playerId, date, valueScore: p.valueScore, projFantasyPoints: p.projFantasyPoints },
    });
  }
  return { date, count: projections.length };
}
```

- [ ] **Step 6.7: Live smoke test** — Run:
```bash
npx tsx -e "import{ingestRosters,snapshotProjections}from'./src/lib/ingest';(async()=>{console.log(await ingestRosters());console.log(await snapshotProjections());process.exit(0)})()"
```
Expected: `{ season: '2026-27', teams: 20, entries: >100 }` and `{ date: '2026-07-21', count: 208 }`. Spot-check statuses:
```bash
npx tsx -e "import{prisma}from'./src/lib/db';prisma.rosterEntry.groupBy({by:['status'],_count:{_all:true}}).then(r=>{console.log(r);process.exit(0)})"
```
Expected: a mix of returning/transfer/new (not all one value).

- [ ] **Step 6.8: Commit**
```bash
git add src/lib/names.ts src/lib/ingest.ts src/lib/rosterStatus.ts src/lib/rosterStatus.test.ts
git commit -m "feat(data): 2026-27 roster ingest with returning/transfer/new status + projection snapshots"
```

---

### Task 7: Cron + local ingest wiring

**Files:**
- Modify: `src/app/api/cron/ingest/route.ts`
- Modify: `scripts/ingest-euroleague.ts`

- [ ] **Step 7.1: Replace the `GET` body in `src/app/api/cron/ingest/route.ts`** so each step is isolated:

```ts
import { NextRequest, NextResponse } from "next/server";
import { ingestLiveSeason, ingestRosters, snapshotProjections } from "@/lib/ingest";
import { scrapeNews } from "@/lib/newsScraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily refresh: stats -> next-season rosters -> news -> snapshot.
// One failing step must not kill the rest.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const startedAt = Date.now();
  const steps: Record<string, unknown> = {};
  const run = async (name: string, fn: () => Promise<unknown>) => {
    try {
      steps[name] = await fn();
    } catch (e: any) {
      steps[name] = { error: e?.message ?? String(e) };
    }
  };

  await run("stats", () => ingestLiveSeason());
  await run("rosters", () => ingestRosters());
  await run("news", () => scrapeNews());
  await run("snapshot", () => snapshotProjections());

  const failed = Object.values(steps).some((s: any) => s && typeof s === "object" && "error" in s);
  return NextResponse.json({ ok: !failed, steps, ms: Date.now() - startedAt }, { status: failed ? 500 : 200 });
}
```

- [ ] **Step 7.2: In `scripts/ingest-euroleague.ts`** — extend `main()` to run the new steps:

```ts
import { prisma } from "../src/lib/db";
import { ingestLiveSeason, ingestRosters, snapshotProjections } from "../src/lib/ingest";
import { scrapeNews } from "../src/lib/newsScraper";
```
…and replace the `main()` function with:
```ts
async function main() {
  console.log("→ Ensuring demo scaffold (users, draft room)…");
  await ensureScaffold();
  console.log("→ Live stats refresh…");
  console.log("  ", await ingestLiveSeason());
  console.log("→ 2026-27 rosters…");
  console.log("  ", await ingestRosters());
  console.log("→ News scrape…");
  console.log("  ", await scrapeNews());
  console.log("→ Projection snapshot…");
  console.log("  ", await snapshotProjections());
  console.log("✓ Full refresh complete");
}
```

- [ ] **Step 7.3: Verify + commit** — Run: `npm run build` (clean). Then:
```bash
git add src/app/api/cron/ingest/route.ts scripts/ingest-euroleague.ts
git commit -m "feat(cron): chain rosters + news + snapshot into daily refresh with per-step isolation"
```

---

### Task 8: Budgets data + read-side queries

**Files:**
- Create: `src/data/budgets.ts`
- Modify: `src/lib/queries.ts`

- [ ] **Step 8.1: Create `src/data/budgets.ts`:**

```ts
// Published budget ESTIMATES (€M) for the 20 EuroLeague 2026-27 clubs.
// Figures compiled from press reports / EuroLeague budget disclosures; they
// are approximations for context, clearly labeled as estimates in the UI.
export interface TeamBudget {
  code: string;
  name: string;
  budgetMEur: number;
}

export const BUDGET_SOURCE = "Εκτιμήσεις από δημοσιευμένα ρεπορτάζ (2025-26/2026-27)";

export const TEAM_BUDGETS: TeamBudget[] = [
  { code: "MAD", name: "Real Madrid", budgetMEur: 55 },
  { code: "BAR", name: "FC Barcelona", budgetMEur: 47 },
  { code: "PAN", name: "Panathinaikos", budgetMEur: 45 },
  { code: "ULK", name: "Fenerbahce", budgetMEur: 42 },
  { code: "DUB", name: "Dubai Basketball", budgetMEur: 40 },
  { code: "OLY", name: "Olympiacos", budgetMEur: 38 },
  { code: "MCO", name: "AS Monaco", budgetMEur: 35 },
  { code: "IST", name: "Anadolu Efes", budgetMEur: 32 },
  { code: "HTA", name: "Hapoel Tel Aviv", budgetMEur: 30 },
  { code: "MIL", name: "Olimpia Milano", budgetMEur: 30 },
  { code: "PAR", name: "Partizan", budgetMEur: 28 },
  { code: "RED", name: "Crvena Zvezda", budgetMEur: 26 },
  { code: "PAM", name: "Valencia Basket", budgetMEur: 25 },
  { code: "TEL", name: "Maccabi Tel Aviv", budgetMEur: 25 },
  { code: "VIR", name: "Virtus Bologna", budgetMEur: 22 },
  { code: "MUN", name: "Bayern Munich", budgetMEur: 22 },
  { code: "ZAL", name: "Zalgiris Kaunas", budgetMEur: 21 },
  { code: "BAS", name: "Baskonia", budgetMEur: 20 },
  { code: "ASV", name: "LDLC ASVEL", budgetMEur: 18 },
  { code: "PRS", name: "Paris Basketball", budgetMEur: 17 },
];
```

- [ ] **Step 8.2: Append read helpers to `src/lib/queries.ts`:**

```ts
// --- Offseason additions (news, rosters, movers) ---------------------------

export async function getNewsItems(limit = 60) {
  return prisma.newsItem.findMany({
    orderBy: { publishedAt: "desc" },
    take: limit,
    include: { player: true },
  });
}

export interface RosterRaceTeam {
  teamCode: string;
  teamName: string;
  entries: {
    id: string;
    name: string;
    position: string;
    status: string;
    playerId: string | null;
    lastFp: number | null;
  }[];
}

export async function getRosterRace(season = "2026-27"): Promise<RosterRaceTeam[]> {
  const rows = await prisma.rosterEntry.findMany({
    where: { season },
    orderBy: [{ teamCode: "asc" }, { name: "asc" }],
    include: { player: { include: { seasonStats: { orderBy: { season: "desc" }, take: 1 } } } },
  });
  const byTeam = new Map<string, RosterRaceTeam>();
  for (const r of rows) {
    if (!byTeam.has(r.teamCode)) byTeam.set(r.teamCode, { teamCode: r.teamCode, teamName: r.teamName, entries: [] });
    byTeam.get(r.teamCode)!.entries.push({
      id: r.id,
      name: r.name,
      position: r.position,
      status: r.status,
      playerId: r.playerId,
      lastFp: r.player?.seasonStats[0]?.fantasyPoints ?? null,
    });
  }
  return [...byTeam.values()].sort((a, b) => b.entries.length - a.entries.length);
}

// Map playerId -> Δ valueScore between the two most recent snapshot dates.
export async function getValueDeltas(): Promise<Map<string, number>> {
  const dates = await prisma.projectionSnapshot.findMany({
    distinct: ["date"],
    orderBy: { date: "desc" },
    take: 2,
    select: { date: true },
  });
  if (dates.length < 2) return new Map();
  const [latest, prev] = [dates[0].date, dates[1].date];
  const [a, b] = await Promise.all([
    prisma.projectionSnapshot.findMany({ where: { date: latest }, select: { playerId: true, valueScore: true } }),
    prisma.projectionSnapshot.findMany({ where: { date: prev }, select: { playerId: true, valueScore: true } }),
  ]);
  const prevBy = new Map(b.map((s) => [s.playerId, s.valueScore]));
  const deltas = new Map<string, number>();
  for (const s of a) {
    const p = prevBy.get(s.playerId);
    if (p !== undefined) deltas.set(s.playerId, Math.round((s.valueScore - p) * 10) / 10);
  }
  return deltas;
}
```

- [ ] **Step 8.3: Verify + commit** — Run: `npx tsc --noEmit` (exit 0). Then:
```bash
git add src/data/budgets.ts src/lib/queries.ts
git commit -m "feat(data): budget estimates + news/roster-race/value-delta queries"
```

---

### Task 9: `/rumors` page

**Files:**
- Create: `src/app/rumors/page.tsx`
- Create: `src/components/RumorsFeed.tsx`

- [ ] **Step 9.1: Create `src/components/RumorsFeed.tsx`** (client component — filters):

```tsx
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
```

- [ ] **Step 9.2: Create `src/app/rumors/page.tsx`:**

```tsx
import { getNewsItems } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { RumorsFeed, RumorRow } from "@/components/RumorsFeed";

export const dynamic = "force-dynamic";

export default async function RumorsPage() {
  const items = await getNewsItems(80);
  const rows: RumorRow[] = items.map((i) => ({
    id: i.id,
    url: i.url,
    source: i.source,
    title: i.title,
    publishedAt: i.publishedAt.toISOString(),
    kind: i.kind,
    confidence: i.confidence,
    teamCodes: i.teamCodes ? i.teamCodes.split(",").filter(Boolean) : [],
    player: i.player ? { id: i.player.id, name: `${i.player.firstName} ${i.player.lastName}` } : null,
  }));
  const teams = [...new Set(rows.flatMap((r) => r.teamCodes))].sort();

  return (
    <>
      <PageHeader
        title="Rumor Mill"
        status="● FEED LIVE · ΑΝΑΝΕΩΣΗ ΚΑΘΗΜΕΡΙΝΑ 06:00 UTC"
        subtitle="Μεταγραφικά νέα & φήμες από Eurohoops/Sportando — αυτόματα ταξινομημένα, με confidence και matched παίκτες."
      />
      <RumorsFeed items={rows} teams={teams} />
    </>
  );
}
```

- [ ] **Step 9.3: Verify + commit** — Run: `npm run build` (clean, `/rumors` listed). Then:
```bash
git add src/app/rumors src/components/RumorsFeed.tsx
git commit -m "feat(pages): Rumor Mill feed with kind/team filters"
```

---

### Task 10: `/roster-race` + `/budgets` pages

**Files:**
- Create: `src/app/roster-race/page.tsx`
- Create: `src/app/budgets/page.tsx`

- [ ] **Step 10.1: Create `src/app/roster-race/page.tsx`:**

```tsx
import Link from "next/link";
import { getRosterRace } from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { ProgressBar } from "@/components/desk";
import clsx from "clsx";

export const dynamic = "force-dynamic";

const ROSTER_REF = 16; // reference full-roster size

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  returning: { label: "RETURNING", cls: "bg-slate-500/15 text-slate-300" },
  transfer: { label: "TRANSFER", cls: "bg-emerald-500/15 text-emerald-300" },
  new: { label: "NEW", cls: "bg-amber-500/15 text-amber-300" },
};

export default async function RosterRacePage() {
  const teams = await getRosterRace();
  const total = teams.reduce((s, t) => s + t.entries.length, 0);
  const leader = teams[0];
  const laggard = teams[teams.length - 1];

  return (
    <>
      <PageHeader
        title="Roster Race 2026-27"
        status={`● ${total}/${20 * ROSTER_REF} SIGNED`}
        subtitle={`Ποιος χτίζει γρηγορότερα ρόστερ για τη νέα σεζόν — πραγματικά δεδομένα από το επίσημο feed.${
          leader ? ` Προηγείται: ${leader.teamName} (${leader.entries.length}).` : ""
        }${laggard ? ` Τελευταία: ${laggard.teamName} (${laggard.entries.length}).` : ""}`}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {teams.map((t) => (
          <section key={t.teamCode} className="card card-pad tint-sky">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">{t.teamName}</h2>
              <span className="stat text-xs text-sky-300">{t.entries.length}/{ROSTER_REF}</span>
            </div>
            <ProgressBar value={t.entries.length} max={ROSTER_REF} tone={t.entries.length >= 10 ? "green" : t.entries.length >= 5 ? "sky" : "red"} />
            <ul className="mt-3 space-y-1.5">
              {t.entries.map((e) => {
                const s = STATUS_STYLE[e.status] ?? STATUS_STYLE.new;
                return (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                    {e.playerId ? (
                      <Link href={`/players/${e.playerId}`} className="truncate font-semibold text-white hover:text-brand-400">
                        {e.name}
                      </Link>
                    ) : (
                      <span className="truncate text-slate-200">{e.name}</span>
                    )}
                    <span className="flex shrink-0 items-center gap-2">
                      {e.lastFp !== null && <span className="stat text-[11px] text-slate-400">{e.lastFp.toFixed(1)} FP</span>}
                      <span className={clsx("chip font-mono !text-[9px]", s.cls)}>{s.label}</span>
                    </span>
                  </li>
                );
              })}
              {t.entries.length === 0 && <li className="text-sm text-slate-500">Καμία υπογραφή ακόμα.</li>}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 10.2: Create `src/app/budgets/page.tsx`:**

```tsx
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { TEAM_BUDGETS, BUDGET_SOURCE } from "@/data/budgets";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  // Projected team FP = sum of projFantasyPoints of the team's top 12 players.
  const players = await prisma.player.findMany({
    where: { projection: { isNot: null } },
    select: { team: { select: { shortName: true } }, projection: { select: { projFantasyPoints: true } } },
  });
  const fpByTeam = new Map<string, number[]>();
  for (const p of players) {
    const code = p.team?.shortName;
    if (!code || !p.projection) continue;
    if (!fpByTeam.has(code)) fpByTeam.set(code, []);
    fpByTeam.get(code)!.push(p.projection.projFantasyPoints);
  }
  const teamFp = (code: string) =>
    (fpByTeam.get(code) ?? []).sort((a, b) => b - a).slice(0, 12).reduce((s, v) => s + v, 0);

  const maxBudget = Math.max(...TEAM_BUDGETS.map((b) => b.budgetMEur));
  const rows = TEAM_BUDGETS.map((b) => {
    const fp = teamFp(b.code);
    return { ...b, fp, fpPerM: fp > 0 ? fp / b.budgetMEur : 0 };
  });
  const smart = [...rows].filter((r) => r.fp > 0).sort((a, b) => b.fpPerM - a.fpPerM);

  return (
    <>
      <PageHeader
        title="Budget League"
        status="● ΕΚΤΙΜΗΣΕΙΣ · ΟΧΙ ΕΠΙΣΗΜΑ"
        subtitle={`Ποιος ξοδεύει πόσα — και ποιος αγοράζει έξυπνα (Projected FP ανά €M). ${BUDGET_SOURCE}.`}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="card card-pad tint-violet">
          <h2 className="mb-3 text-sm font-bold text-white">💰 Budgets (€M)</h2>
          <ul className="space-y-2">
            {rows.map((b) => (
              <li key={b.code} className="flex items-center gap-3">
                <span className="stat w-10 shrink-0 text-xs text-slate-400">{b.code}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-white/[0.05]">
                  <div
                    className="h-full rounded bg-gradient-to-r from-violet-500/80 to-violet-400/50"
                    style={{ width: `${(b.budgetMEur / maxBudget) * 100}%` }}
                  />
                </div>
                <span className="stat w-14 shrink-0 text-right text-xs font-bold text-white">€{b.budgetMEur}M</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card card-pad tint-green">
          <h2 className="mb-3 text-sm font-bold text-white">🧠 Ποιος αγοράζει έξυπνα — Proj FP ανά €M</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="th">#</th>
                <th className="th">Team</th>
                <th className="th text-right">Proj FP (top-12)</th>
                <th className="th text-right">Budget</th>
                <th className="th text-right">FP/€M</th>
              </tr>
            </thead>
            <tbody>
              {smart.map((r, i) => (
                <tr key={r.code} className="border-b border-white/5">
                  <td className="td text-slate-500">{i + 1}</td>
                  <td className="td font-semibold text-white">{r.name}</td>
                  <td className="td stat text-right">{r.fp.toFixed(0)}</td>
                  <td className="td stat text-right">€{r.budgetMEur}M</td>
                  <td className="td stat text-right font-bold text-emerald-300">{r.fpPerM.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-slate-500">
            Projected FP από τα 2025-26 δεδομένα των παικτών κάθε ομάδας· τα budgets είναι δημοσιευμένες εκτιμήσεις.
          </p>
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 10.3: Verify + commit** — Run: `npm run build` (clean; `/roster-race`, `/budgets` listed). Then:
```bash
git add src/app/roster-race src/app/budgets
git commit -m "feat(pages): Roster Race 2026-27 + Budget League"
```

---

### Task 11: Sidebar regroup

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 11.1: Replace the `NAV` constant and the `<nav>` block** in `src/components/Sidebar.tsx`:

Replace the `NAV` array (and extend the lucide import with `Newspaper, HardHat, Wallet`):

```tsx
import {
  LayoutDashboard,
  Users,
  BarChart3,
  LineChart,
  Trophy,
  Shield,
  Gauge,
  Menu,
  X,
  Newspaper,
  HardHat,
  Wallet,
} from "lucide-react";

const NAV: { group: string; items: { href: string; label: string; icon: any }[] }[] = [
  {
    group: "Market",
    items: [
      { href: "/", label: "Lobby", icon: LayoutDashboard },
      { href: "/projections", label: "Projections", icon: LineChart },
      { href: "/value", label: "Value Engine", icon: Gauge },
    ],
  },
  {
    group: "Offseason",
    items: [
      { href: "/rumors", label: "Rumor Mill", icon: Newspaper },
      { href: "/roster-race", label: "Roster Race", icon: HardHat },
      { href: "/budgets", label: "Budgets", icon: Wallet },
    ],
  },
  {
    group: "League",
    items: [
      { href: "/teams", label: "Teams", icon: Shield },
      { href: "/players", label: "Players", icon: Users },
    ],
  },
  {
    group: "",
    items: [
      { href: "/draft", label: "Draft Mode 2026", icon: Trophy },
      { href: "/admin", label: "Admin", icon: BarChart3 },
    ],
  },
];
```

Replace the `<nav>` element with:

```tsx
        <nav className="flex flex-col gap-4">
          {NAV.map(({ group, items }) => (
            <div key={group || "misc"}>
              {group && <div className="section-title mb-1.5 px-3">{group}</div>}
              <div className="flex flex-col gap-1">
                {items.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={clsx(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                      isActive(href)
                        ? "bg-brand-500/15 text-white ring-1 ring-brand-500/30"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                    )}
                  >
                    <Icon size={17} className={isActive(href) ? "text-brand-400" : ""} />
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
```

Also update the bottom season box text to:
```tsx
        <div className="absolute inset-x-4 bottom-4 rounded-xl border border-white/5 bg-white/[0.03] p-3 font-mono text-[10px] text-slate-400">
          <div className="font-bold text-emerald-400">● OFFSEASON 2026-27</div>
          Καθημερινό refresh 06:00 UTC — stats, rosters, news.
        </div>
```

- [ ] **Step 11.2: Verify + commit** — Run: `npm run build` (clean). Then:
```bash
git add src/components/Sidebar.tsx
git commit -m "feat(ui): grouped sidebar nav — Market / Offseason / League"
```

---

### Task 12: New Lobby (Boards First)

**Files:**
- Modify: `src/app/page.tsx` (full rewrite)

- [ ] **Step 12.1: Replace `src/app/page.tsx` with:**

```tsx
import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  getTopByValue,
  getAlerts,
  getDemoUser,
  getWatchlist,
  getNewsItems,
  getRosterRace,
  getValueDeltas,
} from "@/lib/queries";
import { PageHeader } from "@/components/PageHeader";
import { RecBadge, SignalBadge, PosBadge, Meter, valueTone } from "@/components/ui";
import { Ticker, BoardCard, DeltaTag, TickerItem } from "@/components/desk";
import { Bell, Star, TrendingUp, Trophy, Newspaper, HardHat, Wallet } from "lucide-react";
import { TEAM_BUDGETS } from "@/data/budgets";

export const dynamic = "force-dynamic";

const ROSTER_REF = 16;

export default async function LobbyPage() {
  const [market, news, rosterRace, deltas, alerts, demo] = await Promise.all([
    getTopByValue(15),
    getNewsItems(12),
    getRosterRace(),
    getValueDeltas(),
    getAlerts(6),
    getDemoUser(),
  ]);
  const watchlist = demo ? await getWatchlist(demo.id) : [];

  // Ticker: news + roster meta item.
  const signedTotal = rosterRace.reduce((s, t) => s + t.entries.length, 0);
  const tickerItems: TickerItem[] = [
    ...news.map((n) => ({
      id: n.id,
      kind: (n.kind === "official" || n.kind === "rumor" ? n.kind : "news") as TickerItem["kind"],
      text:
        n.kind === "rumor"
          ? `${n.title.toUpperCase().slice(0, 70)} [${n.confidence}%]`
          : n.title.toUpperCase().slice(0, 70),
      href: n.url,
    })),
    { id: "meta-rosters", kind: "meta", text: `ROSTERS 2026-27: ${signedTotal}/${20 * ROSTER_REF} SIGNED` },
  ];

  // Board stats.
  const rumors = news.filter((n) => n.kind === "rumor");
  const activeRumors = await prisma.newsItem.count({ where: { kind: "rumor" } });
  const leader = rosterRace[0];
  const laggard = rosterRace[rosterRace.length - 1];
  const topBudget = TEAM_BUDGETS[0];
  const avgBudget = Math.round(TEAM_BUDGETS.reduce((s, b) => s + b.budgetMEur, 0) / TEAM_BUDGETS.length);
  const moverEntries = [...deltas.entries()].filter(([, d]) => Math.abs(d) >= 2);
  const topRiser = moverEntries.sort((a, b) => b[1] - a[1])[0];
  const topRiserPlayer = topRiser ? market.find((p) => p.id === topRiser[0]) : undefined;

  return (
    <>
      <PageHeader
        title="Lobby"
        status="● LIVE · OFFSEASON 2026-27"
        subtitle="Το trading desk του fantasy manager — αγορά, φήμες, ρόστερ και budgets σε μία οθόνη."
        action={
          <Link href="/draft" className="btn-primary">
            <Trophy size={16} /> Draft Mode 2026
          </Link>
        }
      />

      <Ticker items={tickerItems} />

      {/* Boards */}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <BoardCard
          href="/rumors"
          tint="amber"
          icon={<Newspaper size={13} />}
          title="RUMOR MILL"
          stat={activeRumors}
          sub={rumors[0] ? `top: ${rumors[0].title.slice(0, 40)}…` : "καμία ενεργή φήμη"}
        />
        <BoardCard
          href="/roster-race"
          tint="sky"
          icon={<HardHat size={13} />}
          title="ROSTER RACE"
          stat={
            <>
              {signedTotal}
              <span className="text-sm text-slate-500">/{20 * ROSTER_REF}</span>
            </>
          }
          sub={leader ? `leader: ${leader.teamCode} ${leader.entries.length} · τελευταία: ${laggard.teamCode} ${laggard.entries.length}` : "—"}
        />
        <BoardCard
          href="/budgets"
          tint="violet"
          icon={<Wallet size={13} />}
          title="BUDGET LEAGUE"
          stat={`€${topBudget.budgetMEur}M`}
          sub={`top: ${topBudget.code} · μ.ο. €${avgBudget}M`}
        />
        <BoardCard
          href="/projections"
          tint="green"
          icon={<TrendingUp size={13} />}
          title="MOVERS"
          stat={`▲ ${moverEntries.length}`}
          sub={topRiserPlayer ? `riser: ${topRiserPlayer.name}` : "value shifts vs χθες"}
        />
      </div>

      {/* The Market */}
      <section className="card card-pad mb-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <TrendingUp size={16} className="text-brand-400" /> The Market — Top Value
          </h2>
          <Link href="/projections" className="font-mono text-xs font-semibold text-brand-400 hover:underline">
            FULL BOARD →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-white/5">
                <th className="th">#</th>
                <th className="th">Asset</th>
                <th className="th">Pos</th>
                <th className="th text-right">Price</th>
                <th className="th text-right">Proj FP</th>
                <th className="th text-right">FP/cr</th>
                <th className="th w-28">Value</th>
                <th className="th text-right">Δ</th>
                <th className="th">Signal</th>
                <th className="th">Rec</th>
              </tr>
            </thead>
            <tbody>
              {market.map((p, i) => (
                <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="td stat text-slate-500">{i + 1}</td>
                  <td className="td">
                    <Link href={`/players/${p.id}`} className="stat font-bold text-white hover:text-brand-400">
                      {p.lastName.toUpperCase()}
                      <span className="text-slate-500">.{p.teamShort ?? "FA"}</span>
                    </Link>
                  </td>
                  <td className="td"><PosBadge pos={p.position} /></td>
                  <td className="td stat text-right">{p.fantasyPrice.toFixed(1)}</td>
                  <td className="td stat text-right font-bold text-white">{p.proj?.projFantasyPoints.toFixed(1)}</td>
                  <td className="td stat text-right">{p.proj?.pointsPerCredit.toFixed(1)}</td>
                  <td className="td"><Meter value={p.proj?.valueScore ?? 0} tone={valueTone(p.proj?.valueScore ?? 0)} /></td>
                  <td className="td text-right"><DeltaTag delta={deltas.get(p.id)} /></td>
                  <td className="td"><SignalBadge signal={p.proj?.signal} /></td>
                  <td className="td"><RecBadge rec={p.proj?.recommendation} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Alerts + Watchlist */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="card card-pad">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <Bell size={16} className="text-amber-400" /> Fantasy Alerts
          </h2>
          <ul className="space-y-3">
            {alerts.length === 0 && <li className="text-sm text-slate-500">Κανένα alert.</li>}
            {alerts.map((a) => (
              <li key={a.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{a.title}</span>
                </div>
                {a.body && <p className="mt-1 text-xs leading-relaxed text-slate-400">{a.body}</p>}
                {a.player && (
                  <Link href={`/players/${a.playerId}`} className="mt-1 inline-block font-mono text-[11px] font-semibold text-brand-400 hover:underline">
                    {a.player.firstName} {a.player.lastName} →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="card card-pad">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
            <Star size={16} className="text-amber-400" /> Watchlist
            {demo && <span className="text-xs font-normal text-slate-500">({demo.name})</span>}
          </h2>
          <ul className="space-y-2">
            {watchlist.length === 0 && <li className="text-sm text-slate-500">Άδειο watchlist.</li>}
            {watchlist.map(({ player }) => (
              <li key={player.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.02] px-3 py-2">
                <Link href={`/players/${player.id}`} className="text-sm font-semibold text-white hover:text-brand-400">
                  {player.name}
                </Link>
                <div className="flex items-center gap-2">
                  <span className="stat text-xs text-slate-400">{player.proj?.projFantasyPoints.toFixed(1)} FP</span>
                  <SignalBadge signal={player.proj?.signal} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
```

- [ ] **Step 12.2: Verify + commit** — Run: `npm run build` (clean). Then:
```bash
git add src/app/page.tsx
git commit -m "feat(lobby): Boards First lobby — ticker, boards, The Market with deltas"
```

---

### Task 13: Full verification + visual review

**Files:** none new (fix-ups only if regressions found)

- [ ] **Step 13.1: Full data refresh** — Run: `npm run db:ingest` (expect all four steps to log OK; slow from local ↔ Neon, run in background if needed).

- [ ] **Step 13.2: Route check** — Start `npm run dev` (note the port), then:
```bash
node -e '
const B="http://localhost:3000"; // adjust port
const paths=["/","/teams","/players","/projections","/value","/draft","/admin","/rumors","/roster-race","/budgets"];
(async()=>{for(const p of paths){const r=await fetch(B+p);console.log(r.status+"  "+p);}})();
'
```
Expected: all `200`.

- [ ] **Step 13.3: Tests + build** — Run: `npm test` (all pass) and `npm run build` (clean).

- [ ] **Step 13.4: Visual review** — use the playwright-skill to screenshot `/`, `/rumors`, `/roster-race`, `/budgets`, `/players`, `/draft` at 1440px and review: mono numerals render, ticker scrolls, tints correct, existing pages didn't break. Fix any regressions (small class edits), re-screenshot.

- [ ] **Step 13.5: Final commit**
```bash
git add -A
git commit -m "chore: trading-desk redesign verification fixes"
```

---

## Self-Review Notes

- **Spec coverage:** tokens/fonts (T1), desk components (T2), shared restyle (T3), models (T4), scraper+classification+matching (T5), roster ingest+status (T6), cron chaining (T7), budgets+queries (T8), /rumors (T9), /roster-race + /budgets (T10), sidebar groups (T11), lobby Boards First + ticker + market deltas (T12), verification incl. Playwright (T13). Spec's "SignalChip" → restyled `SignalBadge` (noted in conventions). Spec's KPI-row removal → lobby rewrite (T12) drops it.
- **Type consistency:** `TickerItem`, `RumorRow`, `RosterRaceTeam`, `getValueDeltas(): Map<string,number>` used consistently across T2/T8/T9/T10/T12. `seasonLabel`, `getJson`, `splitStatsName` referenced in T6 exist in `ingest.ts`/`names.ts`.
- **Push:** not included in any task — user pushes on request per repo convention.
