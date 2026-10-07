import { describe, expect, it } from "vitest";
import {
  checkItem,
  checkRule,
  describeTrigger,
  isValidCombination,
  type Item,
  type Rule,
  type Values,
} from "@/custom/radar/alertRules";

const values = (clicks: number, impressions: number, position = 5): Values => ({
  clicks,
  impressions,
  ctr: impressions > 0 ? clicks / impressions : 0,
  position,
});

const rule = (overrides: Partial<Rule>): Rule => ({
  id: "r",
  name: "regla",
  scope: "site",
  target: null,
  metric: "clicks",
  condition: "drop_pct",
  threshold: 20,
  windowDays: 7,
  minValue: 0,
  ...overrides,
});

const item = (previous: Values, current: Values, label = "sitio"): Item => ({
  label,
  url: null,
  previous,
  current,
});

describe("checkItem", () => {
  it("fires on a drop of at least the threshold", () => {
    const hit = checkItem(rule({}), item(values(100, 1000), values(70, 1000)));
    expect(hit?.changePct).toBeCloseTo(-30, 5);
    expect(
      checkItem(rule({}), item(values(100, 1000), values(85, 1000))),
    ).toBeNull();
  });

  it("ignores items with too little before, to avoid noise", () => {
    const small = rule({ minValue: 20 });
    expect(checkItem(small, item(values(5, 100), values(1, 100)))).toBeNull();
    expect(
      checkItem(small, item(values(50, 500), values(10, 500))),
    ).not.toBeNull();
  });

  it("fires 'below' only when the value crosses the line", () => {
    const below = rule({ metric: "clicks", condition: "below", threshold: 50 });
    expect(
      checkItem(below, item(values(80, 1000), values(40, 1000))),
    ).not.toBeNull();
    expect(
      checkItem(below, item(values(30, 1000), values(20, 1000))),
    ).toBeNull();
  });

  it("compares CTR in percent", () => {
    const ctr = rule({ metric: "ctr", condition: "below", threshold: 2 });
    expect(
      checkItem(ctr, item(values(30, 1000), values(10, 1000))),
    ).not.toBeNull();
  });

  it("detects a position that gets worse by N places", () => {
    const worse = rule({
      metric: "position",
      condition: "worse_by",
      threshold: 3,
    });
    expect(
      checkItem(worse, item(values(10, 1000, 4), values(8, 1000, 8))),
    ).not.toBeNull();
    expect(
      checkItem(worse, item(values(10, 1000, 4), values(8, 1000, 6))),
    ).toBeNull();
  });
});

describe("filters", () => {
  it("only fires when every extra condition holds too", () => {
    const narrowed = rule({
      filters: [
        { metric: "impressions", op: "gte", value: 1000, period: "current" },
        { metric: "ctr", op: "lte", value: 2, period: "current" },
      ],
    });
    // Clicks drop 40 %, 2000 impressions, CTR 1.5 %: fires.
    expect(
      checkItem(narrowed, item(values(50, 2000), values(30, 2000))),
    ).not.toBeNull();
    // Same drop but only 400 impressions: filtered out.
    expect(
      checkItem(narrowed, item(values(20, 400), values(12, 400))),
    ).toBeNull();
    // Enough impressions but a healthy 5 % CTR: filtered out.
    expect(
      checkItem(narrowed, item(values(160, 2000), values(100, 2000))),
    ).toBeNull();
  });

  it("can look at the previous period", () => {
    const narrowed = rule({
      filters: [
        { metric: "position", op: "lte", value: 5, period: "previous" },
      ],
    });
    expect(
      checkItem(narrowed, item(values(100, 1000, 3), values(60, 1000, 8))),
    ).not.toBeNull();
    expect(
      checkItem(narrowed, item(values(100, 1000, 9), values(60, 1000, 9))),
    ).toBeNull();
  });
});

describe("checkRule and describeTrigger", () => {
  it("lists the worst items first and writes a readable sentence", () => {
    const top = rule({
      scope: "top_pages",
      condition: "drop_pct",
      threshold: 30,
    });
    const hits = checkRule(top, [
      item(values(100, 1000), values(60, 1000), "/a"),
      item(values(100, 1000), values(20, 1000), "/b"),
      item(values(100, 1000), values(95, 1000), "/c"),
    ]);
    expect(hits.map((hit) => hit.label)).toEqual(["/b", "/a"]);
    expect(describeTrigger(top, hits)).toContain("2 páginas");
    expect(
      describeTrigger(
        rule({}),
        checkRule(rule({}), [item(values(100, 1000), values(60, 1000))]),
      ),
    ).toContain("Los clics del sitio");
  });
});

describe("isValidCombination", () => {
  it("only allows conditions that make sense for the metric", () => {
    expect(isValidCombination("position", "worse_by")).toBe(true);
    expect(isValidCombination("position", "drop_pct")).toBe(false);
    expect(isValidCombination("clicks", "worse_by")).toBe(false);
  });
});
