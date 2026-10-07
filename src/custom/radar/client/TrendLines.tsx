import { useState } from "react";

// Optional reference lines for the daily charts: the average of the period and
// the trend (a straight line fitted to the days). Whether they are shown is
// remembered in this browser only.
const STORAGE_KEY = "radar-trend-lines-v1";

type Choice = { mean: boolean; trend: boolean };

function readChoice(): Choice {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Choice>;
      return { mean: parsed.mean === true, trend: parsed.trend === true };
    }
  } catch {
    // No storage: both lines start hidden.
  }
  return { mean: false, trend: false };
}

export function useTrendLines() {
  const [choice, setChoice] = useState<Choice>(readChoice);
  const update = (next: Choice) => {
    setChoice(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The choice then lasts for this visit only.
    }
  };
  return {
    showMean: choice.mean,
    showTrend: choice.trend,
    toggleMean: () => update({ ...choice, mean: !choice.mean }),
    toggleTrend: () => update({ ...choice, trend: !choice.trend }),
  };
}

/** Adds `trend` (least-squares line over the days) to each point and returns
 *  the average of the series and how much the trend line moves in the period
 *  (last point against first). */
export function withTrend<T extends Record<string, unknown>>(
  data: T[],
  key: keyof T & string,
): {
  data: (T & { trend: number | null })[];
  mean: number | null;
  trendChange: number | null;
} {
  const values = data.map((point) => Number(point[key]) || 0);
  const n = values.length;
  if (n === 0) return { data: [], mean: null, trendChange: null };
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const xMean = (n - 1) / 2;
  let covariance = 0;
  let variance = 0;
  values.forEach((value, x) => {
    covariance += (x - xMean) * (value - mean);
    variance += (x - xMean) ** 2;
  });
  const slope = variance > 0 ? covariance / variance : 0;
  const at = (x: number) => mean + slope * (x - xMean);
  const first = at(0);
  return {
    mean,
    trendChange:
      n > 1 && first !== 0 ? (at(n - 1) - first) / Math.abs(first) : null,
    data: data.map((point, x) => ({
      ...point,
      trend: n > 1 ? at(x) : null,
    })),
  };
}
