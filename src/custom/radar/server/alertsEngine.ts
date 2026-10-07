import { GscService } from "@/server/features/gsc/services/GscService";
import { sumSearchTotals } from "@/server/features/gsc/searchPerformanceReport";
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";
import {
  checkRule,
  describeTrigger,
  type Item,
  type Rule,
  type Triggered,
  type Values,
} from "@/custom/radar/alertRules";
import {
  canonicalPageKey,
  mergePageVariants,
} from "@/custom/radar/radarAnalysis";
import { pathOf } from "@/custom/radar/format";
import { insertEvent, type RuleRow } from "@/custom/radar/server/radarDb";
import {
  fetchScopeStats,
  type Window,
} from "@/custom/radar/server/scopeStats";
import type { WindowStats } from "@/custom/radar/trackingImpact";

const DAY_MS = 24 * 60 * 60 * 1000;
const GSC_LAG_DAYS = 3;
const TOP_PAGES = 20;
const TOP_QUERIES = 50;
const ROW_LIMIT = 1000;

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The last N days of final data and the N days before them. */
export function alertWindows(windowDays: number, today: Date = new Date()) {
  const dayMs = Date.parse(`${iso(today.getTime())}T00:00:00Z`);
  const end = dayMs - GSC_LAG_DAYS * DAY_MS;
  const start = end - (windowDays - 1) * DAY_MS;
  const prevEnd = start - DAY_MS;
  const prevStart = prevEnd - (windowDays - 1) * DAY_MS;
  return {
    current: { start: iso(start), end: iso(end), days: windowDays } as Window,
    previous: { start: iso(prevStart), end: iso(prevEnd), days: windowDays } as Window,
  };
}

function valuesOfRow(row: GscSearchAnalyticsRow): Values {
  return {
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
    position: row.position,
  };
}

function valuesOfStats(stats: WindowStats): Values {
  return {
    clicks: stats.clicks,
    impressions: stats.impressions,
    ctr: stats.impressions > 0 ? stats.clicks / stats.impressions : 0,
    position: stats.position,
  };
}

const EMPTY: Values = { clicks: 0, impressions: 0, ctr: 0, position: 0 };

export function ruleFromRow(row: RuleRow): Rule {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope as Rule["scope"],
    target: row.target,
    metric: row.metric as Rule["metric"],
    condition: row.condition as Rule["condition"],
    threshold: row.threshold,
    windowDays: row.window_days,
    minValue: row.min_value,
  };
}

async function rowsFor(
  projectId: string,
  dimension: "page" | "query" | "date",
  window: Window,
): Promise<GscSearchAnalyticsRow[]> {
  const result = await GscService.getPerformance({
    projectId,
    startDate: window.start,
    endDate: window.end,
    dimensions: [dimension],
    rowLimit: dimension === "date" ? 500 : ROW_LIMIT,
  });
  return result.rows;
}

/** The items a rule looks at, with their figures in both windows. */
async function itemsFor(
  projectId: string,
  rule: Rule,
  windows: ReturnType<typeof alertWindows>,
): Promise<Item[]> {
  const { current, previous } = windows;
  switch (rule.scope) {
    case "site": {
      const [now, before] = await Promise.all([
        rowsFor(projectId, "date", current),
        rowsFor(projectId, "date", previous),
      ]);
      return [
        {
          label: "sitio",
          url: null,
          current: valuesOfRow({ ...sumSearchTotals(now), keys: [] }),
          previous: valuesOfRow({ ...sumSearchTotals(before), keys: [] }),
        },
      ];
    }
    case "top_pages":
    case "top_queries": {
      const byPage = rule.scope === "top_pages";
      const [nowRows, beforeRows] = await Promise.all([
        rowsFor(projectId, byPage ? "page" : "query", current),
        rowsFor(projectId, byPage ? "page" : "query", previous),
      ]);
      const now = byPage ? mergePageVariants(nowRows, 0) : nowRows;
      const before = byPage ? mergePageVariants(beforeRows, 0) : beforeRows;
      const keyOf = (row: GscSearchAnalyticsRow) =>
        byPage ? canonicalPageKey(row.keys?.[0] ?? "") : (row.keys?.[0] ?? "");
      const limit = byPage ? TOP_PAGES : TOP_QUERIES;
      const nowMap = new Map(now.map((row) => [keyOf(row), row]));
      const beforeMap = new Map(before.map((row) => [keyOf(row), row]));
      const top = (rows: GscSearchAnalyticsRow[]) =>
        [...rows].sort((a, b) => b.clicks - a.clicks).slice(0, limit).map(keyOf);
      const keys = new Set([...top(before), ...top(now)]);
      return [...keys].map((key) => {
        const row = nowMap.get(key) ?? beforeMap.get(key);
        const raw = row?.keys?.[0] ?? key;
        return {
          label: byPage ? pathOf(raw) : raw,
          url: byPage ? raw : null,
          current: nowMap.has(key) ? valuesOfRow(nowMap.get(key)!) : EMPTY,
          previous: beforeMap.has(key) ? valuesOfRow(beforeMap.get(key)!) : EMPTY,
        };
      });
    }
    case "page":
    case "query": {
      const scope =
        rule.scope === "page"
          ? { page: rule.target, query: null }
          : { page: null, query: rule.target };
      const [now, before] = await Promise.all([
        fetchScopeStats(projectId, scope, current),
        fetchScopeStats(projectId, scope, previous),
      ]);
      return [
        {
          label:
            rule.scope === "page" ? pathOf(rule.target ?? "") : (rule.target ?? ""),
          url: rule.scope === "page" ? rule.target : null,
          current: valuesOfStats(now),
          previous: valuesOfStats(before),
        },
      ];
    }
  }
}

export type RuleResult = {
  rule: Rule;
  hits: Triggered[];
  summary: string;
  window: { start: string; end: string; prevStart: string; prevEnd: string };
};

/** Checks the rules and returns those that fire. A rule that cannot be
 *  measured (for example a page with no data) simply does not fire. */
export async function evaluateRules(
  projectId: string,
  rules: Rule[],
): Promise<RuleResult[]> {
  const results: RuleResult[] = [];
  for (const rule of rules) {
    const windows = alertWindows(rule.windowDays);
    try {
      const hits = checkRule(rule, await itemsFor(projectId, rule, windows));
      if (hits.length === 0) continue;
      results.push({
        rule,
        hits,
        summary: describeTrigger(rule, hits),
        window: {
          start: windows.current.start,
          end: windows.current.end,
          prevStart: windows.previous.start,
          prevEnd: windows.previous.end,
        },
      });
    } catch (error) {
      console.error("[radar-alerts] rule failed", rule.id, error);
    }
  }
  return results;
}

/** Evaluates the rules and stores one alert per rule for today. Returns how
 *  many alerts are new. */
export async function evaluateAndStore(
  projectId: string,
  rules: Rule[],
): Promise<{ results: RuleResult[]; created: number }> {
  const results = await evaluateRules(projectId, rules);
  const now = new Date();
  let created = 0;
  for (const result of results) {
    const inserted = await insertEvent({
      id: crypto.randomUUID(),
      project_id: projectId,
      rule_id: result.rule.id,
      rule_name: result.rule.name,
      day: iso(now.getTime()),
      created_at: now.toISOString(),
      summary: result.summary,
      details_json: JSON.stringify({ window: result.window, hits: result.hits }),
      seen: 0,
    });
    if (inserted) created += 1;
  }
  return { results, created };
}
