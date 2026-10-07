import { describe, expect, it } from "vitest";
import { resolvePeriods } from "@/custom/radar/periods";

const today = new Date("2026-10-07T12:00:00Z");

describe("resolvePeriods", () => {
  it("compares a preset with the period right before it", () => {
    const result = resolvePeriods(
      { range: "last_28_days", compare: "previous" },
      today,
    );
    expect(result.current).toEqual({
      startDate: "2026-09-06",
      endDate: "2026-10-04",
    });
    expect(result.previous.endDate).toBe("2026-09-05");
    expect(result.days).toBe(29);
    expect(result.fellBack).toBe(false);
  });

  it("compares a custom range with the same dates a year earlier", () => {
    const result = resolvePeriods(
      {
        range: "custom",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        compare: "year",
      },
      today,
    );
    expect(result.previous).toEqual({
      startDate: "2025-09-01",
      endDate: "2025-09-30",
    });
    expect(result.compare).toBe("year");
  });

  it("falls back to the previous period when the year-ago data no longer exists", () => {
    const result = resolvePeriods(
      { range: "last_6_months", compare: "year" },
      today,
    );
    expect(result.fellBack).toBe(true);
    expect(result.compare).toBe("previous");
    expect(result.comparable).toBe(true);
  });

  it("does not compare when the period before would be older than 16 months", () => {
    for (const range of ["last_12_months", "last_16_months"] as const) {
      for (const compare of ["previous", "year"] as const) {
        const result = resolvePeriods({ range, compare }, today);
        expect(result.comparable).toBe(false);
      }
    }
    expect(
      resolvePeriods({ range: "last_28_days", compare: "previous" }, today)
        .comparable,
    ).toBe(true);
  });

  it("accepts a custom range given backwards", () => {
    const result = resolvePeriods(
      {
        range: "custom",
        startDate: "2026-09-30",
        endDate: "2026-09-01",
        compare: "previous",
      },
      today,
    );
    expect(result.current.startDate).toBe("2026-09-01");
  });
});
