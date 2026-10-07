// Pure analysis behind the "Radar SEO" page. Everything here works on rows
// that Google Search Console already returned (free), so the page adds charts,
// comparisons and priorities without any extra paid API call.
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";

const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Biggest gains and losses in clicks. */
export function winnersAndLosers(rows: ChangeRow[], limit = 10) {
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

// Typical click-through rate by organic position (1..10); beyond the first
// page the share is small and flat.
const EXPECTED_CTR = [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
const BEYOND_TOP_TEN_CTR = 0.01;
const TOP_THREE_CTR = 0.1;

export function expectedCtr(position: number): number {
  if (position > 10) return BEYOND_TOP_TEN_CTR;
  return EXPECTED_CTR[Math.max(Math.round(position), 1) - 1];
}

export type CtrOpportunity = {
  query: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  expectedCtr: number;
  /** Extra clicks if the snippet reached the typical CTR for its position. */
  potentialClicks: number;
};

const CTR_MIN_IMPRESSIONS = 100;
const CTR_UNDERPERFORM_RATIO = 0.6;

/** Queries on page one that get clearly fewer clicks than their position
 *  usually earns: the title and description are the first thing to rewrite. */
export function ctrOpportunities(
  queryRows: GscSearchAnalyticsRow[],
  limit = 20,
): CtrOpportunity[] {
  const output: CtrOpportunity[] = [];
  for (const row of queryRows) {
    const query = row.keys?.[0];
    if (!query || row.position > 10 || row.impressions < CTR_MIN_IMPRESSIONS) {
      continue;
    }
    const expected = expectedCtr(row.position);
    if (row.ctr >= expected * CTR_UNDERPERFORM_RATIO) continue;
    const potentialClicks = Math.round(row.impressions * expected - row.clicks);
    if (potentialClicks < 1) continue;
    output.push({
      query,
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

/** Extra clicks if a query ranking below the top three reached position 3. */
export function potentialClicksFromTopThree(row: {
  impressions: number;
  clicks: number;
}): number {
  return Math.max(0, Math.round(row.impressions * TOP_THREE_CTR - row.clicks));
}

export type CannibalizedQuery = {
  query: string;
  totalImpressions: number;
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
      .sort((a, b) => b.impressions - a.impressions);
    if (competing.length < 2) continue;
    output.push({ query, totalImpressions, pages: competing });
  }
  return output
    .sort((a, b) => b.totalImpressions - a.totalImpressions)
    .slice(0, limit);
}

export type DailyPoint = {
  date: string;
  clicks: number;
  impressions: number;
  prevClicks: number | null;
  prevImpressions: number | null;
};

/** Lines up each day with the same day of the previous period. Days GSC
 *  returned nothing for count as zero in the current period. */
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
    const prevDate = new Date(Date.parse(`${date}T00:00:00Z`) - shiftDays * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const old = before.get(prevDate);
    points.push({
      date,
      clicks: row.clicks,
      impressions: row.impressions,
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
