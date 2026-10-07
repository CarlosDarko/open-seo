import { GscService } from "@/server/features/gsc/services/GscService";
import type { GscPerformanceFilter } from "@/server/features/gsc/searchAnalytics";
import { sumSearchTotals } from "@/server/features/gsc/searchPerformanceReport";
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";
import {
  checkRule,
  describeTrigger,
  FILTER_OPS,
  METRICS,
  type Filter,
  type Item,
  type Notify,
  type Rule,
  type Triggered,
  type Values,
} from "@/custom/radar/alertRules";
import {
  brandTokens,
  canonicalPageKey,
  isBrandQuery,
  mergePageVariants,
  normalizeBrandTerms,
  subtractTotals,
} from "@/custom/radar/radarAnalysis";
import { pathOf } from "@/custom/radar/format";
import { getBrandTerms } from "@/custom/radar/server/brandSettings";
import { sendAlertNotifications } from "@/custom/radar/server/notify";
import { insertEvent, type RuleRow } from "@/custom/radar/server/radarDb";
import { fetchScopeStats, type Window } from "@/custom/radar/server/scopeStats";
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
    previous: {
      start: iso(prevStart),
      end: iso(prevEnd),
      days: windowDays,
    } as Window,
  };
}

type Windows = ReturnType<typeof alertWindows>;

function valuesOfRow(row: {
  clicks: number;
  impressions: number;
  position: number;
}): Values {
  return {
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
    position: row.position,
  };
}

function valuesOfStats(stats: WindowStats): Values {
  return valuesOfRow(stats);
}

const EMPTY: Values = { clicks: 0, impressions: 0, ctr: 0, position: 0 };

function parseFilters(json: string | null): Filter[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as Partial<Filter>[];
    return raw.flatMap((filter) =>
      filter &&
      METRICS.includes(filter.metric as Filter["metric"]) &&
      FILTER_OPS.includes(filter.op as Filter["op"]) &&
      typeof filter.value === "number" &&
      (filter.period === "current" || filter.period === "previous")
        ? [filter as Filter]
        : [],
    );
  } catch {
    return [];
  }
}

function parseNotify(json: string | null): Notify {
  const empty: Notify = { emails: [], webhooks: [] };
  if (!json) return empty;
  try {
    const raw = JSON.parse(json) as Partial<Notify>;
    return {
      emails: Array.isArray(raw.emails)
        ? raw.emails.filter((item): item is string => typeof item === "string")
        : [],
      webhooks: Array.isArray(raw.webhooks)
        ? raw.webhooks.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
    };
  } catch {
    return empty;
  }
}

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
    filters: parseFilters(row.filters_json),
    notify: parseNotify(row.notify_json),
  };
}

async function rowsFor(
  projectId: string,
  dimension: "page" | "query" | "date",
  window: Window,
  filters?: GscPerformanceFilter[],
): Promise<GscSearchAnalyticsRow[]> {
  const result = await GscService.getPerformance({
    projectId,
    startDate: window.start,
    endDate: window.end,
    dimensions: [dimension],
    filters,
    rowLimit: dimension === "date" ? 500 : ROW_LIMIT,
  });
  return result.rows;
}

/** Totals of a window, optionally restricted by a Search Console filter. */
async function totalsOf(
  projectId: string,
  window: Window,
  filters?: GscPerformanceFilter[],
): Promise<Values> {
  const rows = await rowsFor(projectId, "date", window, filters);
  return valuesOfRow({ ...sumSearchTotals(rows) });
}

/** One item per page or query (the busiest ones), with both windows. */
async function listItems(
  projectId: string,
  byPage: boolean,
  windows: Windows,
  filters?: GscPerformanceFilter[],
): Promise<Item[]> {
  const dimension = byPage ? "page" : "query";
  const [nowRows, beforeRows] = await Promise.all([
    rowsFor(projectId, dimension, windows.current, filters),
    rowsFor(projectId, dimension, windows.previous, filters),
  ]);
  const now = byPage ? mergePageVariants(nowRows, 0) : nowRows;
  const before = byPage ? mergePageVariants(beforeRows, 0) : beforeRows;
  const keyOf = (row: GscSearchAnalyticsRow) =>
    byPage ? canonicalPageKey(row.keys?.[0] ?? "") : (row.keys?.[0] ?? "");
  const limit = byPage ? TOP_PAGES : TOP_QUERIES;
  const nowMap = new Map(now.map((row) => [keyOf(row), row]));
  const beforeMap = new Map(before.map((row) => [keyOf(row), row]));
  const top = (rows: GscSearchAnalyticsRow[]) =>
    [...rows]
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, limit)
      .map(keyOf);
  const keys = new Set([...top(before), ...top(now)]);
  return [...keys].map((key) => {
    const row = nowMap.get(key) ?? beforeMap.get(key);
    const raw = row?.keys?.[0] ?? key;
    const current = nowMap.get(key);
    const previous = beforeMap.get(key);
    return {
      label: byPage ? pathOf(raw) : raw,
      url: byPage ? raw : null,
      current: current ? valuesOfRow(current) : EMPTY,
      previous: previous ? valuesOfRow(previous) : EMPTY,
    };
  });
}

async function brandItems(
  projectId: string,
  rule: Rule,
  windows: Windows,
): Promise<Item[]> {
  const connection = await GscService.getConnection(projectId);
  const manual = await getBrandTerms(projectId);
  const tokens =
    manual.length > 0
      ? normalizeBrandTerms(manual)
      : connection
        ? brandTokens(connection.siteUrl)
        : [];
  const forWindow = async (window: Window): Promise<Values> => {
    const [all, queries] = await Promise.all([
      rowsFor(projectId, "date", window),
      rowsFor(projectId, "query", window),
    ]);
    const total = sumSearchTotals(all);
    const brand = sumSearchTotals(
      queries.filter((row) => isBrandQuery(row.keys?.[0] ?? "", tokens)),
    );
    const part =
      rule.scope === "site_brand" ? brand : subtractTotals(total, brand);
    return valuesOfRow(part);
  };
  const [current, previous] = await Promise.all([
    forWindow(windows.current),
    forWindow(windows.previous),
  ]);
  return [
    {
      label: rule.scope === "site_brand" ? "marca" : "sin marca",
      url: null,
      current,
      previous,
    },
  ];
}

/** The items a rule looks at, with their figures in both windows. */
async function itemsFor(
  projectId: string,
  rule: Rule,
  windows: Windows,
): Promise<Item[]> {
  const { current, previous } = windows;
  const target = rule.target ?? "";
  const single = async (label: string, filters?: GscPerformanceFilter[]) => [
    {
      label,
      url: null,
      current: await totalsOf(projectId, current, filters),
      previous: await totalsOf(projectId, previous, filters),
    },
  ];
  switch (rule.scope) {
    case "site":
      return single("sitio");
    case "device":
      return single(target, [
        { dimension: "device", operator: "equals", expression: target },
      ]);
    case "country":
      return single(target.toUpperCase(), [
        {
          dimension: "country",
          operator: "equals",
          expression: target.toLowerCase(),
        },
      ]);
    case "site_brand":
    case "site_nonbrand":
      return brandItems(projectId, rule, windows);
    case "top_pages":
      return listItems(projectId, true, windows);
    case "top_queries":
      return listItems(projectId, false, windows);
    case "pages_matching":
      return listItems(projectId, true, windows, [
        { dimension: "page", operator: "contains", expression: target },
      ]);
    case "queries_matching":
      return listItems(projectId, false, windows, [
        { dimension: "query", operator: "contains", expression: target },
      ]);
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
          label: rule.scope === "page" ? pathOf(target) : target,
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

/** Evaluates the rules, stores one alert per rule for today and tells the
 *  people and channels each rule names (only for alerts that are new). */
export async function evaluateAndStore(
  projectId: string,
  rules: Rule[],
): Promise<{ results: RuleResult[]; created: number }> {
  const results = await evaluateRules(projectId, rules);
  const now = new Date();
  const connection =
    results.length > 0 ? await GscService.getConnection(projectId) : null;
  const site = connection
    ? connection.siteUrl
        .replace(/^sc-domain:/, "")
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "")
    : null;
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
      details_json: JSON.stringify({
        window: result.window,
        hits: result.hits,
      }),
      seen: 0,
    });
    if (!inserted) continue;
    created += 1;
    try {
      const sent = await sendAlertNotifications({
        projectId,
        rule: result.rule,
        summary: result.summary,
        hits: result.hits,
        site,
      });
      for (const item of sent) {
        if (!item.ok)
          console.error(
            "[radar-alerts] notify failed",
            item.channel,
            item.error,
          );
      }
    } catch (error) {
      console.error("[radar-alerts] notifications failed", error);
    }
  }
  return { results, created };
}
