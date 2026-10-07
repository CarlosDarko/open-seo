import { GscService } from "@/server/features/gsc/services/GscService";
import type { GscPerformanceFilter } from "@/server/features/gsc/searchAnalytics";
import { canonicalPageKey } from "@/custom/radar/radarAnalysis";
import { statsFromRows, type WindowStats } from "@/custom/radar/trackingImpact";

export type Scope = { page: string | null; query: string | null };
export type Window = { start: string; end: string; days: number };

function pathFragment(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  } catch {
    return url;
  }
}

/** Clicks, impressions and position of one page and/or query over a window.
 *  Search Console filters by "contains" on the path; the rows are then kept
 *  only when they belong to the same page once URL variants are merged. For
 *  the home page ("/") the filter cannot narrow anything, so a very large
 *  site may be measured on its first 1000 rows only. */
export async function fetchScopeStats(
  projectId: string,
  scope: Scope,
  window: Window,
): Promise<WindowStats> {
  const filters: GscPerformanceFilter[] = [];
  if (scope.query) {
    filters.push({
      dimension: "query",
      operator: "equals",
      expression: scope.query,
    });
  }
  if (scope.page) {
    filters.push({
      dimension: "page",
      operator: "contains",
      expression: pathFragment(scope.page),
    });
  }
  const result = await GscService.getPerformance({
    projectId,
    startDate: window.start,
    endDate: window.end,
    dimensions: scope.page ? ["date", "page"] : ["date"],
    filters,
    rowLimit: 1000,
  });
  const wanted = scope.page ? canonicalPageKey(scope.page) : null;
  const rows = wanted
    ? result.rows.filter(
        (row) => canonicalPageKey(row.keys?.[1] ?? "") === wanted,
      )
    : result.rows;
  return statsFromRows(rows, window.days);
}

/** The same figures for the whole site. */
export async function fetchSiteStats(
  projectId: string,
  window: Window,
): Promise<WindowStats> {
  const result = await GscService.getPerformance({
    projectId,
    startDate: window.start,
    endDate: window.end,
    dimensions: ["date"],
    rowLimit: 500,
  });
  return statsFromRows(result.rows, window.days);
}
