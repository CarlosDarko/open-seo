import { describe, expect, it } from "vitest";
import { withTrend } from "@/custom/radar/client/TrendLines";

describe("withTrend", () => {
  it("returns the average and a straight line through a rising series", () => {
    const { mean, data } = withTrend(
      [{ clicks: 10 }, { clicks: 20 }, { clicks: 30 }],
      "clicks",
    );
    expect(mean).toBe(20);
    expect(data.map((point) => point.trend)).toEqual([10, 20, 30]);
  });

  it("is flat when the series does not change and empty without data", () => {
    expect(
      withTrend([{ clicks: 5 }, { clicks: 5 }], "clicks").data[1].trend,
    ).toBe(5);
    expect(withTrend([], "clicks")).toEqual({ data: [], mean: null });
  });
});
