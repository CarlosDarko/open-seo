import { describe, expect, it } from "vitest";
import {
  buildInsights,
  silverLining,
  updateImpacts,
} from "@/custom/reporting/insights";
import type { ReportSnapshot } from "@/custom/reporting/types";

const day = (index: number) =>
  new Date(Date.UTC(2026, 8, 1 + index)).toISOString().slice(0, 10);

// 30 days at 100 clicks a day, except 70 a day while the update runs (days 12-20).
const daily = Array.from({ length: 30 }, (_, index) => ({
  date: day(index),
  clicks: index >= 12 && index <= 20 ? 70 : 100,
  impressions: 3000,
  position: 10,
  prevClicks: 90,
  prevImpressions: 3000,
  prevPosition: 10,
}));

const base = {
  period: { compare: "previous", comparable: true, days: 30 },
  totals: { clicks: 2800, impressions: 90000, ctr: 0.03, position: 10 },
  prevTotals: { clicks: 2700, impressions: 90000, ctr: 0.03, position: 10 },
  daily,
  brand: {
    hasBrand: false,
    clicks: 0,
    prevClicks: 0,
    otherClicks: 0,
    prevOtherClicks: 0,
  },
  topPages: [],
  pageClicksTotal: 0,
  pageWinners: [],
  pageLosers: [],
  bands: [],
  segments: { device: [], pageType: [], intent: [] },
  opportunities: [],
  topics: [],
  health: null,
  discover: null,
  newQueries: 0,
  lostQueries: 0,
  updates: [
    {
      id: "u",
      kind: "core",
      label: "Core update",
      title: "Core",
      begin: day(12),
      end: day(20),
      url: "",
    },
  ],
} as unknown as ReportSnapshot;

describe("updateImpacts", () => {
  it("measures the clicks per day before, during and after an update", () => {
    const [impact] = updateImpacts(base);
    expect(impact.before).toBe(100);
    expect(impact.during).toBe(70);
    expect(impact.after).toBe(100);
    expect(impact.verdict).toContain("30,0 %");
    expect(impact.verdict).toContain("recuperado");
  });
});

describe("buildInsights", () => {
  it("puts the Google update among the findings and gives each one an upside", () => {
    const insights = buildInsights(base);
    expect(insights.some((item) => item.id === "update")).toBe(true);
    expect(insights.every((item) => Boolean(item.upside))).toBe(true);
  });
});

describe("silverLining", () => {
  it("finds something encouraging even when clicks fall", () => {
    const worse = {
      ...base,
      totals: { ...base.totals, clicks: 1500 },
      newQueries: 8,
    } as ReportSnapshot;
    expect(silverLining(worse)).toContain("8 búsquedas nuevas");
  });
});
