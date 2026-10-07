import { describe, expect, it } from "vitest";
import {
  alignDaily,
  cannibalizedQueries,
  compareDimension,
  ctrOpportunities,
  winnersAndLosers,
} from "@/custom/radar/radarAnalysis";

const row = (
  keys: string[],
  clicks: number,
  impressions: number,
  position: number,
) => ({
  keys,
  clicks,
  impressions,
  ctr: impressions ? clicks / impressions : 0,
  position,
});

describe("compareDimension", () => {
  it("marks new and lost keys and computes click changes", () => {
    const rows = compareDimension(
      [row(["a"], 30, 300, 4), row(["b"], 5, 100, 9)],
      [row(["a"], 10, 200, 6), row(["c"], 8, 90, 7)],
    );
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.a).toMatchObject({ clicksDelta: 20, status: "changed" });
    expect(byKey.b).toMatchObject({ clicksDelta: 5, status: "new" });
    expect(byKey.c).toMatchObject({ clicksDelta: -8, status: "lost" });
  });

  it("orders winners and losers by the size of the change", () => {
    const rows = compareDimension(
      [row(["a"], 30, 300, 4), row(["b"], 1, 100, 9)],
      [row(["a"], 10, 200, 6), row(["b"], 11, 100, 3)],
    );
    const { winners, losers } = winnersAndLosers(rows);
    expect(winners.map((r) => r.key)).toEqual(["a"]);
    expect(losers.map((r) => r.key)).toEqual(["b"]);
  });
});

describe("ctrOpportunities", () => {
  it("flags page-one queries with a CTR far below the usual for their position", () => {
    const found = ctrOpportunities([
      row(["weak"], 5, 1000, 2),
      row(["fine"], 150, 1000, 2),
      row(["page two"], 1, 1000, 14),
      row(["tiny"], 0, 20, 2),
    ]);
    expect(found.map((r) => r.query)).toEqual(["weak"]);
    expect(found[0].potentialClicks).toBe(145);
  });
});

describe("cannibalizedQueries", () => {
  it("returns queries where two pages share the impressions", () => {
    const found = cannibalizedQueries([
      row(["seo", "/a"], 10, 100, 5),
      row(["seo", "/b"], 4, 60, 8),
      row(["solo", "/a"], 10, 200, 3),
      row(["solo", "/c"], 0, 3, 40),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0].query).toBe("seo");
    expect(found[0].pages.map((p) => p.page)).toEqual(["/a", "/b"]);
  });
});

describe("alignDaily", () => {
  it("pairs each day with the same day of the previous period and sorts by date", () => {
    const points = alignDaily(
      [row(["2026-02-02"], 7, 70, 5), row(["2026-02-01"], 6, 60, 5)],
      [row(["2026-01-04"], 3, 30, 5)],
      28,
    );
    expect(points.map((p) => p.date)).toEqual(["2026-02-01", "2026-02-02"]);
    expect(points[0].prevClicks).toBe(3);
    expect(points[1].prevClicks).toBeNull();
  });
});
