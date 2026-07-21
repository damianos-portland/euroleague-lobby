# Database Schema

Source of truth: [`prisma/schema.prisma`](../prisma/schema.prisma). Provider is
**SQLite** for zero-config dev; the model is **PostgreSQL-compatible**. To migrate:
set `provider = "postgresql"` + `DATABASE_URL`, optionally promote the documented
string "enum" fields to native enums, then `prisma migrate`.

## Entity overview

```
User ──< WatchlistItem >── Player
User ──< DraftParticipant >── DraftRoom
Team ──< Player ──1:1── Projection
Player ──< PlayerSeasonStat
Player ──< BoxScore            (continuous-learning ingest target)
Player ──< InjuryEvent
Player ──< RosterMove >── Team (from / to)
Player ──< FantasyAlert
DraftRoom ──< DraftParticipant ──< DraftPick >── Player
DraftRoom ──< DraftQueueItem >── Player
```

## Models

### User
`id, email (unique), name, role ("user"|"admin"), createdAt`
Relations: watchlist, draft participants, owned draft rooms.

### Team
Identity: `name, shortName, city, country, colorPrimary, colorSecondary, coach`.
Scheme: `playstyle, pace, offRating, defRating`.
**Allows to opponents:** `reboundsAllowed, assistsAllowed, turnoversForced,
pointsAllowed, threePtAllowed`, plus derived `fantasyFriendliness` (0-100).

### Player
`firstName, lastName, position (PG|SG|SF|PF|C), nationality, age, heightCm?`.
`teamId?` — **nullable ⇒ free agent (χωρίς ομάδα)**.
`status` ("signed"|"rumored"|"free_agent"|"injured"|"departing"),
`depthRole` ("starter"|"rotation"|"bench"|"deep_bench"|"unknown"),
`fantasyPrice`, `tags` (comma-separated archetypes).
Indexed on `teamId`, `position`, `status` for fast filtering.

### PlayerSeasonStat
Per player per `season` (unique `[playerId, season]`): `games, minutes, points,
rebounds, assists, steals, blocks, turnovers, usage, pir, fantasyPoints, fpStdev`
(volatility for consistency), plus `teamSnapshot` (survives transfers).

### Projection (1:1 with Player)
Projected line: `projMinutes/Usage/Points/Rebounds/Assists/Steals/Blocks/
Turnovers/Pir/FantasyPoints`. Value-engine outputs: `valueScore, pointsPerCredit,
riskAdjustedValue, upsideScore, consistencyScore, injuryRisk, ownershipPrediction`.
Decisions: `recommendation` (avoid|watchlist|value_pick|premium_pick), `signal`
(buy|sell|hold), `rationale`, `projectedRole`, `season`, `computedAt`.

### RosterMove
Transfer/signing log: `type (signing|transfer|release|rumor|extension),
fromTeamId?, toTeamId?, note, reliability (confirmed|reliable|rumor), occurredAt`.
Drives the lobby "recent transfers / changed team / free agents" feeds.

### InjuryEvent
`severity (minor|moderate|major), description, status (out|doubtful|questionable|
probable|recovered), expectedReturn?, occurredAt`.

### FantasyAlert
Lobby feed item: `kind (price_change|role_change|injury|breakout|transfer|
buy_low|sell_high), severity (info|warning|critical), title, body, playerId?`.

### WatchlistItem
`[userId, playerId]` unique + note.

### BoxScore — continuous learning ingest
Per game per player: `season, round, opponent, minutes, points, rebounds, assists,
steals, blocks, turnovers, pir, fantasyPoints, playedAt`. Aggregated by
`lib/learning.ts` and blended into projections (confidence grows with games).

### Draft models
- **DraftRoom** — `name, ownerId, status (lobby|drafting|paused|complete),
  draftType ("snake"), rounds, pickSeconds, rosterSlots (template string),
  currentPickIndex (0-based overall), season`.
- **DraftParticipant** — `roomId, userId?, teamName, draftOrder (post-lottery,
  0-based), isAutopick`.
- **DraftPick** — `roomId, participantId, playerId, overall, round, pickInRound,
  auto`. Unique `[roomId, overall]` and `[roomId, playerId]` (no dupes).
- **DraftQueueItem** — per-participant ranked queue; unique `[participantId, playerId]`.

## Notes on portability
- SQLite has no native enums/arrays → enums are strings (documented inline) and
  list-like fields are comma-separated. On Postgres these can become real enums.
- All money/stat numbers are `Float`; counts are `Int`.
- `onDelete: Cascade` is set on child rows so deleting a player/room cleans up.
