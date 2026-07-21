# EuroLeague Lobby — Fantasy & Draft 2026

A premium, dark-themed **EuroLeague fantasy analytics platform** for the 2025-26
season: rosters, transfers, last-season stats, a transparent **projection
engine**, a **fantasy value engine**, and a fully working **live snake Draft Mode
2026** — all in one runnable Next.js app.

Built to be useful *now* (June, rosters in flux) and designed to be **fed
continuously** with real box scores during the season.

---

## ✨ Features

| Section | What it does |
|---|---|
| **Lobby / Dashboard** (`/`) | News-style feed: roster moves, transfers, free agents (χωρίς ομάδα), fantasy alerts, watchlist, top-projected-value ranking. |
| **Teams** (`/teams`, `/teams/[id]`) | Every club: roster, depth chart per position, coach, playstyle, pace, off/def rating, and **what each defense allows** (matchup engine → fantasy-friendly / unfriendly). |
| **Players** (`/players`) | Last-season per-game stats (PTS/REB/AST/STL/BLK/TO/MIN/USG/PIR/FP), fantasy price, value-per-credit. Sortable + filter by team, position, price. |
| **Player Analysis** (`/players/[id]`) | Profile, career stats, team history, role, **positional competition**, teammates eating usage, injury history, consistency/upside/risk, projection radar, buy/sell/hold + avoid/watch/value/premium verdict. |
| **Projections** (`/projections`) | Forward-looking 2025-26 line for every player from the projection engine. |
| **Fantasy Value Engine** (`/value`) | Value score, FP/credit, risk-adjusted value, upside, consistency, ownership prediction, buy/sell/hold. |
| **Draft Mode 2026** (`/draft`) | Create room → order lottery → snake draft with per-pick **timer**, **on-the-clock**, **auto-pick**, **queue**, **best-available / best-fit / upside / safe / avoid** lenses, draft board, roster-need warnings, undo, pause/resume, and **post-draft grades + team comparison**. |
| **Admin** (`/admin`) | Add/edit players, change team/role/price/status, **CSV/JSON import**, manual projection override, **recalculate projections**, manage draft rooms. |

---

## 🧱 Tech Stack

- **Next.js 14** (App Router, RSC) + **TypeScript**
- **Prisma** ORM + **SQLite** (zero-config local; schema is **PostgreSQL-ready**)
- **Tailwind CSS** (dark, EuroLeague-inspired theme)
- **Recharts** (radar + bar charts)
- API-first: all mutations go through `/api/*` route handlers

> Chosen for a **runnable MVP with no external services**. To go production:
> switch Prisma `provider` to `postgresql`, add Redis for caching/draft pub-sub,
> and a Socket.io/Pusher layer for realtime draft (currently client polling).

---

## 🚀 Getting Started

```bash
# 1. Install
npm install

# 2. Create the SQLite DB, generate client, and seed realistic data
npm run setup           # = prisma generate && prisma db push && tsx prisma/seed.ts

# 3. Run
npm run dev             # http://localhost:3000
```

Useful scripts:

```bash
npm run db:seed         # reseed only
npm run db:reset        # wipe + recreate + reseed
npm run build && npm start
```

The seed creates **18 EuroLeague teams**, **87 players** (real names + realistic
last-season lines), computed projections + value, roster moves, injuries,
fantasy alerts, a demo watchlist, and a demo draft room.

Demo accounts (no auth wall in the MVP):
- `admin@euroleaguelobby.dev` (admin) · `demo@euroleaguelobby.dev` (manager / "You")

---

## 📁 Project Structure

```
prisma/
  schema.prisma        # full data model (SQLite now, Postgres-ready)
  seed.ts              # seeds DB + computes projections via the engines
src/
  app/                 # pages (RSC) + /api route handlers
  components/          # UI primitives, PlayerExplorer, charts, Sidebar, AdminPanel, draft board
  data/seed-data.ts    # teams + players source data
  lib/
    types.ts           # domain types + fantasy scoring
    projection.ts      # ▶ Projection Engine
    value.ts           # ▶ Fantasy Value Engine
    matchup.ts         # ▶ Matchup Engine (what a defense allows)
    learning.ts        # ▶ Continuous-learning blending (live box scores)
    context.ts         # depth-chart → usage share / positional competition
    recompute.ts       # single-player compute (seed + admin share this)
    recomputeAll.ts    # recompute every projection from DB
    draft.ts           # pure snake/roster/advice/grade logic
    draftServer.ts     # DB-backed draft orchestration
    queries.ts         # read-side DTO shaping
docs/
  PRODUCT_SPEC.md  SCHEMA.md  API.md  ENGINES.md
```

See **`docs/`** for the full product spec, database schema reference, API
reference, and engine logic.
