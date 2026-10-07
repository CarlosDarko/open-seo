// Date handling shared by the Radar, the action plan and Discover: a preset
// or custom range, compared with the period right before it or with the same
// dates one year earlier.
import { z } from "zod";
import { resolveDateRange } from "@/server/features/gsc/searchAnalytics";
import { previousPeriod } from "@/server/features/gsc/searchPerformanceReport";

const DAY_MS = 24 * 60 * 60 * 1000;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const RADAR_RANGES = [
  "last_7_days",
  "last_28_days",
  "last_3_months",
  "last_6_months",
  "last_12_months",
  "last_16_months",
  "custom",
] as const;

export const periodInputSchema = z.object({
  range: z.enum(RADAR_RANGES).default("last_28_days"),
  startDate: date.optional(),
  endDate: date.optional(),
  compare: z.enum(["previous", "year"]).default("previous"),
});

export type PeriodInput = z.infer<typeof periodInputSchema>;

export type ResolvedPeriods = {
  current: { startDate: string; endDate: string };
  previous: { startDate: string; endDate: string };
  compare: "previous" | "year";
  /** The year-ago comparison was asked for but Search Console does not keep
   *  data that far back, so the previous period is used instead. */
  fellBack: boolean;
  /** False when the period before would need data older than the 16 months
   *  Search Console keeps: nothing is compared then (a shorter or partial
   *  period would not be fair). `previous` is then not meaningful. */
  comparable: boolean;
  days: number;
};

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function shiftYears(day: string, years: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  const month = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + years);
  // 29 February in a non-leap year rolls into March: pull it back.
  if (d.getUTCMonth() !== month) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

export function resolvePeriods(
  input: PeriodInput,
  today: Date = new Date(),
): ResolvedPeriods {
  let current: { startDate: string; endDate: string };
  if (input.range === "custom" && input.startDate && input.endDate) {
    const [startDate, endDate] =
      input.startDate <= input.endDate
        ? [input.startDate, input.endDate]
        : [input.endDate, input.startDate];
    current = resolveDateRange({ startDate, endDate }, today);
  } else {
    current = resolveDateRange(
      { dateRange: input.range === "custom" ? "last_28_days" : input.range },
      today,
    );
  }
  if (current.endDate < current.startDate) {
    current = { startDate: current.endDate, endDate: current.endDate };
  }

  const days =
    Math.round(
      (Date.parse(`${current.endDate}T00:00:00Z`) -
        Date.parse(`${current.startDate}T00:00:00Z`)) /
        DAY_MS,
    ) + 1;

  // Search Console keeps 16 months: a comparison period that does not fit
  // inside them cannot have the same number of days, so it is not offered.
  const floor = resolveDateRange(
    { dateRange: "last_16_months" },
    today,
  ).startDate;
  const before = previousPeriod(current.startDate, current.endDate);
  const previousFits = before.startDate >= floor;

  if (input.compare === "year") {
    const yearAgo = {
      startDate: shiftYears(current.startDate, -1),
      endDate: shiftYears(current.endDate, -1),
    };
    if (yearAgo.startDate >= floor) {
      return {
        current,
        previous: yearAgo,
        compare: "year",
        fellBack: false,
        comparable: true,
        days,
      };
    }
    return {
      current,
      previous: before,
      compare: "previous",
      fellBack: previousFits,
      comparable: previousFits,
      days,
    };
  }
  return {
    current,
    previous: before,
    compare: "previous",
    fellBack: false,
    comparable: previousFits,
    days,
  };
}

/** Days between two ISO dates (later minus earlier). */
export function shiftInDays(later: string, earlier: string): number {
  return Math.round(
    (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) /
      DAY_MS,
  );
}

export { iso as isoDate };
