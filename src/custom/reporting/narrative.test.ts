import { describe, expect, it } from "vitest";
import {
  buildVerdict,
  percentChange,
  signedPercent,
} from "@/custom/reporting/narrative";
import type { ReportSnapshot } from "@/custom/reporting/types";

const base = {
  period: {
    compare: "previous",
    comparable: true,
    days: 28,
    prevStartDate: "2026-08-20",
    prevEndDate: "2026-09-16",
  },
  totals: { clicks: 1200, impressions: 40000, ctr: 0.03, position: 12 },
  prevTotals: { clicks: 1000, impressions: 40000, ctr: 0.025, position: 12 },
  pageWinners: [],
  pageLosers: [],
  opportunities: [],
  updates: [],
  tasks: [],
} as unknown as ReportSnapshot;

describe("buildVerdict", () => {
  it("calls a rise of more than 5 % a good period", () => {
    const verdict = buildVerdict(base);
    expect(verdict.tone).toBe("good");
    expect(verdict.headline).toContain("20,0 % más");
  });

  it("flags a fall of 20 % or more as bad and names the biggest loser", () => {
    const verdict = buildVerdict({
      ...base,
      totals: { ...base.totals, clicks: 700 },
      pageLosers: [
        {
          key: "https://example.com/guia/",
          clicksDelta: -90,
        },
      ] as ReportSnapshot["pageLosers"],
    });
    expect(verdict.tone).toBe("bad");
    expect(verdict.points.join(" ")).toContain("/guia/");
  });

  it("only states the totals when there is nothing to compare with", () => {
    const verdict = buildVerdict({
      ...base,
      period: { ...base.period, comparable: false },
    });
    expect(verdict.tone).toBe("flat");
    expect(verdict.headline).toContain("1.200 clics");
  });
});

describe("percent helpers", () => {
  it("handles an empty base and formats the sign", () => {
    expect(percentChange(5, 0)).toBeNull();
    expect(signedPercent(-0.123)).toBe("−12,3 %");
  });
});
