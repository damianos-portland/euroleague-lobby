# API Reference

All endpoints are Next.js Route Handlers under `src/app/api`. JSON in/out.
The MVP has no auth wall; `userId`/admin are passed explicitly or resolved from
seed users. Add middleware-based auth before production.

## Read pages
Read screens (Lobby, Teams, Players, Projections, Value, Player detail) are React
Server Components that query the DB directly via `src/lib/queries.ts` — no REST
round-trip needed. The REST API below powers all **mutations** and the **draft**.

---

## Watchlist

### `POST /api/watchlist`
Toggle a player on/off a user's watchlist.
```json
{ "userId": "…", "playerId": "…" }      → { "watched": true|false }
```

---

## Draft

### `GET /api/draft`
List rooms with counts. → `{ rooms: [...] }`

### `POST /api/draft`
Create a room and run the **order lottery** (Fisher-Yates).
```json
{ "name": "My League", "rounds": 10, "pickSeconds": 60,
  "teamNames": ["You","CPU A","CPU B"], "rosterSlots": "PG,SG,SF,PF,C,FLEX,BENCH" }
→ { "roomId": "…" }
```

### `GET /api/draft/{id}?participant={participantId}`
Full draft state: room, participants (roster, queue, needs, grade, onClock),
picks, available players (sorted by projected FP), on-the-clock, round/pick,
totalPicks, complete. With `participant`, also returns `advice`
(best/fit/upside/safe/avoid lists).

### `POST /api/draft/{id}/action`
Consolidated actions; returns the fresh `{ state }`.
```json
{ "action": "start" }
{ "action": "pause" }            { "action": "resume" }
{ "action": "pick",  "playerId": "…" }      // on-the-clock pick
{ "action": "autopick" }                    // BPA-by-need (or queue) for current
{ "action": "undo" }                        // admin: revert last pick
{ "action": "queueAdd",    "participantId": "…", "playerId": "…" }
{ "action": "queueRemove", "participantId": "…", "playerId": "…" }
{ "action": "toggleAutopick", "participantId": "…", "value": true }
```
Validation: rejects picks when not drafting, out-of-turn duplicates, or already-
drafted players.

### `DELETE /api/draft/{id}`
Delete a room (cascades participants/picks/queue).

---

## Admin

### `POST /api/admin/players`
Create a player.
```json
{ "firstName":"…","lastName":"…","position":"SG","teamId":null,
  "age":25,"fantasyPrice":5,"status":"signed","depthRole":"rotation","tags":"" }
```

### `PATCH /api/admin/players/{id}`
Update fields (team/price/role/status/tags…). If `teamId` changes, a `RosterMove`
is logged automatically. Optional `moveNote`.

### `PUT /api/admin/players/{id}`
Manual projection override — body is a partial `Projection` (e.g.
`{ "projFantasyPoints": 18.5, "recommendation": "value_pick" }`).

### `DELETE /api/admin/players/{id}`
Delete a player (cascades stats/projection/etc).

### `POST /api/admin/recalc`
Recompute **all** projections + value from current DB state (projection + value
engines, fresh depth-chart context). → `{ ok, recomputed }`

### `POST /api/admin/import`
Bulk import players (+ optional last-season stat) from CSV or JSON.
```json
{ "format": "csv" | "json", "payload": "…raw text…" }
→ { "created": n, "updated": n, "stats": n }
```
CSV header (any subset): `firstName,lastName,position,nationality,age,teamShort,
status,depthRole,fantasyPrice,tags,season,minutes,points,rebounds,assists,steals,
blocks,turnovers,usage,pir`. Upsert is by `firstName+lastName`. Run
`POST /api/admin/recalc` afterward to project imported players.

---

## Continuous-season ingestion (designed; helpers in `lib/learning.ts`)
The intended weekly loop, ready to wire to a cron:
1. Ingest `BoxScore` rows (new endpoint or import).
2. `aggregateBoxScores()` → live per-game line + volatility.
3. `blendWithLive(preseasonProjection, liveLine)` (confidence ∝ games played).
4. Re-run the value engine; update `Projection`.
5. `detectTrend()` → emit `FantasyAlert`s (rising/falling, buy-low/sell-high).
