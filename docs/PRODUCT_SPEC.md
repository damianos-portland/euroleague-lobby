# EuroLeague Lobby — Product Specification

## 1. Vision
A premium sports-analytics platform that acts as the **EuroLeague Lobby** for
fantasy / draft users for the 2025-26 season. It aggregates players, teams,
fantasy value and performance projections, and prepares the environment for
**Draft Mode 2026**. Because it is June and rosters are still forming, the system
is built around **continuous updates**: every player can change team, status,
role, usage projection and fantasy price at any time.

## 2. Target users & jobs-to-be-done
- **Fantasy manager** — find value picks, track price/role changes, build a watchlist.
- **Drafter** — run/join a live snake draft with timer, advice and grades.
- **Analyst / admin** — keep rosters and stats current, import data, re-run projections.

## 3. Core principles
1. **Explainable, not black-box.** Every projection/value number is produced by
   transparent, named multipliers (see `docs/ENGINES.md`) so a rationale string
   can be shown in the UI.
2. **Continuously fed.** Data model + recompute pipeline assume weekly box-score
   ingestion and re-projection.
3. **API-first.** All writes go through `/api/*`; the UI never mutates the DB directly.
4. **Runnable from minute one.** SQLite + seed data; no external services required.

## 4. Feature areas (mapped to the brief)

### 4.1 Home / Lobby Dashboard
Roster news & updates, recent transfers, players who changed team, free agents
(χωρίς ομάδα), fantasy alerts, personal watchlist, and a top-N ranking by
projected value. KPIs for tracked players/teams/moves/free-agents.

### 4.2 Teams
Per team: full roster, **depth chart by position**, coach, playstyle, pace,
offensive & defensive rating, and **what the team allows opponents**
(rebounds/assists/points/3PT allowed, turnovers forced) → a **fantasy-friendly /
unfriendly matchup** grade and per-category breakdown.

### 4.3 Players Stats
Previous-season per-game stats: points, rebounds, assists, steals, blocks,
turnovers, minutes, usage, PIR, fantasy points, fantasy price, value-per-credit,
team, position. Filters: team, position, name, price range, value.

### 4.4 Player Analysis
Per-player page: profile, last-season stats, team history, role on previous team,
likely role on new team, positional competition, teammates that affect usage,
injury history, consistency, upside, risk level, and a fantasy recommendation
(avoid / watchlist / value pick / premium pick). Search by name/team/position/status.

### 4.5 Player Projection
For each player, projected minutes/usage/points/rebounds/assists/steals/blocks/
turnovers/PIR/fantasy points and value vs price — considering new team,
playstyle, pace, available usage, teammates, roster depth, role, coach, last-season
stats, change of environment, and likely playing time.

### 4.6 Draft Mode 2026
Create draft room; number of participants; team/user names; order lottery; snake
selection; per-pick timer; on-the-clock indicator; available & drafted players;
roster per user; covered positions; **warnings on positional gaps**; auto-pick on
timeout; draft history; admin undo; pause/resume; notes; draft board view;
ranking by projected value; filters. **Extras:** pre-draft rankings, personal
watchlist, per-user queue, best-available / best-fit / highest-upside / safe /
avoid lenses, post-draft grade per team, and team comparison.

### 4.7 Fantasy Value Engine
Computes value from fantasy price, projected fantasy points, consistency, matchup
difficulty, minutes stability, usage trend, team role and injury risk. Surfaces:
value score, points-per-credit, risk-adjusted value, upside score, ownership
prediction, buy/sell/hold.

### 4.8 Continuous Learning / Season Updates
Architecture for ingesting new box scores, updating player & team stats, roster
& injury changes, fantasy-price changes, projection recalculation, matchup-based
recommendations and trend detection. Each week the system blends live production
with the preseason projection (confidence grows with sample size).

### 4.9 Admin Panel
Add/edit players, change team/price/projected role/status, update rosters, import
CSV/JSON, manual projection edits, recalculation, and draft-room management.

## 5. Non-functional
- Responsive, dark mode, fast (RSC + indexed queries).
- Clean, extensible, typed code; engines isolated as pure functions and unit-friendly.

## 6. Roadmap beyond the MVP
- Auth (email / Google) + per-user persistence.
- Realtime draft via WebSockets (replace polling); Redis pub/sub + cache.
- Real data ingestion (Apify/official feeds) into the existing import pipeline.
- Postgres migration (provider switch + enums).
- ML-tuned projection weights trained on historical box scores.
