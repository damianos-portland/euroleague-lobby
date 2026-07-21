// ---------------------------------------------------------------------------
// Realistic seed data for the EuroLeague Lobby (2025-26 preseason snapshot).
// Rosters in June are fluid by design — `status` and roster moves model that.
// Stats are representative per-game lines from the previous season(s).
// ---------------------------------------------------------------------------

import { computeFantasyPoints, Position } from "@/lib/types";

export interface SeedStat {
  season: string;
  teamSnapshot?: string;
  games: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  usage: number;
  pir: number;
  fantasyPoints: number;
  fpStdev: number;
}

export interface SeedPlayer {
  firstName: string;
  lastName: string;
  position: Position;
  nationality: string;
  age: number;
  heightCm?: number;
  teamShort: string | null;
  status: "signed" | "rumored" | "free_agent" | "injured" | "departing";
  depthRole: "starter" | "rotation" | "bench" | "deep_bench" | "unknown";
  fantasyPrice: number;
  tags: string;
  injuryRiskHint?: number;
  changedTeam?: boolean;
  last?: SeedStat;
  prior?: SeedStat;
}

export interface SeedTeam {
  name: string;
  shortName: string;
  city: string;
  country: string;
  colorPrimary: string;
  colorSecondary: string;
  coach: string;
  playstyle: string;
  pace: number;
  offRating: number;
  defRating: number;
  reboundsAllowed: number;
  assistsAllowed: number;
  turnoversForced: number;
  pointsAllowed: number;
  threePtAllowed: number;
}

// Stat-line builder: m=min, p,r,a,s,b,to per game, usage%, pir; cv = coeff of variation.
function S(
  season: string,
  team: string,
  games: number,
  m: number,
  p: number,
  r: number,
  a: number,
  s: number,
  b: number,
  to: number,
  usage: number,
  pir: number,
  cv = 0.34
): SeedStat {
  const fp = computeFantasyPoints({
    points: p,
    rebounds: r,
    assists: a,
    steals: s,
    blocks: b,
    turnovers: to,
  });
  return {
    season,
    teamSnapshot: team,
    games,
    minutes: m,
    points: p,
    rebounds: r,
    assists: a,
    steals: s,
    blocks: b,
    turnovers: to,
    usage,
    pir,
    fantasyPoints: Math.round(fp * 10) / 10,
    fpStdev: Math.round(fp * cv * 10) / 10,
  };
}

export const TEAMS: SeedTeam[] = [
  {
    name: "Real Madrid", shortName: "RMB", city: "Madrid", country: "Spain",
    colorPrimary: "#ffffff", colorSecondary: "#0b1f4d", coach: "Chus Mateo",
    playstyle: "Talent-heavy iso + transition, deep rotation",
    pace: 73.5, offRating: 116, defRating: 106,
    reboundsAllowed: 31.5, assistsAllowed: 16.2, turnoversForced: 13.8, pointsAllowed: 78.5, threePtAllowed: 8.9,
  },
  {
    name: "FC Barcelona", shortName: "BAR", city: "Barcelona", country: "Spain",
    colorPrimary: "#a50044", colorSecondary: "#004d98", coach: "Joan Peñarroya",
    playstyle: "Motion offense, high-IQ ball movement",
    pace: 71.0, offRating: 113, defRating: 107,
    reboundsAllowed: 32.0, assistsAllowed: 16.8, turnoversForced: 12.9, pointsAllowed: 79.4, threePtAllowed: 9.2,
  },
  {
    name: "Panathinaikos AKTOR", shortName: "PAO", city: "Athens", country: "Greece",
    colorPrimary: "#0a7d34", colorSecondary: "#0b0f1c", coach: "Ergin Ataman",
    playstyle: "Up-tempo, guard-driven pick-and-roll, attack the rim",
    pace: 75.5, offRating: 117, defRating: 108,
    reboundsAllowed: 33.4, assistsAllowed: 17.1, turnoversForced: 12.4, pointsAllowed: 82.1, threePtAllowed: 9.6,
  },
  {
    name: "Olympiacos", shortName: "OLY", city: "Piraeus", country: "Greece",
    colorPrimary: "#d11f2a", colorSecondary: "#ffffff", coach: "Georgios Bartzokas",
    playstyle: "Half-court grind, elite defense, offensive rebounding",
    pace: 69.5, offRating: 112, defRating: 102,
    reboundsAllowed: 30.2, assistsAllowed: 15.4, turnoversForced: 14.6, pointsAllowed: 76.3, threePtAllowed: 8.2,
  },
  {
    name: "Fenerbahçe Beko", shortName: "FEN", city: "Istanbul", country: "Turkey",
    colorPrimary: "#fff200", colorSecondary: "#001a4b", coach: "Šarūnas Jasikevičius",
    playstyle: "Spacing + shooting, switch-heavy defense",
    pace: 72.5, offRating: 115, defRating: 105,
    reboundsAllowed: 31.8, assistsAllowed: 16.0, turnoversForced: 13.2, pointsAllowed: 78.0, threePtAllowed: 8.7,
  },
  {
    name: "Anadolu Efes", shortName: "EFS", city: "Istanbul", country: "Turkey",
    colorPrimary: "#0033a0", colorSecondary: "#ffffff", coach: "Igor Kokoškov",
    playstyle: "Larkin pick-and-roll, pace and space",
    pace: 74.0, offRating: 113, defRating: 109,
    reboundsAllowed: 33.0, assistsAllowed: 17.6, turnoversForced: 12.2, pointsAllowed: 82.6, threePtAllowed: 9.8,
  },
  {
    name: "AS Monaco", shortName: "MON", city: "Monaco", country: "Monaco",
    colorPrimary: "#e2231a", colorSecondary: "#ffffff", coach: "Vassilis Spanoulis",
    playstyle: "Mike James creation, transition, athletic wings",
    pace: 74.8, offRating: 116, defRating: 107,
    reboundsAllowed: 32.6, assistsAllowed: 16.5, turnoversForced: 13.0, pointsAllowed: 81.0, threePtAllowed: 9.3,
  },
  {
    name: "LDLC ASVEL", shortName: "ASV", city: "Villeurbanne", country: "France",
    colorPrimary: "#000000", colorSecondary: "#e30613", coach: "Pierric Poupet",
    playstyle: "Athletic, defense-first, young core",
    pace: 73.0, offRating: 104, defRating: 111,
    reboundsAllowed: 34.2, assistsAllowed: 18.4, turnoversForced: 12.0, pointsAllowed: 84.5, threePtAllowed: 10.1,
  },
  {
    name: "EA7 Emporio Armani Milano", shortName: "MIL", city: "Milan", country: "Italy",
    colorPrimary: "#d2122e", colorSecondary: "#ffffff", coach: "Ettore Messina",
    playstyle: "Veteran half-court execution, balanced scoring",
    pace: 70.5, offRating: 112, defRating: 106,
    reboundsAllowed: 31.6, assistsAllowed: 16.1, turnoversForced: 13.5, pointsAllowed: 78.8, threePtAllowed: 8.8,
  },
  {
    name: "Virtus Bologna", shortName: "VIR", city: "Bologna", country: "Italy",
    colorPrimary: "#000000", colorSecondary: "#ffffff", coach: "Duško Ivanović",
    playstyle: "Defense-first, Cordinier transition, physical",
    pace: 71.5, offRating: 109, defRating: 104,
    reboundsAllowed: 30.8, assistsAllowed: 15.8, turnoversForced: 14.2, pointsAllowed: 77.5, threePtAllowed: 8.5,
  },
  {
    name: "FC Bayern Munich", shortName: "BAY", city: "Munich", country: "Germany",
    colorPrimary: "#dc052d", colorSecondary: "#0066b2", coach: "Gordon Herbert",
    playstyle: "Disciplined, shooting-spaced, deep wing rotation",
    pace: 72.0, offRating: 111, defRating: 107,
    reboundsAllowed: 32.2, assistsAllowed: 16.6, turnoversForced: 13.1, pointsAllowed: 80.2, threePtAllowed: 9.1,
  },
  {
    name: "ALBA Berlin", shortName: "ALB", city: "Berlin", country: "Germany",
    colorPrimary: "#fdb913", colorSecondary: "#003366", coach: "Israel González",
    playstyle: "High-pace motion, lots of cutting, undersized",
    pace: 76.0, offRating: 103, defRating: 113,
    reboundsAllowed: 35.0, assistsAllowed: 19.2, turnoversForced: 11.8, pointsAllowed: 86.4, threePtAllowed: 10.6,
  },
  {
    name: "Žalgiris Kaunas", shortName: "ZAL", city: "Kaunas", country: "Lithuania",
    colorPrimary: "#0a8a3c", colorSecondary: "#ffffff", coach: "Andrea Trinchieri",
    playstyle: "Read-and-react, backdoor cuts, gritty defense",
    pace: 71.0, offRating: 110, defRating: 106,
    reboundsAllowed: 31.4, assistsAllowed: 16.3, turnoversForced: 13.6, pointsAllowed: 78.9, threePtAllowed: 8.9,
  },
  {
    name: "Maccabi Tel Aviv", shortName: "MAC", city: "Tel Aviv", country: "Israel",
    colorPrimary: "#fff200", colorSecondary: "#0033a0", coach: "Oded Kattash",
    playstyle: "Fast, three-happy, guard-heavy",
    pace: 75.0, offRating: 113, defRating: 110,
    reboundsAllowed: 33.6, assistsAllowed: 17.8, turnoversForced: 12.3, pointsAllowed: 83.2, threePtAllowed: 9.9,
  },
  {
    name: "Crvena Zvezda Meridianbet", shortName: "CZV", city: "Belgrade", country: "Serbia",
    colorPrimary: "#d11f2a", colorSecondary: "#ffffff", coach: "Saša Obradović",
    playstyle: "Physical defense, slow tempo, veteran guards",
    pace: 69.0, offRating: 107, defRating: 105,
    reboundsAllowed: 30.6, assistsAllowed: 15.6, turnoversForced: 14.0, pointsAllowed: 77.8, threePtAllowed: 8.6,
  },
  {
    name: "Partizan Mozzart Bet", shortName: "PAR", city: "Belgrade", country: "Serbia",
    colorPrimary: "#000000", colorSecondary: "#ffffff", coach: "Željko Obradović",
    playstyle: "Obradović system, ball movement, hostile crowd energy",
    pace: 73.5, offRating: 111, defRating: 108,
    reboundsAllowed: 32.8, assistsAllowed: 16.9, turnoversForced: 12.8, pointsAllowed: 81.4, threePtAllowed: 9.4,
  },
  {
    name: "Baskonia", shortName: "BKN", city: "Vitoria-Gasteiz", country: "Spain",
    colorPrimary: "#0033a0", colorSecondary: "#d11f2a", coach: "Pablo Laso",
    playstyle: "High-octane Laso offense, run-and-gun, weak rim protection",
    pace: 76.5, offRating: 114, defRating: 112,
    reboundsAllowed: 34.6, assistsAllowed: 18.0, turnoversForced: 12.1, pointsAllowed: 85.1, threePtAllowed: 10.3,
  },
  {
    name: "Paris Basketball", shortName: "PRS", city: "Paris", country: "France",
    colorPrimary: "#0b0f1c", colorSecondary: "#e30613", coach: "Tiago Splitter",
    playstyle: "Hifi-led pace, modern spacing, aggressive switching",
    pace: 77.0, offRating: 113, defRating: 110,
    reboundsAllowed: 34.0, assistsAllowed: 17.4, turnoversForced: 12.6, pointsAllowed: 84.0, threePtAllowed: 10.0,
  },
];

// ---------------------------------------------------------------------------
// Players — marquee + key rotation per club. `changedTeam` marks 2025 offseason
// moves; `status: free_agent` => "χωρίς ομάδα" (teamShort: null).
// ---------------------------------------------------------------------------

export const PLAYERS: SeedPlayer[] = [
  // ---- Real Madrid ----
  P("Facundo", "Campazzo", "PG", "Argentina", 34, "RMB", "starter", 9.0, "playmaker,clutch,high-usage", 18,
    S("2024-25", "RMB", 34, 27, 12.8, 3.0, 6.4, 1.6, 0.1, 2.4, 24, 14.6),
    S("2023-24", "RMB", 33, 26, 11.4, 2.7, 6.0, 1.5, 0.1, 2.2, 23, 13.2)),
  P("Walter", "Tavares", "C", "Cape Verde", 33, "RMB", "starter", 9.5, "rim-protector,elite-defense,double-double", 22,
    S("2024-25", "RMB", 32, 23, 11.6, 7.2, 1.0, 0.4, 2.0, 1.3, 18, 18.9, 0.3),
    S("2023-24", "RMB", 31, 22, 10.8, 6.9, 0.9, 0.5, 1.9, 1.2, 18, 17.8)),
  P("Mario", "Hezonja", "SF", "Croatia", 30, "RMB", "starter", 8.5, "scorer,streaky,high-usage", 16,
    S("2024-25", "RMB", 33, 26, 14.2, 4.3, 2.6, 0.9, 0.3, 1.9, 23, 13.4, 0.4)),
  P("Gabriel", "Deck", "PF", "Argentina", 30, "RMB", "starter", 7.5, "two-way,efficient,connector", 14,
    S("2024-25", "RMB", 31, 24, 11.0, 4.0, 2.1, 1.0, 0.2, 1.4, 18, 12.6, 0.3)),
  P("Dzanan", "Musa", "SG", "Bosnia", 26, "RMB", "rotation", 7.0, "scorer,shot-creator", 15,
    S("2024-25", "RMB", 30, 22, 11.8, 2.6, 2.4, 0.7, 0.1, 1.6, 21, 10.8)),

  // ---- Barcelona ----
  P("Tomas", "Satoransky", "PG", "Czechia", 33, "BAR", "starter", 7.5, "playmaker,connector,low-turnover", 14,
    S("2024-25", "BAR", 32, 25, 8.4, 3.2, 5.6, 1.3, 0.2, 1.7, 18, 12.1, 0.3)),
  P("Jan", "Vesely", "C", "Czechia", 32, "BAR", "starter", 8.5, "roller,double-double,efficient", 19,
    S("2024-25", "BAR", 30, 22, 11.2, 6.0, 1.6, 1.0, 0.7, 1.5, 19, 16.4, 0.32)),
  P("Kevin", "Punter", "SG", "USA", 32, "BAR", "starter", 8.5, "scorer,three-level,high-usage", 16,
    S("2024-25", "BAR", 31, 26, 15.4, 2.4, 2.2, 1.1, 0.1, 1.8, 25, 13.1, 0.4)),
  P("Willy", "Hernangomez", "C", "Spain", 31, "BAR", "rotation", 7.0, "rebounder,efficient-bench", 15,
    S("2024-25", "BAR", 30, 17, 9.6, 5.4, 1.2, 0.6, 0.4, 1.3, 22, 13.8)),
  P("Tornike", "Shengelia", "PF", "Georgia", 33, "BAR", "starter", 8.5, "point-forward,high-usage,foul-prone", 17,
    S("2024-25", "VIR", 30, 25, 13.6, 4.8, 3.4, 1.2, 0.4, 2.2, 24, 16.1, 0.36), undefined, true),

  // ---- Panathinaikos ----
  P("Kendrick", "Nunn", "SG", "USA", 30, "PAO", "starter", 9.5, "elite-scorer,high-usage,clutch", 16,
    S("2024-25", "PAO", 33, 28, 18.6, 2.8, 3.6, 1.2, 0.1, 2.2, 28, 16.8, 0.4),
    S("2023-24", "PAO", 31, 27, 17.2, 2.6, 3.2, 1.1, 0.1, 2.0, 27, 15.4)),
  P("Kostas", "Sloukas", "PG", "Greece", 35, "PAO", "starter", 8.0, "playmaker,clutch,veteran", 16,
    S("2024-25", "PAO", 32, 26, 11.4, 2.4, 6.0, 0.9, 0.1, 2.0, 22, 13.6, 0.32)),
  P("Mathias", "Lessort", "C", "France", 30, "PAO", "starter", 9.0, "athletic-roller,double-double,rim-runner", 18,
    S("2024-25", "PAO", 30, 23, 12.4, 6.6, 1.4, 0.9, 1.0, 1.8, 21, 17.9, 0.33)),
  P("Cedi", "Osman", "SF", "Turkey", 30, "PAO", "starter", 7.5, "scorer,shooter,streaky", 14,
    S("2024-25", "PAO", 31, 24, 11.6, 3.2, 2.0, 1.0, 0.2, 1.5, 20, 11.2)),
  P("T.J.", "Shorts", "PG", "USA", 27, "PAO", "rotation", 8.0, "speed,creation,breakout", 14,
    S("2024-25", "PRS", 33, 27, 14.8, 2.6, 6.2, 1.3, 0.1, 2.4, 26, 15.6, 0.35), undefined, true),
  P("Dinos", "Mitoglou", "PF", "Greece", 29, "PAO", "rotation", 6.5, "stretch-four,shooter", 13,
    S("2024-25", "PAO", 30, 22, 9.8, 4.6, 1.4, 0.6, 0.5, 1.1, 17, 11.4)),

  // ---- Olympiacos ----
  P("Sasha", "Vezenkov", "PF", "Bulgaria", 30, "OLY", "starter", 9.5, "elite-scorer,stretch,double-double", 19,
    S("2024-25", "OLY", 30, 28, 16.4, 6.2, 1.8, 1.0, 0.3, 1.6, 25, 18.2, 0.35),
    S("2023-24", "OLY", 12, 27, 15.0, 6.0, 1.6, 0.9, 0.3, 1.5, 25, 17.0)),
  P("Thomas", "Walkup", "PG", "USA", 33, "OLY", "starter", 7.5, "playmaker,defense,connector", 14,
    S("2024-25", "OLY", 32, 26, 9.4, 3.6, 5.2, 1.6, 0.2, 1.8, 18, 13.4, 0.3)),
  P("Evan", "Fournier", "SG", "France", 32, "OLY", "starter", 7.5, "scorer,shooter,microwave", 14,
    S("2024-25", "OLY", 28, 22, 12.6, 2.4, 2.0, 0.9, 0.1, 1.4, 23, 10.8, 0.42)),
  P("Nikola", "Milutinov", "C", "Serbia", 31, "OLY", "starter", 8.5, "rebounder,double-double,screener", 18,
    S("2024-25", "OLY", 31, 24, 10.8, 8.4, 1.6, 0.8, 0.6, 1.4, 18, 17.6, 0.3)),
  P("Shaquielle", "McKissic", "SG", "USA", 32, "OLY", "rotation", 6.5, "two-way,energy,defense", 13,
    S("2024-25", "OLY", 30, 21, 8.6, 2.8, 1.8, 1.2, 0.3, 1.1, 16, 9.8)),
  P("Kostas", "Papanikolaou", "SF", "Greece", 35, "OLY", "rotation", 5.5, "veteran,glue,low-usage", 16,
    S("2024-25", "OLY", 29, 19, 5.6, 3.2, 1.8, 1.0, 0.2, 0.9, 12, 7.9)),

  // ---- Fenerbahçe ----
  P("Scottie", "Wilbekin", "PG", "Turkey", 32, "FEN", "starter", 8.5, "scorer,clutch,high-usage", 15,
    S("2024-25", "FEN", 31, 26, 14.2, 2.2, 4.4, 1.1, 0.1, 1.9, 26, 13.8, 0.38)),
  P("Nigel", "Hayes-Davis", "PF", "USA", 30, "FEN", "starter", 9.0, "scorer,stretch,double-double", 17,
    S("2024-25", "FEN", 33, 28, 16.8, 6.4, 2.4, 1.0, 0.4, 1.8, 25, 17.4, 0.34)),
  P("Nick", "Calathes", "PG", "Greece", 36, "FEN", "rotation", 6.5, "playmaker,assists,low-scoring", 16,
    S("2024-25", "FEN", 30, 22, 6.8, 3.4, 6.6, 1.4, 0.2, 2.0, 18, 12.8, 0.3)),
  P("Devon", "Hall", "SG", "USA", 30, "FEN", "starter", 6.5, "3-and-d,low-usage,efficient", 13,
    S("2024-25", "FEN", 32, 25, 9.8, 2.8, 2.0, 1.0, 0.2, 1.0, 16, 9.6)),
  P("Khem", "Birch", "C", "Canada", 33, "FEN", "rotation", 6.0, "rim-runner,rebounder,defense", 14,
    S("2024-25", "FEN", 28, 18, 7.6, 5.2, 0.8, 0.6, 0.8, 1.0, 15, 11.2)),

  // ---- Anadolu Efes ----
  P("Shane", "Larkin", "PG", "Turkey", 33, "EFS", "starter", 9.0, "elite-scorer,high-usage,injury-prone", 35,
    S("2024-25", "EFS", 26, 28, 17.4, 2.6, 5.4, 1.4, 0.1, 2.6, 29, 16.0, 0.4),
    S("2023-24", "EFS", 24, 28, 16.8, 2.8, 5.0, 1.3, 0.1, 2.4, 28, 15.2)),
  P("Will", "Clyburn", "SF", "USA", 35, "EFS", "starter", 7.5, "scorer,iso,veteran", 16,
    S("2024-25", "EFS", 30, 26, 13.4, 4.0, 2.0, 0.8, 0.2, 1.6, 24, 12.2)),
  P("Ercan", "Osmani", "PF", "Turkey", 25, "EFS", "rotation", 6.0, "stretch,upside,young", 12,
    S("2024-25", "EFS", 31, 21, 10.2, 4.4, 1.2, 0.7, 0.4, 1.2, 19, 11.0)),
  P("PJ", "Dozier", "SG", "USA", 29, "EFS", "rotation", 6.0, "athletic,two-way,inconsistent", 14,
    S("2024-25", "PAR", 28, 22, 9.6, 3.0, 3.2, 1.1, 0.3, 1.6, 20, 10.4, 0.4), undefined, true),

  // ---- AS Monaco ----
  P("Mike", "James", "PG", "USA", 35, "MON", "starter", 10.0, "elite-creator,high-usage,clutch", 20,
    S("2024-25", "MON", 29, 29, 18.2, 2.6, 6.0, 1.0, 0.1, 2.8, 31, 17.0, 0.42),
    S("2023-24", "MON", 30, 30, 19.0, 2.8, 5.6, 1.1, 0.1, 2.9, 32, 17.8)),
  P("Elie", "Okobo", "PG", "France", 28, "MON", "starter", 8.0, "scorer,playmaker,two-way", 15,
    S("2024-25", "MON", 33, 26, 13.0, 2.6, 4.6, 1.3, 0.2, 1.8, 23, 13.6, 0.34)),
  P("Alpha", "Diallo", "SF", "France", 28, "MON", "starter", 7.0, "athletic,two-way,rebounding-wing", 14,
    S("2024-25", "MON", 32, 24, 10.8, 4.4, 2.2, 1.2, 0.4, 1.6, 19, 12.4)),
  P("Donatas", "Motiejunas", "C", "Lithuania", 34, "MON", "rotation", 6.5, "stretch-five,passer,veteran", 16,
    S("2024-25", "MON", 30, 19, 8.8, 4.0, 2.0, 0.6, 0.6, 1.4, 19, 11.0)),
  P("Matthew", "Strazel", "PG", "France", 23, "MON", "rotation", 6.0, "young,shooter,upside", 11,
    S("2024-25", "MON", 33, 22, 9.4, 1.8, 2.6, 1.1, 0.1, 1.0, 17, 9.0)),
  P("Daniel", "Theis", "C", "Germany", 33, "MON", "rotation", 6.5, "stretch,screener,nba-returnee", 18,
    S("2024-25", "MON", 20, 18, 8.0, 4.6, 1.4, 0.6, 0.7, 1.2, 18, 10.4, 0.36), undefined, true),

  // ---- Milano ----
  P("Nikola", "Mirotic", "PF", "Montenegro", 34, "MIL", "starter", 9.5, "elite-scorer,stretch,foul-drawer", 22,
    S("2024-25", "MIL", 28, 25, 16.6, 5.4, 1.8, 0.7, 0.3, 1.8, 26, 17.8, 0.36)),
  P("Shavon", "Shields", "SF", "Denmark", 31, "MIL", "starter", 8.0, "scorer,iso,connector", 15,
    S("2024-25", "MIL", 30, 27, 14.2, 3.4, 3.0, 0.9, 0.2, 1.7, 23, 13.6)),
  P("Zach", "LeDay", "PF", "USA", 31, "MIL", "starter", 7.5, "energy,double-double,stretch", 16,
    S("2024-25", "PAR", 32, 24, 12.0, 5.6, 1.6, 0.8, 0.6, 1.4, 21, 14.8, 0.32), undefined, true),
  P("Josh", "Nebo", "C", "USA", 32, "MIL", "rotation", 6.5, "rim-runner,efficient,shot-blocker", 14,
    S("2024-25", "MIL", 29, 19, 8.8, 4.4, 0.8, 0.5, 1.0, 0.9, 16, 12.0)),
  P("Nicolo", "Melli", "PF", "Italy", 34, "MIL", "rotation", 6.0, "stretch,iq,low-usage", 15,
    S("2024-25", "MIL", 30, 20, 7.2, 4.0, 2.0, 0.7, 0.4, 1.1, 15, 10.0)),

  // ---- Virtus Bologna ----
  P("Isaia", "Cordinier", "SG", "France", 29, "VIR", "starter", 8.0, "athletic,two-way,transition", 15,
    S("2024-25", "VIR", 31, 27, 13.2, 3.8, 3.0, 1.6, 0.4, 1.8, 23, 14.6, 0.34)),
  P("Will", "Clyburn", "SF", "USA", 35, "VIR", "rotation", 6.0, "scorer,veteran,depth", 14,
    S("2023-24", "EFS", 30, 24, 12.0, 3.6, 1.8, 0.7, 0.2, 1.4, 22, 11.0)),
  P("Achille", "Polonara", "PF", "Italy", 33, "VIR", "rotation", 6.0, "stretch,rebounder,shooter", 15,
    S("2024-25", "VIR", 29, 22, 9.0, 5.0, 1.6, 0.8, 0.5, 1.2, 18, 11.6)),
  P("Saliou", "Niang", "SF", "Italy", 21, "VIR", "rotation", 5.0, "young,athletic,upside,sleeper", 10,
    S("2024-25", "VIR", 28, 18, 7.4, 3.6, 1.4, 1.0, 0.4, 1.0, 16, 8.8)),

  // ---- Bayern ----
  P("Carsen", "Edwards", "PG", "USA", 27, "BAY", "starter", 8.0, "scorer,high-usage,microwave", 15,
    S("2024-25", "BAY", 32, 25, 15.0, 2.4, 3.0, 1.1, 0.1, 1.9, 27, 12.8, 0.4)),
  P("Vladimir", "Lucic", "SF", "Serbia", 35, "BAY", "starter", 6.5, "two-way,connector,veteran", 15,
    S("2024-25", "BAY", 30, 26, 9.8, 3.6, 3.2, 0.9, 0.3, 1.4, 17, 11.6)),
  P("Nick", "Weiler-Babb", "SG", "Germany", 29, "BAY", "starter", 6.5, "3-and-d,playmaking-wing,low-usage", 13,
    S("2024-25", "BAY", 31, 27, 8.4, 4.0, 4.0, 1.4, 0.3, 1.4, 16, 12.0)),
  P("Devin", "Booker", "C", "USA", 33, "BAY", "rotation", 6.0, "energy,rebounder,double-double-upside", 14,
    S("2024-25", "BAY", 30, 19, 8.6, 5.4, 1.0, 0.8, 0.5, 1.2, 18, 12.2)),
  P("Andreas", "Obst", "SG", "Germany", 29, "BAY", "rotation", 6.0, "elite-shooter,specialist", 12,
    S("2024-25", "BAY", 31, 22, 9.4, 1.8, 2.0, 0.6, 0.1, 0.8, 16, 8.6)),

  // ---- ALBA Berlin ----
  P("Matt", "Thomas", "SG", "USA", 31, "ALB", "starter", 6.5, "elite-shooter,scorer", 14,
    S("2024-25", "ALB", 32, 27, 13.6, 2.4, 1.8, 0.8, 0.1, 1.2, 22, 11.0)),
  P("Will", "McDowell-White", "PG", "Australia", 26, "ALB", "starter", 6.0, "playmaker,size,upside", 13,
    S("2024-25", "ALB", 30, 26, 10.2, 3.4, 5.2, 1.1, 0.2, 2.2, 22, 11.4)),
  P("Justin", "Bean", "PF", "USA", 28, "ALB", "starter", 6.5, "double-double,energy,rebounder", 15,
    S("2024-25", "ALB", 31, 27, 11.4, 7.2, 2.0, 1.0, 0.4, 1.6, 20, 14.2, 0.32)),
  P("Khalifa", "Koumadje", "C", "Chad", 28, "ALB", "rotation", 5.5, "shot-blocker,rim-runner,foul-prone", 14,
    S("2024-25", "ALB", 29, 18, 6.8, 4.6, 0.6, 0.4, 1.4, 1.0, 15, 9.8)),

  // ---- Žalgiris ----
  P("Sylvain", "Francisco", "PG", "France", 28, "ZAL", "starter", 8.5, "scorer,creator,high-usage,breakout", 15,
    S("2024-25", "ZAL", 33, 28, 15.4, 3.0, 5.2, 1.2, 0.1, 2.2, 27, 15.8, 0.36)),
  P("Ignas", "Brazdeikis", "SF", "Lithuania", 26, "ZAL", "starter", 7.5, "scorer,athletic,two-way", 14,
    S("2024-25", "ZAL", 31, 25, 13.6, 4.0, 1.8, 0.9, 0.3, 1.6, 24, 12.6)),
  P("Moustapha", "Fall", "C", "France", 33, "ZAL", "rotation", 6.0, "rim-protector,rebounder", 15,
    S("2024-25", "OLY", 30, 16, 6.4, 4.2, 0.6, 0.4, 1.0, 0.8, 16, 9.4), undefined, true),
  P("Arnas", "Butkevicius", "SG", "Lithuania", 31, "ZAL", "rotation", 5.0, "energy,defense,glue", 13,
    S("2024-25", "ZAL", 30, 19, 6.2, 2.6, 1.2, 0.8, 0.2, 0.8, 13, 6.8)),

  // ---- Maccabi Tel Aviv ----
  P("Lonnie", "Walker IV", "SG", "USA", 26, "MAC", "starter", 8.5, "explosive-scorer,high-usage,upside", 14,
    S("2024-25", "MAC", 30, 28, 18.8, 3.0, 2.4, 1.0, 0.3, 2.0, 28, 15.2, 0.42)),
  P("Tamir", "Blatt", "PG", "Israel", 28, "MAC", "starter", 6.5, "playmaker,assists,local", 14,
    S("2024-25", "MAC", 32, 25, 9.6, 2.4, 5.6, 1.0, 0.1, 1.8, 19, 11.4)),
  P("Jasiel", "Rivero", "PF", "Uruguay", 31, "MAC", "starter", 6.0, "energy,stretch,double-double-upside", 14,
    S("2024-25", "MAC", 31, 24, 10.4, 5.2, 1.6, 0.9, 0.5, 1.4, 19, 12.6)),
  P("Roman", "Sorkin", "C", "Israel", 28, "MAC", "rotation", 5.5, "stretch-five,energy", 12,
    S("2024-25", "MAC", 30, 18, 7.8, 4.0, 1.0, 0.6, 0.6, 1.0, 16, 9.6)),

  // ---- Crvena Zvezda ----
  P("Codi", "Miller-McIntyre", "PG", "North Macedonia", 32, "CZV", "starter", 7.5, "scorer,creator,high-usage", 15,
    S("2024-25", "CZV", 31, 27, 13.8, 2.8, 5.0, 1.2, 0.1, 2.2, 26, 13.8, 0.36)),
  P("Nikola", "Kalinic", "SF", "Serbia", 33, "CZV", "starter", 6.5, "two-way,connector,veteran", 14,
    S("2024-25", "CZV", 30, 25, 9.8, 4.2, 2.6, 1.2, 0.3, 1.4, 17, 11.4)),
  P("Joel", "Bolomboy", "PF", "Russia", 31, "CZV", "starter", 6.5, "double-double,rebounder,energy", 14,
    S("2024-25", "CZV", 30, 22, 9.2, 6.8, 1.0, 0.8, 0.6, 1.2, 18, 13.2, 0.3)),
  P("Jordan", "Nwora", "SF", "Nigeria", 27, "CZV", "rotation", 7.0, "scorer,shooter,nba-returnee,upside", 13,
    S("2024-25", "CZV", 22, 22, 13.0, 4.0, 1.2, 0.7, 0.2, 1.4, 24, 11.0, 0.42), undefined, true),

  // ---- Partizan ----
  P("Carlik", "Jones", "PG", "USA", 27, "PAR", "starter", 9.0, "elite-creator,triple-double-threat,high-usage", 16,
    S("2024-25", "PAR", 33, 29, 15.6, 4.0, 7.0, 1.4, 0.2, 2.8, 29, 17.4, 0.36)),
  P("Vanja", "Marinkovic", "SG", "Serbia", 28, "PAR", "starter", 6.5, "shooter,scorer,streaky", 14,
    S("2024-25", "PAR", 31, 24, 11.6, 2.4, 1.8, 0.8, 0.1, 1.2, 22, 9.6)),
  P("Sterling", "Brown", "SF", "USA", 30, "PAR", "starter", 6.5, "3-and-d,wing,two-way", 13,
    S("2024-25", "PAR", 29, 24, 10.4, 4.0, 2.0, 1.1, 0.3, 1.2, 20, 11.2)),
  P("Tyrique", "Jones", "C", "USA", 28, "PAR", "starter", 7.0, "double-double,rebounder,energy", 15,
    S("2024-25", "PAR", 32, 23, 11.0, 7.4, 1.2, 0.9, 0.7, 1.4, 20, 15.0, 0.3)),
  P("Frank", "Ntilikina", "PG", "France", 27, "PAR", "rotation", 6.0, "defense,size,low-usage", 14,
    S("2024-25", "PAR", 28, 20, 6.8, 2.6, 2.8, 1.4, 0.3, 1.0, 16, 8.8), undefined, true),

  // ---- Baskonia ----
  P("Markus", "Howard", "PG", "USA", 30, "BKN", "starter", 8.5, "elite-scorer,high-usage,undersized", 14,
    S("2024-25", "BKN", 31, 26, 18.4, 1.8, 2.4, 0.8, 0.1, 1.6, 30, 13.0, 0.44)),
  P("Chima", "Moneke", "PF", "Nigeria", 29, "BKN", "starter", 7.5, "double-double,playmaking-four,energy", 15,
    S("2024-25", "BKN", 30, 26, 13.0, 7.6, 2.6, 1.2, 0.5, 2.0, 24, 16.0, 0.32)),
  P("Hamidou", "Diallo", "SG", "USA", 27, "BKN", "starter", 7.0, "athletic,slasher,transition,upside", 14,
    S("2024-25", "BKN", 29, 24, 12.8, 4.6, 1.8, 1.2, 0.4, 1.8, 23, 12.4, 0.38)),
  P("Trent", "Forrest", "PG", "USA", 27, "BKN", "rotation", 6.5, "two-way,playmaker,defense", 14,
    S("2024-25", "BKN", 30, 24, 8.6, 3.0, 4.2, 1.4, 0.3, 1.6, 18, 11.4)),

  // ---- Paris Basketball ----
  P("Nadir", "Hifi", "PG", "France", 23, "PRS", "starter", 8.5, "explosive-scorer,high-usage,young,upside", 13,
    S("2024-25", "PRS", 33, 26, 16.2, 2.0, 3.2, 1.0, 0.1, 1.8, 28, 13.0, 0.4)),
  P("Maodo", "Lo", "PG", "Germany", 32, "PRS", "starter", 6.5, "scorer,shooter,creator", 14,
    S("2024-25", "PRS", 31, 24, 11.4, 1.8, 3.6, 0.9, 0.1, 1.4, 22, 10.6)),
  P("Tyson", "Ward", "SF", "USA", 28, "PRS", "starter", 6.5, "two-way,athletic-wing,energy", 13,
    S("2024-25", "PRS", 32, 25, 10.8, 4.4, 2.0, 1.2, 0.4, 1.4, 19, 12.0)),
  P("Yakuba", "Ouattara", "SG", "France", 33, "PRS", "rotation", 5.5, "defense,energy,veteran", 13,
    S("2024-25", "PRS", 30, 21, 7.4, 3.0, 1.4, 1.0, 0.3, 0.9, 15, 8.2)),
  P("Mikael", "Jantunen", "PF", "Finland", 25, "PRS", "rotation", 5.5, "connector,double-double-upside,young", 12,
    S("2024-25", "PRS", 31, 22, 8.6, 5.0, 2.2, 0.8, 0.3, 1.2, 17, 11.0)),

  // ---- Free agents / χωρίς ομάδα (rosters in flux) ----
  P("Kemba", "Walker", "PG", "USA", 35, null, "rotation", 6.0, "scorer,name-value,injury-prone,uncertain", 55,
    S("2023-24", "MON", 19, 24, 13.2, 2.2, 3.8, 0.8, 0.1, 1.8, 26, 10.6, 0.44)),
  P("Marko", "Guduric", "SG", "Serbia", 30, null, "rotation", 7.0, "scorer,creator,nba-returnee,uncertain", 22,
    S("2023-24", "FEN", 30, 25, 12.4, 3.0, 4.0, 0.9, 0.1, 1.8, 23, 12.0), undefined, true),
  P("Wade", "Baldwin", "PG", "USA", 29, null, "rotation", 7.0, "two-way,creator,high-usage,uncertain", 22,
    S("2024-25", "MAC", 24, 26, 13.0, 3.4, 5.0, 1.4, 0.3, 2.2, 25, 14.0, 0.38)),
  P("Gabriel", "Lundberg", "SG", "Denmark", 31, null, "rotation", 6.0, "scorer,two-way,uncertain", 20,
    S("2024-25", "PAR", 26, 23, 9.8, 2.6, 3.0, 1.0, 0.2, 1.4, 21, 9.8)),
  P("Othello", "Hunter", "C", "USA", 39, null, "bench", 4.5, "energy-big,veteran,depth", 20,
    S("2023-24", "RMB", 20, 12, 5.0, 3.0, 0.6, 0.4, 0.6, 0.6, 14, 7.0)),
  P("Rokas", "Jokubaitis", "PG", "Lithuania", 24, "FEN", "rotation", 7.0, "young,creator,upside,breakout", 14,
    S("2024-25", "BAR", 30, 20, 9.0, 2.2, 3.8, 0.8, 0.1, 1.6, 21, 10.0), undefined, true),
];

// Builder to keep the table above readable.
function P(
  firstName: string,
  lastName: string,
  position: Position,
  nationality: string,
  age: number,
  teamShort: string | null,
  depthRole: SeedPlayer["depthRole"],
  fantasyPrice: number,
  tags: string,
  injuryRiskHint: number,
  last?: SeedStat,
  prior?: SeedStat,
  changedTeam = false
): SeedPlayer {
  const status: SeedPlayer["status"] = teamShort === null ? "free_agent" : "signed";
  return {
    firstName, lastName, position, nationality, age, teamShort,
    status, depthRole, fantasyPrice, tags, injuryRiskHint, changedTeam, last, prior,
  };
}
