// ---------------------------------------------------------------------------
// Scout "Predictions" engine — forecasts a player's expected fantasy points and
// credit range over the next 3 / 5 / 10 games, using the real schedule + each
// opponent's fantasy-friendliness (how much FFP they concede).
//
// Two transparent models the user can toggle per player:
//   • elastic (normal)  — optimistic: wide matchup swing (±20%), slight ceiling
//     tilt, wide credit range.
//   • strict            — conservative: muted matchup (±8%), slight floor tilt,
//     tight credit range.
//
// Credit dynamics are heuristic: the official formula isn't published, only the
// mechanism (score vs current value; cheaper players move more per game).
// ---------------------------------------------------------------------------

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const FAIR_PPC = 1.2; // FP-per-credit a player must roughly hit to hold value

export type PredictModel = "elastic" | "strict";

export interface Fixture {
  round: number;
  date: string; // ISO
  homeCode: string;
  awayCode: string;
}

export interface GameForecast {
  round: number;
  date: string;
  opponent: string; // opponent code
  home: boolean;
  expFFP: number;
}

export interface PlayerForecast {
  games: GameForecast[]; // up to 10 upcoming
  avg: { g3: number; g5: number; g10: number }; // mean expected FFP
  credit: {
    current: number;
    g3: [number, number];
    g5: [number, number];
    g10: [number, number];
  };
}

function matchupMult(oppFriendliness: number, home: boolean, model: PredictModel): number {
  const swing = model === "elastic" ? 0.2 : 0.08;
  const homeAdj = (home ? 1 : -1) * (model === "elastic" ? 0.03 : 0.015);
  const m = 1 + ((oppFriendliness - 50) / 50) * swing + homeAdj;
  return clamp(m, 0.6, 1.5);
}

// Per-game expected credit change. Beat your implied score (credit × fair) →
// gain; miss → lose. Cheaper players swing more; capped per game.
function creditDrift(expFFP: number, credit: number, model: PredictModel): number {
  const implied = Math.max(credit * FAIR_PPC, 1);
  const rel = (expFFP - implied) / implied;
  const sensitivity = (model === "elastic" ? 0.9 : 0.5) * (10 / Math.max(credit, 4));
  const cap = model === "elastic" ? 0.8 : 0.4;
  return clamp(rel * sensitivity, -cap, cap);
}

/**
 * Forecast one player.
 * @param teamCode      player's team code (matches fixture home/away codes)
 * @param baseFP        per-game projected fantasy points
 * @param credit        current fantasy credit
 * @param fixtures      ALL season fixtures
 * @param friendliness  map: teamCode → fantasyFriendliness (0-100)
 * @param nowMs         "now" epoch ms (upcoming = date >= now)
 */
export function forecastPlayer(
  teamCode: string,
  baseFP: number,
  credit: number,
  fixtures: Fixture[],
  friendliness: Record<string, number>,
  model: PredictModel,
  nowMs: number
): PlayerForecast {
  const code = teamCode.toUpperCase();
  const tilt = model === "elastic" ? 1.03 : 0.97;

  const upcoming = fixtures
    .filter((f) => f.homeCode.toUpperCase() === code || f.awayCode.toUpperCase() === code)
    .filter((f) => new Date(f.date).getTime() >= nowMs)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 10);

  const games: GameForecast[] = upcoming.map((f) => {
    const home = f.homeCode.toUpperCase() === code;
    const opp = (home ? f.awayCode : f.homeCode).toUpperCase();
    const oppFr = friendliness[opp] ?? 50;
    const expFFP = r1(baseFP * tilt * matchupMult(oppFr, home, model));
    return { round: f.round, date: f.date, opponent: opp, home, expFFP };
  });

  const meanOf = (n: number) => {
    const slice = games.slice(0, n);
    if (!slice.length) return 0;
    return r1(slice.reduce((s, g) => s + g.expFFP, 0) / slice.length);
  };

  // Credit range: cumulative expected drift ± an uncertainty band (grows √N).
  const perStd = model === "elastic" ? 0.45 : 0.22;
  const rangeAt = (n: number): [number, number] => {
    let central = credit;
    for (let i = 0; i < Math.min(n, games.length); i++) central += creditDrift(games[i].expFFP, credit, model);
    const band = perStd * Math.sqrt(Math.max(1, Math.min(n, games.length || 1)));
    return [Math.max(1, r1(central - band)), r1(central + band)];
  };

  return {
    games,
    avg: { g3: meanOf(3), g5: meanOf(5), g10: meanOf(10) },
    credit: { current: credit, g3: rangeAt(3), g5: rangeAt(5), g10: rangeAt(10) },
  };
}
