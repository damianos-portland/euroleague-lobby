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
  { code: "BES", name: "Besiktas", budgetMEur: 15 }, // 2026-27 newcomer (present in the official feed)
];
