import { describe, expect, it } from "vitest";
import { boost, fuse, parseQuery } from "@/features/search/domain/rank";

describe("search ranking", () => {
  it("fuses lists so items found by several methods rise", () => {
    const s = fuse([
      [{ id: "a", rank: 1 }, { id: "b", rank: 2 }],
      [{ id: "b", rank: 1 }],
    ]);
    expect(s.get("b")!).toBeGreaterThan(s.get("a")!);
  });
  it("boosts what you use and sinks deprecated workflows", () => {
    const used = boost(1, { status: "active", myRuns90d: 10, teamRuns30d: 0, recentlyViewed: false });
    const deprecated = boost(1, { status: "deprecated", myRuns90d: 0, teamRuns30d: 0, recentlyViewed: false });
    expect(used).toBeGreaterThan(1);
    expect(deprecated).toBeLessThan(1);
  });
  it("reads inline filters", () => {
    expect(parseQuery("restart pods env:staging cat:maintain")).toEqual({ text: "restart pods", filters: { env: "staging", category: "maintain" } });
  });
});
