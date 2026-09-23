import { describe, expect, it } from "vitest";
import {
  DEFAULT_COST_SETTINGS,
  addDays,
  buildCostAlerts,
  daysInMonthOf,
  formatEur,
  madridDay,
  monthStartOf,
  previousMonthStart,
  projectMonthEnd,
  usdToEur,
} from "@/custom/costs/shared";

const normalize = (text: string) => text.replace(/\s/g, " ");

describe("formatEur", () => {
  it("uses Spanish formatting with the euro sign", () => {
    expect(normalize(formatEur(1234.5))).toBe("1234,50 €");
  });

  it("keeps up to four decimals for amounts under one cent", () => {
    expect(normalize(formatEur(0.0006))).toBe("0,0006 €");
  });
});

describe("date helpers", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("finds month starts and lengths", () => {
    expect(monthStartOf("2026-09-23")).toBe("2026-09-01");
    expect(previousMonthStart("2026-01-15")).toBe("2025-12-01");
    expect(daysInMonthOf("2028-02-10")).toBe(29);
  });

  it("uses the Madrid calendar day, not UTC", () => {
    // 22:30 UTC on 30 Sep is already 1 Oct in Madrid (UTC+2 in summer).
    expect(madridDay(new Date("2026-09-30T22:30:00Z"))).toBe("2026-10-01");
  });
});

describe("projection", () => {
  it("extrapolates the month from the days elapsed", () => {
    expect(projectMonthEnd(10, "2026-09-10")).toBeCloseTo(30, 5);
  });
});

describe("usdToEur", () => {
  it("applies the rate", () => {
    expect(usdToEur(2, 0.875)).toBeCloseTo(1.75, 5);
  });
});

describe("buildCostAlerts", () => {
  const base = {
    day: "2026-09-20",
    settings: DEFAULT_COST_SETTINGS,
    monthSpentEur: 1,
    todaySpentEur: 0.1,
    recentDailyAverageEur: 0.1,
    balanceEur: 40,
  };
  const ids = (input: Parameters<typeof buildCostAlerts>[0]) =>
    buildCostAlerts(input).map((alert) => alert.id);

  it("stays quiet when spending is normal", () => {
    expect(ids(base)).toEqual([]);
  });

  it("warns when the budget threshold is reached", () => {
    expect(ids({ ...base, monthSpentEur: 25 })).toContain("budget-warning");
  });

  it("raises an error when the budget is exceeded", () => {
    const alerts = buildCostAlerts({ ...base, monthSpentEur: 31 });
    expect(alerts[0]).toMatchObject({ id: "budget-exceeded", level: "error" });
  });

  it("warns about a projection over budget after a few days", () => {
    expect(ids({ ...base, day: "2026-09-10", monthSpentEur: 15 })).toContain(
      "budget-projection",
    );
  });

  it("flags an unusual spending spike", () => {
    expect(ids({ ...base, todaySpentEur: 4 })).toContain("spend-spike");
  });

  it("distinguishes low and critical balance", () => {
    expect(ids({ ...base, balanceEur: 8 })).toContain("balance-low");
    expect(ids({ ...base, balanceEur: 2 })).toContain("balance-critical");
  });

  it("ignores budget alerts when no budget is set", () => {
    const settings = { ...DEFAULT_COST_SETTINGS, monthlyBudgetEur: 0 };
    expect(ids({ ...base, settings, monthSpentEur: 500 })).toEqual([]);
  });
});
