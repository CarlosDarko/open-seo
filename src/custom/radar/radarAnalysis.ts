// Pure analysis behind the "Radar SEO" page. Everything here works on rows
// that Google Search Console already returned (free), so the page adds charts,
// comparisons and priorities without any extra paid API call.
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- brand

function normalizeBrand(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** The site's brand as it would be typed without spaces ("carlosortega",
 *  "fruitsrafols"), taken from the Search Console property. */
export function brandTokens(siteUrl: string): string[] {
  let host = siteUrl;
  if (siteUrl.startsWith("sc-domain:")) {
    host = siteUrl.slice("sc-domain:".length);
  } else {
    try {
      host = new URL(siteUrl).hostname;
    } catch {
      return [];
    }
  }
  const label = host.replace(/^www\./, "").split(".")[0] ?? "";
  const token = normalizeBrand(label);
  return token.length >= 4 ? [token] : [];
}

/** The brand words as they are matched: no accents, spaces or symbols. */
export function normalizeBrandTerms(terms: string[]): string[] {
  const out = new Set<string>();
  for (const term of terms) {
    const normalized = normalizeBrand(term);
    if (normalized.length >= 3) out.add(normalized);
  }
  return [...out];
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export type BrandSuspect = {
  query: string;
  /** The words of the query that look like the brand, as typed. */
  variant: string;
  clicks: number;
  impressions: number;
};

/** Queries NOT counted as brand that contain a word close to the brand: very
 *  probably misspellings (a swapped or missing letter), so the user can add
 *  them. Only for brand words of five or more letters. */
export function brandSuspects(
  nonBrandRows: GscSearchAnalyticsRow[],
  tokens: string[],
  limit = 8,
): BrandSuspect[] {
  const found: BrandSuspect[] = [];
  const long = tokens.filter((token) => token.length >= 5);
  if (long.length === 0) return found;
  for (const row of nonBrandRows) {
    const query = row.keys?.[0];
    if (!query) continue;
    const words = query.trim().split(/\s+/);
    const candidates: { text: string; display: string }[] = [];
    for (let i = 0; i < words.length; i += 1) {
      candidates.push({ text: normalizeBrand(words[i]), display: words[i] });
      if (i + 1 < words.length) {
        candidates.push({
          text: normalizeBrand(words[i] + words[i + 1]),
          display: `${words[i]} ${words[i + 1]}`,
        });
      }
    }
    const hit = candidates.find((candidate) =>
      long.some((token) => {
        const maxDistance = token.length >= 9 ? 2 : 1;
        return (
          candidate.text.length >= 4 &&
          candidate.text !== token &&
          Math.abs(candidate.text.length - token.length) <= maxDistance &&
          editDistance(candidate.text, token) <= maxDistance
        );
      }),
    );
    if (hit) {
      found.push({
        query,
        variant: hit.display,
        clicks: row.clicks,
        impressions: row.impressions,
      });
    }
  }
  return found
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit);
}

export function isBrandQuery(query: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const normalized = normalizeBrand(query);
  return tokens.some((token) => normalized.includes(token));
}

export function splitBrandRows(
  rows: GscSearchAnalyticsRow[],
  tokens: string[],
): { brand: GscSearchAnalyticsRow[]; other: GscSearchAnalyticsRow[] } {
  const brand: GscSearchAnalyticsRow[] = [];
  const other: GscSearchAnalyticsRow[] = [];
  for (const row of rows) {
    const query = row.keys?.[0] ?? "";
    (isBrandQuery(query, tokens) ? brand : other).push(row);
  }
  return { brand, other };
}

export type Totals = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/** Site totals without the brand queries: the total Search Console reports
 *  minus what the detected brand queries add up to. Search Console hides
 *  rare queries, so subtracting from the total (instead of adding up the
 *  other queries) keeps those in the figure. */
export function subtractTotals(all: Totals, brand: Totals): Totals {
  const clicks = Math.max(0, all.clicks - brand.clicks);
  const impressions = Math.max(0, all.impressions - brand.impressions);
  const weighted =
    all.position * all.impressions - brand.position * brand.impressions;
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? Math.max(1, weighted / impressions) : 0,
  };
}

export function sumClicks(rows: GscSearchAnalyticsRow[]): number {
  return rows.reduce((sum, row) => sum + row.clicks, 0);
}

// ------------------------------------------------------- page variants

const TRACKING_PARAM = /^(utm_|gclid$|fbclid$|msclkid$|mc_|_ga$|ref$)/i;

/** One key per real page: GSC reports the same page under variants (www or
 *  not, http or https, trailing slash, fragments, tracking parameters). */
export function canonicalPageKey(url: string): string {
  try {
    const parsed = new URL(url);
    const params = [...parsed.searchParams.entries()]
      .filter(([name]) => !TRACKING_PARAM.test(name))
      .sort(([a], [b]) => a.localeCompare(b));
    const path =
      parsed.pathname.length > 1 && parsed.pathname.endsWith("/")
        ? parsed.pathname.slice(0, -1)
        : parsed.pathname;
    const query = params.length
      ? `?${params.map(([k, v]) => `${k}=${v}`).join("&")}`
      : "";
    return `${parsed.hostname.replace(/^www./i, "").toLowerCase()}${path}${query}`;
  } catch {
    return url;
  }
}

/** Merges the rows of URL variants of one page (clicks and impressions add
 *  up, position is weighted by impressions). The variant with most
 *  impressions stands for the page. `pageIndex` is where the page sits in
 *  the row's keys. */
export function mergePageVariants(
  rows: GscSearchAnalyticsRow[],
  pageIndex: number,
): GscSearchAnalyticsRow[] {
  type Group = {
    row: GscSearchAnalyticsRow;
    weighted: number;
    bestImpressions: number;
    keys: string[];
  };
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const url = row.keys?.[pageIndex];
    if (!url || !row.keys) continue;
    const id = [
      ...row.keys.map((key, index) =>
        index === pageIndex ? canonicalPageKey(key) : key,
      ),
    ].join("\u0000");
    const group = groups.get(id);
    if (!group) {
      groups.set(id, {
        row: { ...row },
        weighted: row.position * row.impressions,
        bestImpressions: row.impressions,
        keys: [...row.keys],
      });
      continue;
    }
    group.row.clicks += row.clicks;
    group.row.impressions += row.impressions;
    group.weighted += row.position * row.impressions;
    if (row.impressions > group.bestImpressions) {
      group.bestImpressions = row.impressions;
      group.keys = [...row.keys];
    }
  }
  return [...groups.values()].map((group) => ({
    keys: group.keys,
    clicks: group.row.clicks,
    impressions: group.row.impressions,
    ctr:
      group.row.impressions > 0 ? group.row.clicks / group.row.impressions : 0,
    position:
      group.row.impressions > 0
        ? group.weighted / group.row.impressions
        : group.row.position,
  }));
}

// ------------------------------------------------------- period changes

export type ChangeRow = {
  key: string;
  clicks: number;
  prevClicks: number;
  clicksDelta: number;
  impressions: number;
  prevImpressions: number;
  position: number | null;
  prevPosition: number | null;
  /** "new": nothing in the previous period; "lost": nothing in this one. */
  status: "new" | "lost" | "changed";
};

/** Compares one dimension (query or page) between two periods. */
export function compareDimension(
  current: GscSearchAnalyticsRow[],
  previous: GscSearchAnalyticsRow[],
): ChangeRow[] {
  const before = new Map<string, GscSearchAnalyticsRow>();
  for (const row of previous) {
    const key = row.keys?.[0];
    if (key) before.set(key, row);
  }

  const seen = new Set<string>();
  const rows: ChangeRow[] = [];
  for (const row of current) {
    const key = row.keys?.[0];
    if (!key) continue;
    seen.add(key);
    const old = before.get(key);
    rows.push({
      key,
      clicks: row.clicks,
      prevClicks: old?.clicks ?? 0,
      clicksDelta: row.clicks - (old?.clicks ?? 0),
      impressions: row.impressions,
      prevImpressions: old?.impressions ?? 0,
      position: row.position,
      prevPosition: old?.position ?? null,
      status: old ? "changed" : "new",
    });
  }
  for (const [key, old] of before) {
    if (seen.has(key)) continue;
    rows.push({
      key,
      clicks: 0,
      prevClicks: old.clicks,
      clicksDelta: -old.clicks,
      impressions: 0,
      prevImpressions: old.impressions,
      position: null,
      prevPosition: old.position,
      status: "lost",
    });
  }
  return rows;
}

export type ChangeCause =
  | "demanda"
  | "posicion"
  | "ctr"
  | "mixto"
  | "nueva"
  | "perdida";

/** Why a row changed: fewer searches, a worse position, or a worse CTR. */
export function explainChange(row: ChangeRow): ChangeCause {
  if (row.status === "new") return "nueva";
  if (row.status === "lost") return "perdida";
  const positionDelta =
    row.position !== null && row.prevPosition !== null
      ? row.position - row.prevPosition
      : 0;
  const impressionsChange =
    row.prevImpressions > 0
      ? (row.impressions - row.prevImpressions) / row.prevImpressions
      : 0;
  const ctr = row.impressions > 0 ? row.clicks / row.impressions : 0;
  const prevCtr =
    row.prevImpressions > 0 ? row.prevClicks / row.prevImpressions : 0;
  const ctrChange = prevCtr > 0 ? (ctr - prevCtr) / prevCtr : 0;

  const gone = row.clicksDelta < 0;
  const positionCause = gone ? positionDelta >= 1 : positionDelta <= -1;
  const demandCause = gone
    ? impressionsChange <= -0.15
    : impressionsChange >= 0.15;
  const ctrCause = gone ? ctrChange <= -0.2 : ctrChange >= 0.2;

  // A worse position or fewer searches lower the CTR as a consequence, so
  // the CTR only counts as the cause when both of them held steady.
  if (positionCause && demandCause) return "mixto";
  if (positionCause) return "posicion";
  if (demandCause) return "demanda";
  return ctrCause ? "ctr" : "mixto";
}

export type QueryDelta = {
  query: string;
  clicksDelta: number;
  position: number | null;
  prevPosition: number | null;
};

export type PageChange = ChangeRow & {
  cause: ChangeCause;
  topQueries: QueryDelta[];
};

/** Attaches the three queries that explain most of each page's change. Needs
 *  rows with dimensions ["query", "page"] for both periods. */
export function attachPageQueries(
  rows: ChangeRow[],
  current: GscSearchAnalyticsRow[],
  previous: GscSearchAnalyticsRow[],
): PageChange[] {
  const byPage = new Map<string, Map<string, QueryDelta>>();
  const slot = (page: string, query: string) => {
    const pageMap = byPage.get(page) ?? new Map<string, QueryDelta>();
    byPage.set(page, pageMap);
    const entry = pageMap.get(query) ?? {
      query,
      clicksDelta: 0,
      position: null,
      prevPosition: null,
    };
    pageMap.set(query, entry);
    return entry;
  };
  for (const row of current) {
    const [query, page] = row.keys ?? [];
    if (!query || !page) continue;
    const entry = slot(page, query);
    entry.clicksDelta += row.clicks;
    entry.position = row.position;
  }
  for (const row of previous) {
    const [query, page] = row.keys ?? [];
    if (!query || !page) continue;
    const entry = slot(page, query);
    entry.clicksDelta -= row.clicks;
    entry.prevPosition = row.position;
  }

  return rows.map((row) => ({
    ...row,
    cause: explainChange(row),
    topQueries: [...(byPage.get(row.key)?.values() ?? [])]
      .filter((q) => q.clicksDelta !== 0)
      .sort((a, b) => Math.abs(b.clicksDelta) - Math.abs(a.clicksDelta))
      .slice(0, 3),
  }));
}

/** Biggest gains and losses in clicks. */
export function winnersAndLosers<T extends ChangeRow>(rows: T[], limit = 10) {
  const winners = rows
    .filter((row) => row.clicksDelta > 0)
    .sort((a, b) => b.clicksDelta - a.clicksDelta)
    .slice(0, limit);
  const losers = rows
    .filter((row) => row.clicksDelta < 0)
    .sort((a, b) => a.clicksDelta - b.clicksDelta)
    .slice(0, limit);
  return { winners, losers };
}

/** Queries that appear (or vanish) between periods, by visibility. */
export function newAndLostQueries(rows: ChangeRow[], limit = 15) {
  return {
    newQueries: rows
      .filter((row) => row.status === "new" && row.impressions >= 10)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, limit),
    lostQueries: rows
      .filter((row) => row.status === "lost" && row.prevImpressions >= 10)
      .sort(
        (a, b) =>
          b.prevClicks - a.prevClicks || b.prevImpressions - a.prevImpressions,
      )
      .slice(0, limit),
  };
}

// ------------------------------------------------------------ CTR curve

// Typical click-through rate by organic position (1..10): the fallback when
// the site has too little data of its own.
const GENERIC_CTR = [
  0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018,
];
const BEYOND_TOP_TEN_CTR = 0.01;
const CURVE_MIN_IMPRESSIONS = 300;

/** CTR per position 1..10 measured on this site's own queries. Positions with
 *  too little data fall back to the generic curve scaled to the site: a site
 *  with AI answers or rich results above it earns far less than the average. */
export function ownCtrCurve(rows: GscSearchAnalyticsRow[]): number[] {
  const clicks = new Array<number>(10).fill(0);
  const impressions = new Array<number>(10).fill(0);
  for (const row of rows) {
    if (row.position > 10.5) continue;
    const index = Math.min(Math.max(Math.round(row.position), 1), 10) - 1;
    clicks[index] += row.clicks;
    impressions[index] += row.impressions;
  }

  let measuredClicks = 0;
  let genericClicks = 0;
  for (let i = 0; i < 10; i += 1) {
    if (impressions[i] < CURVE_MIN_IMPRESSIONS) continue;
    measuredClicks += clicks[i];
    genericClicks += impressions[i] * GENERIC_CTR[i];
  }
  const scale =
    genericClicks > 0
      ? Math.min(Math.max(measuredClicks / genericClicks, 0.2), 1.5)
      : 1;

  return GENERIC_CTR.map((generic, i) =>
    impressions[i] >= CURVE_MIN_IMPRESSIONS
      ? clicks[i] / impressions[i]
      : generic * scale,
  );
}

export function expectedCtr(position: number, curve: number[] = GENERIC_CTR) {
  if (position > 10.5) return BEYOND_TOP_TEN_CTR;
  return curve[Math.min(Math.max(Math.round(position), 1), 10) - 1];
}

/** The page that shows most for each query. Needs ["query", "page"] rows. */
export function bestPageByQuery(
  queryPageRows: GscSearchAnalyticsRow[],
): Map<string, string> {
  const best = new Map<string, { page: string; impressions: number }>();
  for (const row of queryPageRows) {
    const [query, page] = row.keys ?? [];
    if (!query || !page) continue;
    const current = best.get(query);
    if (!current || row.impressions > current.impressions) {
      best.set(query, { page, impressions: row.impressions });
    }
  }
  return new Map([...best].map(([query, value]) => [query, value.page]));
}

// ---------------------------------------------------------- opportunities

export type CtrOpportunity = {
  query: string;
  page: string | null;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  expectedCtr: number;
  /** Extra clicks if the snippet reached the site's usual CTR for its position. */
  potentialClicks: number;
};

const CTR_UNDERPERFORM_RATIO = 0.5;

/** Queries on page one that get clearly fewer clicks than this site usually
 *  gets at that position: the title and description are the first thing to
 *  rewrite. `minImpressions` scales with the length of the period. */
export function ctrOpportunities(
  queryRows: GscSearchAnalyticsRow[],
  pageByQuery: Map<string, string>,
  curve: number[],
  minImpressions: number,
  limit = 20,
): CtrOpportunity[] {
  const output: CtrOpportunity[] = [];
  for (const row of queryRows) {
    const query = row.keys?.[0];
    if (!query || row.position > 10.5 || row.impressions < minImpressions) {
      continue;
    }
    const expected = expectedCtr(row.position, curve);
    if (row.ctr >= expected * CTR_UNDERPERFORM_RATIO) continue;
    const potentialClicks = Math.round(row.impressions * expected - row.clicks);
    if (potentialClicks < 1) continue;
    output.push({
      query,
      page: pageByQuery.get(query) ?? null,
      position: row.position,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: row.ctr,
      expectedCtr: expected,
      potentialClicks,
    });
  }
  return output
    .sort((a, b) => b.potentialClicks - a.potentialClicks)
    .slice(0, limit);
}

export type NearTopOpportunity = {
  query: string;
  page: string;
  position: number;
  impressions: number;
  clicks: number;
  /** Extra clicks if the page reached position 3 with the site's usual CTR. */
  potentialClicks: number;
};

const NEAR_TOP_MIN_POSITION = 3.5;
const NEAR_TOP_MAX_POSITION = 20;

/** Queries ranking just below the top three, with the page that ranks best
 *  for each. Needs ["query", "page"] rows. */
export function nearTopOpportunities(
  queryPageRows: GscSearchAnalyticsRow[],
  curve: number[],
  minImpressions: number,
  limit = 20,
): NearTopOpportunity[] {
  const best = new Map<string, NearTopOpportunity>();
  for (const row of queryPageRows) {
    const [query, page] = row.keys ?? [];
    if (!query || !page) continue;
    const current = best.get(query);
    if (current && current.position <= row.position) continue;
    best.set(query, {
      query,
      page,
      position: row.position,
      impressions: row.impressions,
      clicks: row.clicks,
      potentialClicks: 0,
    });
  }
  const topThreeCtr = curve[2];
  const output: NearTopOpportunity[] = [];
  for (const item of best.values()) {
    if (
      item.position < NEAR_TOP_MIN_POSITION ||
      item.position > NEAR_TOP_MAX_POSITION ||
      item.impressions < minImpressions
    ) {
      continue;
    }
    const potentialClicks = Math.round(
      item.impressions * topThreeCtr - item.clicks,
    );
    if (potentialClicks < 1) continue;
    output.push({ ...item, potentialClicks });
  }
  return output
    .sort((a, b) => b.potentialClicks - a.potentialClicks)
    .slice(0, limit);
}

export type CannibalizedQuery = {
  query: string;
  totalImpressions: number;
  totalClicks: number;
  /** Sorted by clicks then impressions: the first one is the natural owner. */
  pages: {
    page: string;
    impressions: number;
    clicks: number;
    position: number;
  }[];
};

const CANNIBAL_MIN_PAGE_IMPRESSIONS = 5;
const CANNIBAL_MIN_PAGE_SHARE = 0.15;
const CANNIBAL_MIN_TOTAL_IMPRESSIONS = 50;

/** Queries where two or more of your pages share the impressions: they
 *  compete with each other and split the ranking signals. Expects rows with
 *  dimensions ["query", "page"]. */
export function cannibalizedQueries(
  queryPageRows: GscSearchAnalyticsRow[],
  limit = 20,
): CannibalizedQuery[] {
  const byQuery = new Map<string, CannibalizedQuery["pages"]>();
  for (const row of queryPageRows) {
    const [query, page] = row.keys ?? [];
    if (!query || !page) continue;
    const pages = byQuery.get(query) ?? [];
    pages.push({
      page,
      impressions: row.impressions,
      clicks: row.clicks,
      position: row.position,
    });
    byQuery.set(query, pages);
  }

  const output: CannibalizedQuery[] = [];
  for (const [query, pages] of byQuery) {
    const totalImpressions = pages.reduce((sum, p) => sum + p.impressions, 0);
    if (totalImpressions < CANNIBAL_MIN_TOTAL_IMPRESSIONS) continue;
    const competing = pages
      .filter(
        (p) =>
          p.impressions >= CANNIBAL_MIN_PAGE_IMPRESSIONS &&
          p.impressions / totalImpressions >= CANNIBAL_MIN_PAGE_SHARE,
      )
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    if (competing.length < 2) continue;
    output.push({
      query,
      totalImpressions,
      totalClicks: pages.reduce((sum, p) => sum + p.clicks, 0),
      pages: competing,
    });
  }
  return output
    .sort((a, b) => b.totalImpressions - a.totalImpressions)
    .slice(0, limit);
}

// ------------------------------------------------------- positions mix

/** A query that moved into or out of a position band between periods. */
export type BandMove = {
  query: string;
  /** Average position now, or null when it no longer shows. */
  position: number | null;
  /** Average position before, or null when it is new. */
  prevPosition: number | null;
  impressions: number;
};

export type PositionBand = {
  label: string;
  queries: number;
  clicks: number;
  prevQueries: number;
  prevClicks: number;
  /** How many queries entered / left the band, and the biggest of each. */
  enteredCount: number;
  leftCount: number;
  entered: BandMove[];
  left: BandMove[];
};

const BANDS = [
  { label: "Posiciones 1-3", max: 3.5 },
  { label: "Posiciones 4-10", max: 10.5 },
  { label: "Posiciones 11-20", max: 20.5 },
  { label: "Posición 21 o peor", max: Infinity },
];

/** How many queries (and clicks) sit in each position band, now and before. */
export function positionBands(
  current: GscSearchAnalyticsRow[],
  previous: GscSearchAnalyticsRow[],
): PositionBand[] {
  const bands: PositionBand[] = BANDS.map((band) => ({
    label: band.label,
    queries: 0,
    clicks: 0,
    prevQueries: 0,
    prevClicks: 0,
    enteredCount: 0,
    leftCount: 0,
    entered: [],
    left: [],
  }));
  const bandOf = (position: number) =>
    BANDS.findIndex((band) => position <= band.max);
  const now = new Map<string, GscSearchAnalyticsRow>();
  for (const row of current) {
    if (row.keys?.[0]) now.set(row.keys[0], row);
  }
  const before = new Map<string, GscSearchAnalyticsRow>();
  for (const row of previous) {
    if (row.keys?.[0]) before.set(row.keys[0], row);
  }
  const moves = (index: number) => {
    const entered: BandMove[] = [];
    const left: BandMove[] = [];
    for (const [query, row] of now) {
      if (bandOf(row.position) !== index) continue;
      const old = before.get(query);
      if (old && bandOf(old.position) === index) continue;
      entered.push({
        query,
        position: row.position,
        prevPosition: old?.position ?? null,
        impressions: row.impressions,
      });
    }
    for (const [query, old] of before) {
      if (bandOf(old.position) !== index) continue;
      const row = now.get(query);
      if (row && bandOf(row.position) === index) continue;
      left.push({
        query,
        position: row?.position ?? null,
        prevPosition: old.position,
        impressions: old.impressions,
      });
    }
    const byImpressions = (a: BandMove, b: BandMove) =>
      b.impressions - a.impressions;
    return {
      entered: entered.sort(byImpressions),
      left: left.sort(byImpressions),
    };
  };
  const place = (rows: GscSearchAnalyticsRow[], prev: boolean) => {
    for (const row of rows) {
      const index = BANDS.findIndex((band) => row.position <= band.max);
      const band = bands[index];
      if (prev) {
        band.prevQueries += 1;
        band.prevClicks += row.clicks;
      } else {
        band.queries += 1;
        band.clicks += row.clicks;
      }
    }
  };
  place(current, false);
  place(previous, true);
  bands.forEach((band, index) => {
    const { entered, left } = moves(index);
    band.enteredCount = entered.length;
    band.leftCount = left.length;
    band.entered = entered.slice(0, 5);
    band.left = left.slice(0, 5);
  });
  return bands;
}

// ----------------------------------------------------------- daily trend

export type DailyPoint = {
  date: string;
  clicks: number;
  impressions: number;
  /** Average position of the day. */
  position: number;
  prevClicks: number | null;
  prevImpressions: number | null;
};

/** Lines up each day with the same day of the previous period. */
export function alignDaily(
  current: GscSearchAnalyticsRow[],
  previous: GscSearchAnalyticsRow[],
  shiftDays: number,
): DailyPoint[] {
  const before = new Map<string, GscSearchAnalyticsRow>();
  for (const row of previous) {
    const date = row.keys?.[0];
    if (date) before.set(date, row);
  }
  const points: DailyPoint[] = [];
  for (const row of current) {
    const date = row.keys?.[0];
    if (!date) continue;
    const prevDate = new Date(
      Date.parse(`${date}T00:00:00Z`) - shiftDays * DAY_MS,
    )
      .toISOString()
      .slice(0, 10);
    const old = before.get(prevDate);
    points.push({
      date,
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
      prevClicks: old ? old.clicks : null,
      prevImpressions: old ? old.impressions : null,
    });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export function daysBetween(startDate: string, otherStartDate: string): number {
  return Math.round(
    (Date.parse(`${startDate}T00:00:00Z`) -
      Date.parse(`${otherStartDate}T00:00:00Z`)) /
      DAY_MS,
  );
}
