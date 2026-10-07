// Alert rules: "tell me when <what> <metric> <condition>". A rule compares the
// last N days with the N days before, can be narrowed with extra conditions
// and says who to tell and how. Pure logic: the data comes from the server
// (server/alertsEngine.ts).

export const SCOPES = [
  "site",
  "site_brand",
  "site_nonbrand",
  "top_pages",
  "top_queries",
  "pages_matching",
  "queries_matching",
  "page",
  "query",
  "device",
  "country",
] as const;
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
export const FILTER_OPS = ["gte", "lte"] as const;
export const DEVICES = ["MOBILE", "DESKTOP", "TABLET"] as const;

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

/** Scopes that need the user to say which page, query, word, device or
 *  country they mean. */
export const SCOPES_WITH_TARGET: Scope[] = [
  "page",
  "query",
  "pages_matching",
  "queries_matching",
  "device",
  "country",
];

/** An extra condition that narrows a rule: it only fires when this holds too.
 *  All of a rule's filters must hold. */
export type Filter = {
  metric: Metric;
  op: (typeof FILTER_OPS)[number];
  /** In the metric's own unit (CTR in percent). */
  value: number;
  /** Which of the two compared periods the filter looks at. */
  period: "current" | "previous";
};

/** Who to tell besides the alerts list inside the tool. */
export type Notify = {
  emails: string[];
  webhooks: string[];
};

export type Rule = {
  id: string;
  name: string;
  scope: Scope;
  /** The page URL, the query, the word, the device or the country code, for
   *  the scopes that need one. */
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
  /** Extra conditions that must also hold (an AND). */
  filters?: Filter[];
  notify?: Notify;
};

export type Values = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type Item = {
  label: string;
  url: string | null;
  current: Values;
  previous: Values;
};

export type Triggered = {
  label: string;
  url: string | null;
  before: number;
  after: number;
  /** Relative change in percent, when there was something before. */
  changePct: number | null;
};

export function isValidCombination(
  metric: Metric,
  condition: Condition,
): boolean {
  return VALID_CONDITIONS[metric].includes(condition);
}

function valueOf(values: Values, metric: Metric): number {
  return metric === "ctr" ? values.ctr * 100 : values[metric];
}

function baselineOf(previous: Values, rule: Rule): number {
  return rule.metric === "clicks" ? previous.clicks : previous.impressions;
}

function passesFilters(filters: Filter[] | undefined, item: Item): boolean {
  return (filters ?? []).every((filter) => {
    const values = filter.period === "current" ? item.current : item.previous;
    const value = valueOf(values, filter.metric);
    return filter.op === "gte" ? value >= filter.value : value <= filter.value;
  });
}

/** Whether the rule fires for one item, and the figures behind it. */
export function checkItem(rule: Rule, item: Item): Triggered | null {
  if (!passesFilters(rule.filters, item)) return null;
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
      return enough &&
        before > 0 &&
        after > 0 &&
        after - before >= rule.threshold
        ? { ...base, changePct }
        : null;
    case "better_by":
      return enough &&
        before > 0 &&
        after > 0 &&
        before - after >= rule.threshold
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

// ------------------------------------------------------------------ text

export const METRIC_NAME: Record<Metric, string> = {
  clicks: "los clics",
  impressions: "las impresiones",
  ctr: "el CTR",
  position: "la posición media",
};

const METRIC_SHORT: Record<Metric, string> = {
  clicks: "clics",
  impressions: "impresiones",
  ctr: "CTR",
  position: "posición",
};

const DEVICE_NAME: Record<string, string> = {
  MOBILE: "móvil",
  DESKTOP: "ordenador",
  TABLET: "tableta",
};

/** What a rule looks at, as a noun phrase ("tus 20 páginas con más tráfico"). */
export function scopeText(rule: Pick<Rule, "scope" | "target">): string {
  const target = rule.target ?? "…";
  switch (rule.scope) {
    case "site":
      return "todo el sitio";
    case "site_brand":
      return "las consultas de marca";
    case "site_nonbrand":
      return "las consultas sin marca";
    case "top_pages":
      return "cualquiera de tus 20 páginas con más tráfico";
    case "top_queries":
      return "cualquiera de tus 50 consultas con más tráfico";
    case "pages_matching":
      return `las páginas cuya URL contiene «${target}»`;
    case "queries_matching":
      return `las consultas que contienen «${target}»`;
    case "page":
      return `la página ${target}`;
    case "query":
      return `la consulta «${target}»`;
    case "device":
      return `el tráfico desde ${DEVICE_NAME[target] ?? target}`;
    case "country":
      return `el tráfico del país ${target.toUpperCase()}`;
  }
}

function formatValue(metric: Metric, value: number): string {
  if (metric === "ctr") return `${value.toFixed(1).replace(".", ",")} %`;
  if (metric === "position") return value.toFixed(1).replace(".", ",");
  return Math.round(value).toLocaleString("es-ES");
}

function conditionText(rule: Rule): string {
  const t = rule.threshold.toLocaleString("es-ES");
  const unit = rule.metric === "ctr" ? " %" : "";
  switch (rule.condition) {
    case "drop_pct":
      return `${rule.metric === "position" ? "" : "bajen"} al menos un ${t} %`.trim();
    case "rise_pct":
      return `suban al menos un ${t} %`;
    case "below":
      return `caigan por debajo de ${t}${unit}`;
    case "above":
      return `superen ${t}${unit}`;
    case "worse_by":
      return `empeore al menos ${t} puestos`;
    case "better_by":
      return `mejore al menos ${t} puestos`;
  }
}

const OP_TEXT = { gte: "al menos", lte: "como mucho" } as const;
const PERIOD_TEXT = {
  current: "en el periodo actual",
  previous: "en el periodo anterior",
} as const;

export function describeFilter(filter: Filter): string {
  const unit = filter.metric === "ctr" ? " %" : "";
  return `${METRIC_SHORT[filter.metric]} ${OP_TEXT[filter.op]} ${filter.value.toLocaleString("es-ES")}${unit} (${PERIOD_TEXT[filter.period]})`;
}

/** The whole rule in one readable sentence, for the form preview and the list. */
export function describeRule(rule: Rule): string {
  const verb =
    rule.condition === "worse_by" || rule.condition === "better_by"
      ? "la posición media"
      : METRIC_NAME[rule.metric];
  const subject = rule.scope === "site" ? "del sitio" : `de ${scopeText(rule)}`;
  const filters = (rule.filters ?? []).map(describeFilter);
  const notify = [
    "en la herramienta",
    ...(rule.notify?.emails.length
      ? [`por correo a ${rule.notify.emails.join(", ")}`]
      : []),
    ...(rule.notify?.webhooks.length
      ? [`por webhook (${rule.notify.webhooks.length})`]
      : []),
  ];
  const minimum =
    rule.minValue > 0
      ? ` Se ignoran las cifras con menos de ${rule.minValue.toLocaleString("es-ES")} ${rule.metric === "clicks" ? "clics" : "impresiones"} en el periodo anterior.`
      : "";
  return `Avisaré ${notify.join(" y ")} cuando ${verb} ${subject} ${conditionText(rule)} en los últimos ${rule.windowDays} días frente a los ${rule.windowDays} anteriores${filters.length ? `, siempre que además ${filters.join(" y ")}` : ""}.${minimum}`;
}

/** One sentence for the alert list. */
export function describeTrigger(rule: Rule, hits: Triggered[]): string {
  const days = `${rule.windowDays} días`;
  const what = METRIC_NAME[rule.metric];
  const single: Scope[] = [
    "site",
    "site_brand",
    "site_nonbrand",
    "page",
    "query",
    "device",
    "country",
  ];
  if (single.includes(rule.scope)) {
    const hit = hits[0];
    const subject =
      rule.scope === "site"
        ? "del sitio"
        : rule.scope === "page"
          ? `de ${hit.label}`
          : `de ${scopeText(rule)}`;
    const move =
      hit.changePct === null
        ? `${formatValue(rule.metric, hit.before)} → ${formatValue(rule.metric, hit.after)}`
        : `${hit.changePct > 0 ? "+" : ""}${hit.changePct.toFixed(0)} % (${formatValue(rule.metric, hit.before)} → ${formatValue(rule.metric, hit.after)})`;
    return `${what.charAt(0).toUpperCase()}${what.slice(1)} ${subject}: ${move} en los últimos ${days}.`;
  }
  const noun =
    rule.scope === "top_pages" || rule.scope === "pages_matching"
      ? "páginas"
      : "consultas";
  return `${hits.length} ${noun} con cambio en ${what} en los últimos ${days}: ${hits
    .slice(0, 3)
    .map((hit) => hit.label)
    .join("; ")}${hits.length > 3 ? "…" : ""}.`;
}
