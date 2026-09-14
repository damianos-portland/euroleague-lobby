// ---------------------------------------------------------------------------
// Friendly-match simulation engine (server-only). Given two 5+5 lineups, it
// generates a full possession-by-possession play-by-play with a real-time
// offset per event, so both clients can play the game back synchronized to a
// shared startedAt and it lasts ~5+ real minutes. Also produces the box score,
// final score, per-side fantasy points (PIR) and the MVP.
// ---------------------------------------------------------------------------

import { fantasyBucket, FantasyBucket } from "./draft";

export const MATCH_DURATION_MS = 330_000; // ~5.5 minutes of playback
const POSSESSIONS = 136; // ~68 per team over a 40' game
const PACE_MS = MATCH_DURATION_MS / POSSESSIONS;
export const STARTER_QUOTA: Record<FantasyBucket, number> = { G: 2, F: 2, C: 1 };
export const BENCH_COUNT = 5;

export type Side = "home" | "away";

export interface LineupJSON {
  starters: string[]; // 5 player ids
  bench: string[]; // 5 player ids
}

export interface SimPlayerInput {
  id: string;
  name: string;
  position: string;
  projFantasyPoints: number;
  projUsage: number;
  projMinutes: number;
}

interface SimP {
  id: string;
  name: string;
  bucket: FantasyBucket;
  starter: boolean;
  weight: number; // possession-usage weight
  skill: number; // 0..1
  reboundW: number; // rebounding weight (bigs grab more)
  side: Side;
}

export interface TimelineEvent {
  offsetMs: number;
  clock: string; // "Q2 6:12"
  side: Side;
  playerId: string;
  kind: "make2" | "make3" | "ft" | "miss" | "block" | "turnover" | "steal" | "rebound";
  pts: number;
  homeScore: number;
  awayScore: number;
  text: string;
}

export interface BoxLine {
  playerId: string;
  name: string;
  side: Side;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  fp: number; // PIR
}

export interface MatchTimeline {
  durationMs: number;
  events: TimelineEvent[];
  final: { home: number; away: number };
  fp: { home: number; away: number };
  box: BoxLine[];
  mvpPlayerId: string | null;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

// Weighted random selection from a list of {item, w}.
function weighted<T>(items: { item: T; w: number }[]): T {
  const total = items.reduce((s, x) => s + x.w, 0) || 1;
  let r = Math.random() * total;
  for (const x of items) {
    r -= x.w;
    if (r <= 0) return x.item;
  }
  return items[items.length - 1].item;
}

function toSimPlayers(lineup: SimPlayerInput[], starters: Set<string>, side: Side): SimP[] {
  return lineup.map((p) => {
    const bucket = fantasyBucket(p.position as any);
    const starter = starters.has(p.id);
    const skill = clamp(p.projFantasyPoints / 22, 0.32, 1);
    const minW = starter ? 1 : 0.42;
    return {
      id: p.id,
      name: p.name,
      bucket,
      starter,
      weight: minW * (0.55 + (p.projUsage || 18) / 42),
      skill,
      reboundW: (bucket === "C" ? 2.4 : bucket === "F" ? 1.5 : 0.8) * (starter ? 1 : 0.5),
      side,
    };
  });
}

function clockStr(possIdx: number): string {
  const frac = possIdx / POSSESSIONS;
  const quarter = Math.min(4, Math.floor(frac * 4) + 1);
  const secLeftInGame = Math.max(0, 2400 - Math.round(frac * 2400));
  const secInQ = secLeftInGame - (4 - quarter) * 600;
  const m = Math.floor(secInQ / 60);
  const s = secInQ % 60;
  return `Q${quarter} ${m}:${String(s).padStart(2, "0")}`;
}

// Simulate a full friendly. home = challenger, away = opponent.
export function simulateMatch(
  home: SimPlayerInput[],
  away: SimPlayerInput[],
  homeStarters: Set<string>,
  awayStarters: Set<string>
): MatchTimeline {
  const H = toSimPlayers(home, homeStarters, "home");
  const A = toSimPlayers(away, awayStarters, "away");
  const roster: Record<Side, SimP[]> = { home: H, away: A };

  const box = new Map<string, BoxLine>();
  for (const p of [...H, ...A]) {
    box.set(p.id, { playerId: p.id, name: p.name, side: p.side, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, fp: 0 });
  }
  const bump = (id: string, k: keyof Omit<BoxLine, "playerId" | "name" | "side">, n = 1) => {
    const b = box.get(id)!;
    (b[k] as number) += n;
  };
  // PIR delta helpers
  const addFp = (id: string, n: number) => bump(id, "fp", n);

  const events: TimelineEvent[] = [];
  let homeScore = 0;
  let awayScore = 0;

  const shootW = (p: SimP) => ({ item: p, w: p.weight });
  const rebW = (p: SimP) => ({ item: p, w: p.reboundW });

  for (let i = 0; i < POSSESSIONS; i++) {
    const off: Side = i % 2 === 0 ? "home" : "away";
    const def: Side = off === "home" ? "away" : "home";
    const clock = clockStr(i);
    const baseOffset = Math.round(i * PACE_MS + (Math.random() - 0.5) * PACE_MS * 0.4);

    let live = true;
    let cur: Side = off;
    let guard = 0;
    while (live && guard++ < 4) {
      // turnover
      if (Math.random() < 0.115) {
        const tv = weighted(roster[cur].map(shootW));
        bump(tv.id, "to");
        addFp(tv.id, -1);
        let text = `Λάθος ${tv.name}`;
        if (Math.random() < 0.55) {
          const st = weighted(roster[cur === "home" ? "away" : "home"].map(shootW));
          bump(st.id, "stl");
          addFp(st.id, 1);
          text = `Κλέψιμο ${st.name} από ${tv.name}`;
        }
        events.push({ offsetMs: baseOffset, clock, side: cur, playerId: tv.id, kind: "turnover", pts: 0, homeScore, awayScore, text });
        live = false;
        break;
      }

      const shooter = weighted(roster[cur].map(shootW));
      const three = Math.random() < 0.35;
      const makeProb = (three ? 0.345 : 0.535) + (shooter.skill - 0.5) * 0.22;
      const made = Math.random() < makeProb;

      if (made) {
        const pts = three ? 3 : 2;
        if (cur === "home") homeScore += pts;
        else awayScore += pts;
        bump(shooter.id, "pts", pts);
        addFp(shooter.id, pts);
        // assist
        let assistTxt = "";
        if (Math.random() < 0.55) {
          const mates = roster[cur].filter((x) => x.id !== shooter.id).map(shootW);
          const passer = weighted(mates);
          bump(passer.id, "ast");
          addFp(passer.id, 1);
          assistTxt = ` (ασίστ ${passer.name.split(" ").slice(-1)[0]})`;
        }
        events.push({
          offsetMs: baseOffset, clock, side: cur, playerId: shooter.id,
          kind: three ? "make3" : "make2", pts,
          homeScore, awayScore,
          text: `${shooter.name} ${three ? "τρίποντο 🎯" : "καλάθι"}${assistTxt}`,
        });
        // and-1 free throw
        if (Math.random() < 0.07) {
          const ftMade = Math.random() < 0.75 + (shooter.skill - 0.5) * 0.2;
          if (ftMade) {
            if (cur === "home") homeScore += 1;
            else awayScore += 1;
            bump(shooter.id, "pts", 1);
            addFp(shooter.id, 1);
          } else addFp(shooter.id, -1);
          events.push({ offsetMs: baseOffset + 400, clock, side: cur, playerId: shooter.id, kind: "ft", pts: ftMade ? 1 : 0, homeScore, awayScore, text: `${shooter.name} βολή ${ftMade ? "✓" : "✗"} (And-1)` });
        }
        live = false;
      } else {
        // miss — maybe blocked
        addFp(shooter.id, -1);
        let blocked = false;
        if (Math.random() < 0.08) {
          blocked = true;
          const blk = weighted(roster[cur === "home" ? "away" : "home"].map(rebW));
          bump(blk.id, "blk");
          addFp(blk.id, 1);
          events.push({ offsetMs: baseOffset, clock, side: cur, playerId: blk.id, kind: "block", pts: 0, homeScore, awayScore, text: `ΤΑΠΑ ${blk.name}! 🛡️` });
        } else {
          events.push({ offsetMs: baseOffset, clock, side: cur, playerId: shooter.id, kind: "miss", pts: 0, homeScore, awayScore, text: `${shooter.name} άστοχο ${three ? "τρίποντο" : "σουτ"}` });
        }
        // rebound
        const offReb = Math.random() < (blocked ? 0.18 : 0.27);
        const rebSide = offReb ? cur : cur === "home" ? "away" : "home";
        const reb = weighted(roster[rebSide].map(rebW));
        bump(reb.id, "reb");
        addFp(reb.id, 1);
        if (offReb) {
          // offensive board → same team continues (no separate event to keep it snappy)
          continue;
        } else {
          live = false;
        }
      }
    }
  }

  // finalize scores in the last events (recompute homeScore/awayScore already tracked)
  const box2 = [...box.values()];
  const homeFp = box2.filter((b) => b.side === "home").reduce((s, b) => s + b.fp, 0);
  const awayFp = box2.filter((b) => b.side === "away").reduce((s, b) => s + b.fp, 0);
  const mvp = box2.slice().sort((a, b) => b.fp - a.fp)[0] ?? null;

  return {
    durationMs: MATCH_DURATION_MS,
    events,
    final: { home: homeScore, away: awayScore },
    fp: { home: Math.round(homeFp * 10) / 10, away: Math.round(awayFp * 10) / 10 },
    box: box2,
    mvpPlayerId: mvp?.playerId ?? null,
  };
}

// Validate a 5+5 lineup: 5 starters with 2G/2F/1C, 5 bench, 10 distinct ids.
export function validateLineup(
  lineup: LineupJSON,
  bucketOf: (id: string) => FantasyBucket | null
): { ok: true } | { ok: false; error: string } {
  const { starters, bench } = lineup;
  if (!Array.isArray(starters) || starters.length !== 5) return { ok: false, error: "Χρειάζονται 5 βασικοί." };
  if (!Array.isArray(bench) || bench.length !== BENCH_COUNT) return { ok: false, error: "Χρειάζονται 5 παίκτες στον πάγκο." };
  const all = [...starters, ...bench];
  if (new Set(all).size !== 10) return { ok: false, error: "Διπλότυποι παίκτες στη σύνθεση." };
  const counts: Record<FantasyBucket, number> = { G: 0, F: 0, C: 0 };
  for (const id of starters) {
    const b = bucketOf(id);
    if (!b) return { ok: false, error: "Άγνωστος παίκτης στη βασική πεντάδα." };
    counts[b]++;
  }
  if (counts.G !== STARTER_QUOTA.G || counts.F !== STARTER_QUOTA.F || counts.C !== STARTER_QUOTA.C) {
    return { ok: false, error: `Η βασική πεντάδα πρέπει να είναι 2G / 2F / 1C (τώρα ${counts.G}G/${counts.F}F/${counts.C}C).` };
  }
  for (const id of bench) if (!bucketOf(id)) return { ok: false, error: "Άγνωστος παίκτης στον πάγκο." };
  return { ok: true };
}
