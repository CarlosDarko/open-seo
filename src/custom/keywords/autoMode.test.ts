import { describe, expect, it } from "vitest";
import { autoSourcesFor, shouldStopAutoFetch } from "@/custom/keywords/autoMode";

describe("autoSourcesFor", () => {
  const sources = ["related", "suggestions", "ideas"] as const;

  it("uses every source when nothing is filtered", () => {
    expect(autoSourcesFor(sources, false)).toEqual(["related", "suggestions", "ideas"]);
  });

  it("skips the broad ideas source when filtering", () => {
    expect(autoSourcesFor(sources, true)).toEqual(["related", "suggestions"]);
  });
});

describe("shouldStopAutoFetch", () => {
  it("keeps the usual coverage rule when nothing is filtered", () => {
    expect(
      shouldStopAutoFetch({ filtering: false, collected: 20, resultLimit: 150, hasSufficientCoverage: true }),
    ).toBe(true);
    expect(
      shouldStopAutoFetch({ filtering: false, collected: 5, resultLimit: 150, hasSufficientCoverage: false }),
    ).toBe(false);
  });

  it("does not stop early with filters just because coverage looks sufficient", () => {
    expect(
      shouldStopAutoFetch({ filtering: true, collected: 16, resultLimit: 150, hasSufficientCoverage: true }),
    ).toBe(false);
  });

  it("stops with filters only once the result limit is filled", () => {
    expect(
      shouldStopAutoFetch({ filtering: true, collected: 150, resultLimit: 150, hasSufficientCoverage: false }),
    ).toBe(true);
  });
});
