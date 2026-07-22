import { describe, it, expect } from "vitest";
import { rosterStatus } from "./rosterStatus";

describe("rosterStatus", () => {
  it("new when no matching player in DB", () => {
    expect(rosterStatus(null, "OLY")).toBe("new");
  });
  it("returning when last season team matches this club", () => {
    expect(rosterStatus({ teamSnapshot: "OLY" }, "OLY")).toBe("returning");
  });
  it("transfer when last season team differs", () => {
    expect(rosterStatus({ teamSnapshot: "MCO" }, "OLY")).toBe("transfer");
  });
  it("transfer when player known but has no season snapshot", () => {
    expect(rosterStatus({ teamSnapshot: null }, "OLY")).toBe("transfer");
  });
});
