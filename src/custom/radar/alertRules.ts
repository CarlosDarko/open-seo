// Alert rules: "tell me when <what> <metric> <condition>". A rule compares the
// last N days with the N days before. Pure logic: the data comes from the
// server (server/alertsEngine.ts).

export const SCOPES = ["site", "top_pages", "top_queries", "page", "query"] as const;
export const METRICS = ["clicks", "impressions", "ctr", "position"] as const;
export const CONDITIONS = [
  "drop_pct",
  "rise_pct",
  "below",
  "above",
  "worse_by",
  "better_by",
] as const;
export const WINDOWS = [7, 14, 28] as const;

export type Scope = (typeof SCOPES)[number];
export type Metric = (typeof METRICS)[number];
export type Condition = (typeof CONDITIONS)[number];

/** Which conditions make sense for each metric. */
export const VALID_CONDITIONS: Record<Metric, Condition[]> = {
  clicks: ["drop_pct", "rise_pct", "below", "above"],
  impressions: ["drop_pct", "rise_pct", "below", "above"],
  ctr: ["drop_pct", "rise_pct", "below", "above"],
  position: ["worse_by", "better_by"],
};

export type Rule = {
  id: string;
  name: string;
  scope: Scope;
  /** The page URL or the query, for the "page" and "query" scopes. */
  target: string | null;
  metric: Metric;
  condition: Condition;
  /** Percent for drop/rise; places for worse/better; the value itself for
   *  below/above (CTR in percent). */
  threshold: number;
  windowDays: number;
  /** Ignore items with less than this much before: clicks or impressions of
   *  the previous window (impressions for CTR and position). */
  minValue: number;
};

export type Values = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type Item = { label: string; url: string | null; current: Values; previous: Values };

export type Triggered = {
  label: string;
  url: string | null;
  before: number;
  after: number;
  /** Relative change in percent, when there was something before. */
  changePct: number | null;
};

export function isValidCombination(metric: Metric, condition: Condition): boolean {
  return VALID_CONDITIONS[metric].includes(condition);
}

function valueOf(values: Values, metric: Metric): number {
  return metric === "ctr" ? values.ctr * 100 : values[metric];
}

function baselineOf(previous: Values, rule: Rule): number {
  return rule.metric === "clicks"
    ? previous.clicks
    : rule.metric === "impressions"
      ? previous.impressions
      : previous.impressions;
}

/** Whether the rule fires for one item, and the figures behind it. */
export function checkItem(rule: Rule, item: Item): Triggered | null {
  const before = valueOf(item.previous, rule.metric);
  const after = valueOf(item.current, rule.metric);
  const base = { label: item.label, url: item.url, before, after };
  const changePct = before > 0 ? ((after - before) / before) * 100 : null;
  const enough = baselineOf(item.previous, rule) >= rule.minValue;

  switch (rule.condition) {
    case "drop_pct":
      return enough && changePct !== null && -changePct >= rule.threshold
        ? { ...base, changePct }
        : null;
    case "rise_pct":
      return enough && changePct !== null && changePct >= rule.threshold
        ? { ...base, changePct }
        : null;
    case "below":
      // Only when it crosses the line: a value that stays below does not
      // raise the same alert every day.
      return after < rule.threshold && before >= rule.threshold
        ? { ...base, changePct }
        : null;
    case "above":
      return after > rule.threshold && before <= rule.threshold
        ? { ...base, changePct }
        : null;
    case "worse_by":
      return enough && before > 0 && after > 0 && after - before >= rule.threshold
        ? { ...base, changePct }
        : null;
    case "better_by":
      return enough && before > 0 && after > 0 && before - after >= rule.threshold
        ? { ...base, changePct }
        : null;
  }
}

/** The items that fire, the most serious first. */
export function checkRule(rule: Rule, items: Item[], limit = 10): Triggered[] {
  return items
    .flatMap((item) => {
      const hit = checkItem(rule, item);
      return hit ? [hit] : [];
    })
    .sort(
      (a, b) =>
        Math.abs(b.after - b.before) / Math.max(b.before, 1) -
        Math.abs(a.after - a.before) / Math.max(a.before, 1),
    )
    .slice(0, limit);
}

const METRIC_LABEL: Record<Metric, string> = {
  clicks: "los clics",
  impressions: "las impresiones",
  ctr: "el CTR",
  position: "la posición media",
};

function format(metric: Metric, value: number): string {
  if (metric === "ctr") return `${value.toFixed(1).replace(".", ",")} %`;
  if (metric === "position") return value.toFixed(1).replace(".", ",");
  return Math.round(value).toLocaleString("es-ES");
}

/** One sentence for the alert list. */
export function describeTrigger(rule: Rule, hits: Triggered[]): string {
  const days = `${rule.windowDays} días`;
  const what = METRIC_LABEL[rule.metric];
  if (rule.scope === "site" || rule.scope === "page" || rule.scope === "query") {
    const hit = hits[0];
    const subject =
      rule.scope === "site"
        ? "del sitio"
        : rule.scope === "page"
          ? `de ${hit.label}`
          : `de «${hit.label}»`;
    const move =
      hit.changePct === null
        ? `${format(rule.metric, hit.before)} → ${format(rule.metric, hit.after)}`
        : `${hit.changePct > 0 ? "+" : ""}${hit.changePct.toFixed(0)} % (${format(rule.metric, hit.before)} → ${format(rule.metric, hit.after)})`;
    return `${what.charAt(0).toUpperCase()}${what.slice(1)} ${subject}: ${move} en los últimos ${days}.`;
  }
  const noun = rule.scope === "top_pages" ? "páginas" : "consultas";
  return `${hits.length} ${noun} con cambio en ${what} en los últimos ${days}: ${hits
    .slice(0, 3)
    .map((hit) => hit.label)
    .join("; ")}${hits.length > 3 ? "…" : ""}.`;
}
