import { describe, expect, it } from "vitest";
import { buildFindings, inspectionStats } from "@/custom/radar/crawlStats";

const NOW = Date.parse("2026-10-16T12:00:00Z");
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const item = (
  url: string,
  patch: Partial<Parameters<typeof inspectionStats>[0][number]> = {},
) => ({
  url,
  verdict: "PASS",
  lastCrawlTime: day(2),
  canonicalMismatch: false,
  robotsTxtState: "ALLOWED",
  error: null,
  ...patch,
});

describe("inspectionStats", () => {
  it("counts indexing, canonicals, robots and when Google last crawled", () => {
    const stats = inspectionStats(
      [
        item("a"),
        item("b", { verdict: "FAIL", lastCrawlTime: day(20) }),
        item("c", { lastCrawlTime: day(45), canonicalMismatch: true }),
        item("d", { lastCrawlTime: null, robotsTxtState: "DISALLOWED" }),
        item("e", { error: "cuota" }),
      ],
      NOW,
    );
    expect(stats).toMatchObject({
      total: 4,
      indexed: 3,
      notIndexed: 1,
      canonicalMismatches: 1,
      blockedByRobots: 1,
      freshness: { recent: 1, medium: 1, old: 1, unknown: 1 },
    });
    // The page never crawled comes first, then the oldest.
    expect(stats.stale.map((row) => row.url)).toEqual(["d", "c"]);
  });
});

describe("buildFindings", () => {
  const base = {
    inSitemap: 100,
    unseen: 5,
    notInSitemap: 0,
    sitemapErrors: 0,
    inspection: null,
    crawl: null,
  };

  it("sorts the worst first and invites to check what is not checked yet", () => {
    const findings = buildFindings({ ...base, unseen: 60, notInSitemap: 3 });
    expect(findings.map((f) => [f.id, f.tone])).toEqual([
      ["unseen", "bad"],
      ["not-in-sitemap", "warn"],
      ["inspect-todo", "todo"],
      ["crawl-todo", "todo"],
    ]);
  });

  it("flags a blocked site above everything else measured", () => {
    const findings = buildFindings({
      ...base,
      crawl: {
        homeBlocked: true,
        blockedPages: 0,
        slowPages: 0,
        problemPages: 0,
        pages: 10,
        robotsFound: true,
      },
    });
    expect(findings.find((f) => f.id === "home-blocked")?.tone).toBe("bad");
  });

  it("says there is no sitemap when none is found", () => {
    expect(buildFindings({ ...base, inSitemap: 0, unseen: 0 })[0].id).toBe(
      "no-sitemap",
    );
  });
});
