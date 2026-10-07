import { describe, expect, it } from "vitest";
import {
  alignDaily,
  canonicalPageKey,
  mergePageVariants,
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
    const found = ctrOpportunities(
      [
        row(["weak"], 5, 1000, 2),
        row(["fine"], 150, 1000, 2),
        row(["page two"], 1, 1000, 14),
        row(["tiny"], 0, 20, 2),
      ],
      new Map([["weak", "https://x.com/a"]]),
      [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018],
      50,
    );
    expect(found.map((r) => r.query)).toEqual(["weak"]);
    expect(found[0].potentialClicks).toBe(145);
    expect(found[0].page).toBe("https://x.com/a");
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

describe("page URL variants", () => {
  it("treats www, http, trailing slash, fragments and tracking params as one page", () => {
    const keys = [
      "https://www.x.com/blog/a/",
      "http://x.com/blog/a",
      "https://x.com/blog/a?utm_source=news#:~:text=hola",
    ].map(canonicalPageKey);
    expect(new Set(keys).size).toBe(1);
    expect(canonicalPageKey("https://x.com/blog/b")).not.toBe(keys[0]);
  });

  it("merges variant rows so a page no longer competes with itself", () => {
    const merged = mergePageVariants(
      [
        row(["seo", "https://www.x.com/a/"], 4, 100, 6),
        row(["seo", "https://x.com/a"], 1, 100, 10),
        row(["seo", "https://x.com/b"], 2, 40, 12),
      ],
      1,
    );
    expect(merged).toHaveLength(2);
    const a = merged.find((r) => r.keys?.[1]?.includes("/a"));
    expect(a).toMatchObject({ clicks: 5, impressions: 200, position: 8 });
    expect(cannibalizedQueries(merged)).toHaveLength(1);
    expect(
      cannibalizedQueries(
        mergePageVariants(
          [
            row(["seo", "https://www.x.com/a/"], 4, 100, 6),
            row(["seo", "https://x.com/a"], 1, 100, 10),
          ],
          1,
        ),
      ),
    ).toHaveLength(0);
  });
});
