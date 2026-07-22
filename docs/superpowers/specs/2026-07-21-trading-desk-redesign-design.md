# Trading Desk Redesign + Offseason Lobby — Design

**Date:** 2026-07-21 · **Status:** Approved by user
**Decisions made visually:** direction = Trading Desk (B) + dark-glass touches (D) + ticker element (A) · lobby layout = "Boards First"

## Goal

Redesign the EuroLeague Lobby frontend (user dislikes the current look) into a
"trading desk" aesthetic, and make the lobby genuinely interesting during the
offseason by surfacing real transfer news, real 2026-27 roster construction,
team budgets, and value movement.

## 1. Design System (applies app-wide)

- **Palette:** keep dark ink base but deepen to `#080b12`; orange only as an
  energy accent (CTAs, active nav). Signals: green BUY / red SELL / slate HOLD;
  amber for rumors. Per-function tints on glass cards: amber=rumors,
  sky=rosters, violet=budgets, green=movers.
- **Typography:** JetBrains Mono (via `next/font/google`) for all numerics,
  tickers, tables; Inter for prose/labels. Expose as CSS vars
  `--font-mono`, `--font-sans`.
- **Cards:** glass — thin `rgba(255,255,255,.07)` border, subtle gradient tint,
  `backdrop-blur`. Replace current `.card` styles in `globals.css`.
- **New shared components** (in `src/components/`):
  - `Ticker` — horizontal auto-scrolling tape of NewsItems + roster-count item.
  - `SignalChip` — BUY/SELL/HOLD chip (replaces SignalBadge visual).
  - `ConfidenceBadge` — ΕΠΙΣΗΜΟ (green) / RUMOR nn% (amber).
  - `ProgressBar` — roster completeness bar.
  - `BoardCard` — clickable glass gateway card (icon, title, big mono stat, sub).
- **Restyle existing shared pieces:** `ui.tsx` badges/meters, `PageHeader`,
  `Sidebar`, `.th/.td/.card/.btn` classes. Existing pages get the new skin via
  these shared pieces + light class touch-ups only (no functional redesign).
- **Sidebar nav regrouped:** MARKET (Lobby, Projections, Value Engine) ·
  OFFSEASON (Rumor Mill, Roster Race, Budgets) · LEAGUE (Teams, Players) ·
  Draft Mode 2026 · Admin. Group labels use `.section-title` style.

## 2. New Lobby (`/`) — "Boards First"

Top to bottom:
1. **Ticker tape** — full-width, top of content: latest NewsItems
   (official + rumor mixed, `publishedAt desc`, limit 12) plus one synthetic
   item "ROSTERS: {signed}/{20×16} SIGNED". Mono font, color-coded
   (green ▲ official, amber ? rumor).
2. **4 BoardCards** (grid, links): Rumor Mill → `/rumors` (count active rumors,
   top rumor) · Roster Race → `/roster-race` (total signed/320, leader, laggard) ·
   Budget League → `/budgets` (top budget, league avg) · Market Movers →
   `/projections` (count of players with |Δ valueScore| ≥ 2 vs yesterday, top
   riser).
3. **The Market** — full-width table: top-15 by valueScore. Columns:
   ASSET (LASTNAME.TEAM mono), Pos, FP proj, FP/credit, Value meter, Δ vs
   yesterday (▲/▼ from ProjectionSnapshot), SignalChip.
4. **Second row (2-col):** Fantasy Alerts (restyled) · Watchlist (restyled).

KPI row and current "recent transfers / free agents" cards are absorbed by the
boards + ticker (transfers now live in NewsItems + Roster Race).

## 3. New Pages

### `/rumors` — Rumor Mill
Feed of NewsItems, newest first. Each row: kind badge (ΕΠΙΣΗΜΟ/RUMOR+confidence),
title (links to source, `target=_blank rel=noopener`), source + relative time,
matched player chip (links to `/players/{id}`) and/or team chip. Filters
(client-side): all / official / rumors; team dropdown. Empty state explains the
feed updates daily at 06:00 UTC.

### `/roster-race` — Roster Race 2026-27
All 20 E2026 clubs as cards, sorted by signed count desc. Each: club name,
ProgressBar (signed/16 reference size), signed list — for each RosterEntry a
status tag: RETURNING (same club as 2025-26) / TRANSFER (was at another EL club;
show `from → to`) / NEW (not in 2025-26 player DB — rookie/NBA/domestic).
When the person matches a DB Player, link to the player page and show their
2025-26 FP. Header stats: total signed, most complete, least complete.

### `/budgets` — Budget League
Static data table (see §4 Budgets): club, budget €M, horizontal bar
(dataviz-consistent), and derived metric **"Proj FP per €M"** = sum of team
projected FP ÷ budget — ranked, framed as "who buys smart". Footnote states
figures are public estimates with source + season.

## 4. Data Layer

### New Prisma models
```prisma
model NewsItem {
  id            String   @id @default(cuid())
  url           String   @unique          // dedupe key
  source        String                    // "eurohoops" | "sportando"
  title         String
  summary       String   @default("")
  publishedAt   DateTime
  kind          String                    // "official" | "rumor" | "news"
  confidence    Int      @default(0)      // 0-100, rumors only
  playerId      String?                   // matched Player
  player        Player?  @relation(fields: [playerId], references: [id], onDelete: SetNull)
  teamCodes     String   @default("")     // comma-separated matched club codes
  createdAt     DateTime @default(now())
  @@index([publishedAt])
  @@index([kind])
}

model RosterEntry {
  id         String  @id @default(cuid())
  season     String                        // "2026-27"
  teamCode   String                        // E2026 club code
  teamName   String
  personCode String
  name       String                        // "Lastname, Firstname" cleaned
  position   String  @default("")          // Guard/Forward/Center or refined
  dorsal     String  @default("")
  status     String  @default("new")       // "returning" | "transfer" | "new"
  playerId   String?                       // matched 2025-26 Player row
  player     Player? @relation(fields: [playerId], references: [id], onDelete: SetNull)
  updatedAt  DateTime @updatedAt
  @@unique([season, teamCode, personCode])
  @@index([season, teamCode])
}

model ProjectionSnapshot {
  id         String @id @default(cuid())
  playerId   String
  player     Player @relation(fields: [playerId], references: [id], onDelete: Cascade)
  date       String                        // "YYYY-MM-DD" (UTC)
  valueScore Float
  projFantasyPoints Float
  @@unique([playerId, date])
  @@index([date])
}
```
(Plus back-relations on `Player`.) Apply with `prisma db push`.

### Rumor scraper (`src/lib/newsScraper.ts`)
- Fetch RSS: Eurohoops `https://www.eurohoops.net/en/feed/` (primary),
  Sportando `https://sportando.basketball/feed/` (secondary). Parse
  `<item>` title/link/description/pubDate with regex (no new deps).
- **Entity matching:** case-insensitive match of Player lastName (+firstName
  when lastName is ambiguous in DB) against title+description; club match via
  alias table (club names, codes, common forms: "Panathinaikos", "Fenerbahce"…).
  Items matching neither a player nor an EL club are stored as kind "news" only
  if they match "EuroLeague"; otherwise skipped.
- **Classification:** official keywords: signs, signed, agrees, officially,
  announces, commits, extends, deal completed. Rumor keywords: reportedly,
  rumor, linked, target, interest, negotiating, close to, frontrunner, eyeing.
  Confidence heuristic (rumor only): base 40; +20 "close to/agreement near";
  +15 "advanced talks/negotiating"; +10 named source outlet in text; −15
  "denied/unlikely". Clamp 10–90.
- Upsert by `url`. Prune: keep newest 500.

### Roster ingest (`ingestRosters()` in `src/lib/ingest.ts`)
For each E2026 club (from feeds `clubs` endpoint): fetch
`clubs/{code}/people`, filter `typeName === "Player"`, upsert RosterEntry by
`[season, teamCode, personCode]`. Status: match name against Player table →
if Player found and their latest `teamSnapshot` equals this club code (club
codes are shared across seasons) → `returning`; found with a different team →
`transfer`; not found → `new`. Season label "2026-27", code `E2026` via env
`EL_NEXT_SEASON_CODE` (default E2026).

### Budgets (static)
`src/data/budgets.ts`: `{ code, name, budgetMEur, source }[]` for the 20 E2026
clubs — published estimates (EuroLeague/press reports), clearly labeled
estimates in UI.

### Snapshots
`snapshotProjections()` — after recompute, upsert one ProjectionSnapshot per
player for today (UTC date string). Movers = join latest date vs previous date.

### Cron (`/api/cron/ingest`)
Sequence: stats refresh (existing) → `ingestRosters()` → `scrapeNews()` →
`snapshotProjections()`. Each step try/catch — one failing step must not kill
the rest; response reports per-step status. Stays within `maxDuration 60`
(Vercel↔Neon same region; per-step query counts are small).

## 5. Verification

- `npm run build` clean; all routes (9 existing + 3 new) return 200.
- Scraper unit-run against live RSS: prints matched/classified items; manual
  spot-check of classifications.
- `npm run db:ingest` end-to-end against Neon (now also rosters+news+snapshot).
- Playwright screenshots of lobby + 3 new pages for visual review.

## Out of Scope (explicit)

- Functional redesign of existing pages (restyle only).
- Rumors section on player detail pages (phase 2).
- Greek RSS sources (their feeds are dead; revisit later).
- Budget admin UI (static file is the source).
