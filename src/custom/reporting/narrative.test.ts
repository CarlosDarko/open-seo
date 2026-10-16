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
  bands: [],
  newQueries: 0,
  opportunities: [],
} as unknown as ReportSnapshot;

describe("buildVerdict", () => {
  it("calls a rise of more than 5 % a good period and celebrates it", () => {
    const verdict = buildVerdict(base);
    expect(verdict.tone).toBe("good");
    expect(verdict.headline).toContain("20,0 % más");
    expect(verdict.lining).toContain("Tu tráfico crece");
  });

  it("tells a fall straight but always leaves something encouraging", () => {
    const verdict = buildVerdict({
      ...base,
      totals: { ...base.totals, clicks: 700 },
    });
    expect(verdict.tone).toBe("bad");
    expect(verdict.headline).toContain("margen claro de recuperación");
    expect(verdict.lining.length).toBeGreaterThan(10);
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
