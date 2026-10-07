import { describe, expect, it } from "vitest";
import {
  judgeImpact,
  measurementWindows,
  statsFromRows,
  type Baseline,
  type WindowStats,
} from "@/custom/radar/trackingImpact";

const stats = (
  clicks: number,
  impressions: number,
  position: number,
  days = 28,
): WindowStats => ({ clicks, impressions, position, days });

const baseline = (page: WindowStats, site: WindowStats): Baseline => ({
  start: "2026-08-01",
  end: "2026-08-28",
  page,
  site,
});

describe("measurementWindows", () => {
  it("measures 28 days before the change and waits for 14 days of data after", () => {
    const early = measurementWindows("2026-10-01T10:00:00Z", new Date("2026-10-10T00:00:00Z"));
    expect(early.baseline).toEqual({ start: "2026-09-01", end: "2026-09-28", days: 28 });
    expect(early.after).toBeNull();
    expect(early.waitingDays).toBeGreaterThan(0);

    const later = measurementWindows("2026-09-01T10:00:00Z", new Date("2026-10-10T00:00:00Z"));
    expect(later.after).toEqual({ start: "2026-09-02", end: "2026-09-29", days: 28 });
    expect(later.waitingDays).toBe(0);
  });
});

describe("judgeImpact", () => {
  it("credits a snippet fix when the CTR clearly improves", () => {
    const impact = judgeImpact(
      "snippet",
      baseline(stats(10, 1000, 6), stats(1000, 100000, 5)),
      { page: stats(30, 1000, 6), site: stats(1000, 100000, 5) },
    );
    expect(impact.primary).toBe("ctr");
    expect(impact.verdict).toBe("mejora");
  });

  it("does not credit the action for a general rise of the whole site", () => {
    const impact = judgeImpact(
      "loss",
      baseline(stats(100, 5000, 4), stats(1000, 100000, 5)),
      { page: stats(130, 5000, 4), site: stats(1300, 100000, 5) },
    );
    expect(impact.siteClicksChangePct).toBeCloseTo(0.3, 5);
    expect(impact.verdict).toBe("sin_cambio");
  });

  it("judges a push by the position it gained", () => {
    const impact = judgeImpact(
      "push",
      baseline(stats(10, 1000, 8), stats(1000, 100000, 5)),
      { page: stats(12, 1000, 5.5), site: stats(1000, 100000, 5) },
    );
    expect(impact.primary).toBe("position");
    expect(impact.verdict).toBe("mejora");
  });

  it("says there is too little data instead of guessing", () => {
    const impact = judgeImpact(
      "snippet",
      baseline(stats(0, 20, 6), stats(1000, 100000, 5)),
      { page: stats(2, 20, 6), site: stats(1000, 100000, 5) },
    );
    expect(impact.verdict).toBe("pocos_datos");
  });

  it("normalises windows of different length per day", () => {
    const impact = judgeImpact(
      "loss",
      baseline(stats(280, 10000, 4, 28), stats(1000, 100000, 5, 28)),
      { page: stats(140, 5000, 4, 14), site: stats(500, 50000, 5, 14) },
    );
    expect(impact.clicks.changePct).toBeCloseTo(0, 5);
  });
});

describe("statsFromRows", () => {
  it("adds clicks and impressions and weights the position", () => {
    const result = statsFromRows(
      [
        { clicks: 1, impressions: 100, ctr: 0.01, position: 2 },
        { clicks: 3, impressions: 300, ctr: 0.01, position: 6 },
      ],
      28,
    );
    expect(result).toMatchObject({ clicks: 4, impressions: 400, days: 28 });
    expect(result.position).toBeCloseTo(5, 5);
  });
});
