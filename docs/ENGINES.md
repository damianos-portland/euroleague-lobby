# Engine Logic

All engines are **pure, explainable functions** (no DB, no I/O) so they run in the
seed, in API routes, in a cron, or in unit tests identically.

---

## 1. Projection Engine — `src/lib/projection.ts`

`projectPlayer(input) → projected stat line + projectedRole`

**Inputs:** position, age, depthRole, status, fantasyPrice, `changedTeam`,
`positionCompetition`, team context (pace, off/def rating, `availableUsageShare`),
last & prior season lines, injury-risk hint.

**Pipeline (each step is a named multiplier):**
1. **Blend history** — recent season 70% / prior 30% (regression to mean). No
   history ⇒ synthesise a baseline from depth role.
2. **Minutes** — anchor 60% history / 40% role ceiling; reduce for positional
   logjam (`-6%` per competitor), new environment (`×0.95`), free-agent/rumor
   uncertainty (`×0.85`); cap at 34.
3. **Pace & efficiency** — `pace / leaguePace` and `offRating / leagueOff` (clamped).
4. **Usage** — base usage × `availableUsageShare` (from depth chart), new-team dampener.
5. **Age curve** — growth ≤24, peak 25-29, decline 32+.
6. **Per-stat** — scoring scales with minutes×usage×pace×off×age; rebounds/steals/
   blocks with minutes×pace×age; turnovers with minutes×usage.
7. **Fantasy points** — linear scoring (`computeFantasyPoints`): PTS×1 + REB×1 +
   AST×1.5 + STL×2 + BLK×2 − TO×1.
8. **PIR** — history × minutes × pace × age × usage factor.
9. **`projectedRole`** — Greek human-readable summary (minutes tier, usage
   context, positional competition, same/new team).

---

## 2. Fantasy Value Engine — `src/lib/value.ts`

`evaluateValue(input) → value metrics + recommendation + signal + rationale`

- **pointsPerCredit** = projFP / price.
- **valueScore (0-100)** = normalised so a "fair" ~2.2 FP/credit ≈ 55.
- **consistencyScore** = `100 − coefficientOfVariation×140` (from `fpStdev`/mean).
- **injuryRisk** = prior hint + age load (31+ / 34+ penalties).
- **matchup** multiplier from schedule difficulty (`±15%`).
- **upsideScore** = value + projected usage + youth bonus + new-team bonus +
  minutes headroom.
- **riskAdjustedValue** = value × matchup × (1 − injury & inconsistency penalties).
- **ownershipPrediction** = value + capped projFP + premium-price bonus + consistency.
- **recommendation**: `premium_pick` (elite FP, low-ish risk) ·
  `value_pick` (great FP/credit, esp. cheap) · `watchlist` (intriguing/unproven) ·
  `avoid`.
- **signal**: `buy` / `sell` / `hold`.
- **rationale**: one-line explanation shown across the UI.

`riskLevel(injuryRisk, consistency)` → low/medium/high badge.

---

## 3. Matchup Engine — `src/lib/matchup.ts`

Turns what a defense **allows** into a fantasy signal.
- `fantasyFriendliness(profile) → 0-100` (weighted: points 30%, pace 15%, rebounds
  15%, assists 15%, turnovers-forced 15% *inverted*, 3PT 10%). Higher = easier to
  score fantasy points against.
- `gradeFromFriendliness` → smash / good / neutral / tough / fade.
- `difficultyFromFriendliness` feeds the value engine's matchup multiplier.
- `categoryBreakdown` → per-category friendliness for the team page meters.

---

## 4. Continuous Learning — `src/lib/learning.ts`

In-season blending of real production into projections:
- `aggregateBoxScores(boxes)` → per-game line + `fpStdev` (volatility).
- `liveConfidence(games)` → 0 at preseason, ~0.85 by ~20 games.
- `blendWithLive(preseason, live)` → confidence-weighted mix, FP recomputed.
- `detectTrend(recentFp)` → rising / falling / stable (recent vs earlier window),
  used to emit buy-low / sell-high alerts.

---

## 5. Depth-chart Context — `src/lib/context.ts`

`buildTeamContext(roster)` derives, per player:
- **positionCompetition** — players at the same position plausibly ahead (starter/
  rotation, comparable price), capped at 3.
- **availableUsageShare** (~0.85–1.18) — boosted for starters and thin-core teams,
  reduced for crowded positions and star-stacked rosters.

This is what makes a transfer *move the numbers*: change a player's team or role
in Admin, hit **Recalculate**, and minutes/usage/projection shift accordingly.

---

## 6. Draft Logic — `src/lib/draft.ts`

Pure helpers used by both server and board UI:
- `orderIndexForPick(overall, n)` — snake order (reverse on odd rounds).
- `rosterNeeds(template, positions)` / `requiredPositionsRemaining` — slot filling
  (FLEX/BENCH absorb anyone) + gap warnings.
- `advise(available, positions, template, lens)` — best / fit / upside / safe / avoid.
- `autoPick(...)` — best-by-need (BPA) for timeouts/CPU teams.
- `gradeRoster(players)` — A+…D from total projected FP, average value, positional balance.
