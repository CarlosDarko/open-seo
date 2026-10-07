// Measures what happened after an action was marked as done. The numbers of
// the 28 days before the change are stored when it is marked; once at least
// 14 days of data exist after it, the same scope (page, query) is measured
// again and compared per day. The whole site is measured too, so a general
// rise or fall is not credited to the action.
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";
import type { ActionKind } from "@/custom/radar/actions";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Search Console data is final about three days late. */
const GSC_LAG_DAYS = 3;
const BASELINE_DAYS = 28;
const MAX_AFTER_DAYS = 28;
export const MIN_AFTER_DAYS = 14;
const MIN_BASELINE_IMPRESSIONS = 100;
const NOTABLE_EFFECT = 0.1;
const NOTABLE_POSITION = 1;

export type WindowStats = {
  clicks: number;
  impressions: number;
  /** Impression-weighted average position; 0 without impressions. */
  position: number;
  days: number;
};

export type Baseline = {
  start: string;
  end: string;
  page: WindowStats;
  site: WindowStats;
};

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayStart(date: Date | string): number {
  const text = typeof date === "string" ? date : iso(date.getTime());
  return Date.parse(`${text.slice(0, 10)}T00:00:00Z`);
}

export function statsFromRows(
  rows: GscSearchAnalyticsRow[],
  days: number,
): WindowStats {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    weighted += row.position * row.impressions;
  }
  return {
    clicks,
    impressions,
    position: impressions > 0 ? weighted / impressions : 0,
    days,
  };
}

/** The dates to measure for an action done on `doneAt`: the baseline before
 *  it, and the window after it when enough data exists. */
export function measurementWindows(
  doneAt: Date | string,
  today: Date = new Date(),
) {
  const done = dayStart(doneAt);
  const baselineEnd = done - GSC_LAG_DAYS * DAY_MS;
  const baselineStart = baselineEnd - (BASELINE_DAYS - 1) * DAY_MS;
  const afterStart = done + DAY_MS;
  const availableEnd = dayStart(today) - GSC_LAG_DAYS * DAY_MS;
  const afterEnd = Math.min(availableEnd, done + MAX_AFTER_DAYS * DAY_MS);
  const afterDays = Math.floor((afterEnd - afterStart) / DAY_MS) + 1;
  return {
    baseline: {
      start: iso(baselineStart),
      end: iso(baselineEnd),
      days: BASELINE_DAYS,
    },
    after:
      afterDays >= MIN_AFTER_DAYS
        ? { start: iso(afterStart), end: iso(afterEnd), days: afterDays }
        : null,
    waitingDays: Math.max(0, MIN_AFTER_DAYS - Math.max(afterDays, 0)),
  };
}

export type Verdict = "mejora" | "empeora" | "sin_cambio" | "pocos_datos";

export type MetricChange = {
  before: number;
  after: number;
  /** Relative change, or null when there was nothing before. */
  changePct: number | null;
};

export type Impact = {
  clicks: MetricChange;
  impressions: MetricChange;
  ctr: MetricChange;
  position: { before: number; after: number; delta: number };
  siteClicksChangePct: number | null;
  /** Page change minus site change, in fraction points; null if unknown. */
  effectVsSite: number | null;
  /** Which metric decided the verdict. */
  primary: "ctr" | "position" | "clicks";
  verdict: Verdict;
};

function perDay(stats: WindowStats, value: number): number {
  return stats.days > 0 ? value / stats.days : 0;
}

function change(before: number, after: number): MetricChange {
  return {
    before,
    after,
    changePct: before > 0 ? (after - before) / before : null,
  };
}

function ctrOf(stats: WindowStats): number {
  return stats.impressions > 0 ? stats.clicks / stats.impressions : 0;
}

function primaryFor(kind: ActionKind): Impact["primary"] {
  if (kind === "snippet") return "ctr";
  if (kind === "push") return "position";
  return "clicks";
}

export function judgeImpact(
  kind: ActionKind,
  baseline: Baseline,
  after: { page: WindowStats; site: WindowStats },
): Impact {
  const clicks = change(
    perDay(baseline.page, baseline.page.clicks),
    perDay(after.page, after.page.clicks),
  );
  const impressions = change(
    perDay(baseline.page, baseline.page.impressions),
    perDay(after.page, after.page.impressions),
  );
  const ctr = change(ctrOf(baseline.page), ctrOf(after.page));
  const position = {
    before: baseline.page.position,
    after: after.page.position,
    delta: after.page.position - baseline.page.position,
  };
  const siteChange = change(
    perDay(baseline.site, baseline.site.clicks),
    perDay(after.site, after.site.clicks),
  ).changePct;
  const primary = primaryFor(kind);

  const metric = primary === "ctr" ? ctr : clicks;
  const effectVsSite =
    metric.changePct === null
      ? null
      : metric.changePct - (primary === "clicks" ? (siteChange ?? 0) : 0);

  let verdict: Verdict;
  if (baseline.page.impressions < MIN_BASELINE_IMPRESSIONS) {
    verdict = "pocos_datos";
  } else if (primary === "position") {
    verdict =
      position.delta <= -NOTABLE_POSITION
        ? "mejora"
        : position.delta >= NOTABLE_POSITION
          ? "empeora"
          : "sin_cambio";
  } else if (metric.changePct === null) {
    verdict = metric.after > 0 ? "mejora" : "sin_cambio";
  } else if (effectVsSite !== null && effectVsSite >= NOTABLE_EFFECT) {
    verdict = "mejora";
  } else if (effectVsSite !== null && effectVsSite <= -NOTABLE_EFFECT) {
    verdict = "empeora";
  } else {
    verdict = "sin_cambio";
  }

  return {
    clicks,
    impressions,
    ctr,
    position,
    siteClicksChangePct: siteChange,
    effectVsSite,
    primary,
    verdict,
  };
}
