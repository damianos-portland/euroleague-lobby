import { describe, it, expect } from "vitest";
import { fitScore, rankByIntent } from "./scout";
import type { PlayerDTO } from "./queries";

// Minimal PlayerDTO factory for the fields the scout logic reads.
function mk(over: Partial<PlayerDTO> & { price: number }): PlayerDTO {
  const { price, ...rest } = over;
  return {
    id: Math.random().toString(36).slice(2),
    firstName: "T", lastName: "P", name: "T P",
    position: "SG" as any, nationality: "GR", age: 27,
    status: "signed", depthRole: "rotation",
    fantasyPrice: price, tags: [], teamId: "t", teamShort: "OLY", teamName: "Oly",
    last: { season: "2025-26", games: 26, minutes: 26, points: 12, rebounds: 3, assists: 3, steals: 1, blocks: 0, turnovers: 2, usage: 22, pir: 12, fantasyPoints: 16, fpStdev: 5, teamSnapshot: "OLY" },
    proj: { projMinutes: 26, projUsage: 22, projPoints: 12, projRebounds: 3, projAssists: 3, projSteals: 1, projBlocks: 0, projTurnovers: 2, projPir: 12, projFantasyPoints: 16, valueScore: 55, pointsPerCredit: 2.2, riskAdjustedValue: 55, upsideScore: 40, consistencyScore: 70, injuryRisk: 20, ownershipPrediction: 40, recommendation: "value_pick", signal: "hold", rationale: "", projectedRole: "" },
    ...rest,
  } as PlayerDTO;
}

const NEG = Number.NEGATIVE_INFINITY;

describe("faststart eligibility gate", () => {
  it("excludes unproven players (no track record)", () => {
    expect(fitScore(mk({ price: 6, status: "unproven" }), "faststart")).toBe(NEG);
  });
  it("excludes bench / deep-bench roles", () => {
    expect(fitScore(mk({ price: 6, depthRole: "bench" }), "faststart")).toBe(NEG);
    expect(fitScore(mk({ price: 6, depthRole: "deep_bench" }), "faststart")).toBe(NEG);
  });
  it("excludes tiny minutes and tiny last-season samples", () => {
    const lowMin = mk({ price: 6, proj: { ...mk({ price: 6 }).proj!, projMinutes: 10 } });
    expect(fitScore(lowMin, "faststart")).toBe(NEG);
    const smallSample = mk({ price: 6, last: { ...mk({ price: 6 }).last!, games: 4 } });
    expect(fitScore(smallSample, "faststart")).toBe(NEG);
  });
  it("excludes low projected producers (must actually start strong)", () => {
    const weak = mk({ price: 6, depthRole: "starter", proj: { ...mk({ price: 6 }).proj!, projFantasyPoints: 8 } });
    expect(fitScore(weak, "faststart")).toBe(NEG);
  });
  it("a proven rotation starter with real minutes is eligible", () => {
    expect(fitScore(mk({ price: 6, depthRole: "starter" }), "faststart")).toBeGreaterThan(0);
  });
});

describe("faststart ranks cheap value on top", () => {
  it("prefers the cheaper of two equally-ready eligible players", () => {
    const cheap = mk({ price: 5, depthRole: "starter" });
    const pricey = mk({ price: 10, depthRole: "starter" });
    expect(fitScore(cheap, "faststart")).toBeGreaterThan(fitScore(pricey, "faststart"));
  });
  it("a cheap solid rotation player beats an expensive stud (per-credit value)", () => {
    const cheapSolid = mk({
      price: 6, depthRole: "rotation",
      last: { ...mk({ price: 6 }).last!, fantasyPoints: 12, games: 26 },
      proj: { ...mk({ price: 6 }).proj!, projFantasyPoints: 13, projMinutes: 22, consistencyScore: 70, injuryRisk: 20 },
    });
    const expensiveStud = mk({
      price: 16, depthRole: "starter",
      last: { ...mk({ price: 16 }).last!, fantasyPoints: 28, games: 30 },
      proj: { ...mk({ price: 16 }).proj!, projFantasyPoints: 30, projMinutes: 30, consistencyScore: 70, injuryRisk: 20 },
    });
    expect(fitScore(cheapSolid, "faststart")).toBeGreaterThan(fitScore(expensiveStud, "faststart"));
  });
  it("excludes players without a projection", () => {
    const noProj = mk({ price: 5, proj: null });
    expect(fitScore(noProj, "faststart")).toBe(NEG);
    expect(rankByIntent([noProj], "faststart")).toHaveLength(0);
  });
});
