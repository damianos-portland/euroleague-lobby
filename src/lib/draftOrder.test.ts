import { describe, it, expect } from "vitest";
import { chainedRoundOrders, seatForPick, orderIndexForPick, parseRoundOrders } from "./draft";

describe("chainedRoundOrders (re-lottery)", () => {
  it("round 1 is the identity order (lottery result)", () => {
    const orders = chainedRoundOrders(3, 8);
    expect(orders[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("produces exactly `rounds` rows, each a permutation of 0..n-1", () => {
    const n = 6;
    const orders = chainedRoundOrders(5, n);
    expect(orders).toHaveLength(5);
    for (const row of orders) {
      expect([...row].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it("gives the previous round's #1 pick the worst odds next round", () => {
    // Round 1 is the identity, so seat 0 is always round-1's #1 pick. In round 2
    // it carries the smallest weight, so across many draws it should land late
    // on average and almost never grab #1 again. (Statistical, not guaranteed.)
    const n = 8;
    const RUNS = 800;
    let sumPos = 0;
    let wonAgain = 0;
    for (let i = 0; i < RUNS; i++) {
      const round2 = chainedRoundOrders(2, n)[1];
      const pos = round2.indexOf(0); // where round-1's #1 pick landed
      sumPos += pos;
      if (pos === 0) wonAgain++;
    }
    const avgPos = sumPos / RUNS;
    expect(avgPos).toBeGreaterThan((n - 1) / 2); // later than the middle slot
    expect(wonAgain / RUNS).toBeLessThan(1 / n); // below a uniform team's #1 rate
  });
});

describe("seatForPick", () => {
  it("falls back to snake order when no matrix is given", () => {
    const n = 4;
    for (let overall = 0; overall < n * 3; overall++) {
      expect(seatForPick(overall, n, null)).toBe(orderIndexForPick(overall, n));
    }
  });

  it("reads the cached matrix per round and position", () => {
    const n = 3;
    const matrix = [
      [0, 1, 2], // round 1
      [2, 0, 1], // round 2
    ];
    expect(seatForPick(0, n, matrix)).toBe(0); // r0 pos0
    expect(seatForPick(2, n, matrix)).toBe(2); // r0 pos2
    expect(seatForPick(3, n, matrix)).toBe(2); // r1 pos0
    expect(seatForPick(5, n, matrix)).toBe(1); // r1 pos2
  });

  it("falls back to snake for rounds beyond the matrix", () => {
    const n = 3;
    const matrix = [[0, 1, 2]]; // only round 1 cached
    // round 2 (overall 3..5) should use snake fallback
    expect(seatForPick(3, n, matrix)).toBe(orderIndexForPick(3, n));
  });
});

describe("parseRoundOrders", () => {
  it("returns null for null/invalid input", () => {
    expect(parseRoundOrders(null)).toBeNull();
    expect(parseRoundOrders(undefined)).toBeNull();
    expect(parseRoundOrders("not json")).toBeNull();
    expect(parseRoundOrders('{"a":1}')).toBeNull();
  });

  it("round-trips a stored matrix", () => {
    const m = [[0, 1], [1, 0]];
    expect(parseRoundOrders(JSON.stringify(m))).toEqual(m);
  });
});
