import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { sumSearchTotals } from "@/server/features/gsc/searchPerformanceReport";
import { resolvePeriods, shiftInDays } from "@/custom/radar/periods";
import {
  alignDaily,
  brandTokens,
  compareDimension,
  isBrandQuery,
  mergePageVariants,
  normalizeBrandTerms,
  positionBands,
  splitBrandRows,
  subtractTotals,
  winnersAndLosers,
} from "@/custom/radar/radarAnalysis";
import { getBrandTerms } from "@/custom/radar/server/brandSettings";
import { countUnseenEvents } from "@/custom/radar/server/radarDb";
import { requireProjectContext } from "@/serverFunctions/middleware";

// The hub is the landing page: one summary per project, cached for a while so
// opening it does not ask Search Console again every time.
const CACHE_SECONDS = 30 * 60;
const cacheKey = (projectId: string) => `hub:summary:${projectId}`;
const ROW_LIMIT = 1000;

/**
 * A light summary of one project (last 28 days against the 28 before, brand
 * queries left out like the Panel does by default): headline figures, the
 * daily trend, how queries spread over position bands, the page that gains
 * and the one that loses the most, and the unseen alerts. The client asks
 * once per project so each call stays within a Worker's request budget.
 */
export const getHubSummary = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(async ({ context }) => {
    const projectId = context.projectId;
    try {
      const cached = await env.KV.get(cacheKey(projectId));
      if (cached) return JSON.parse(cached) as HubSummary;
    } catch {
      // No cache: compute it.
    }

    const summary = await buildSummary(projectId);
    if (summary.status === "ok") {
      try {
        await env.KV.put(cacheKey(projectId), JSON.stringify(summary), {
          expirationTtl: CACHE_SECONDS,
        });
      } catch {
        // The summary is still returned.
      }
    }
    return summary;
  });

type DailyLite = { date: string; clicks: number; prevClicks: number | null };

export type HubSummary =
  | { status: "none" | "reconnect" }
  | {
      status: "ok";
      siteUrl: string;
      generatedAt: string;
      clicks: number;
      prevClicks: number;
      impressions: number;
      prevImpressions: number;
      position: number;
      prevPosition: number;
      daily: DailyLite[];
      bands: { label: string; queries: number; prevQueries: number }[];
      riser: { url: string; delta: number } | null;
      faller: { url: string; delta: number } | null;
      unseenAlerts: number;
    };

async function buildSummary(projectId: string): Promise<HubSummary> {
  const { current: now, previous: prev } = resolvePeriods({
    range: "last_28_days",
    compare: "previous",
  });
  const fetchRows = (
    dimensions: ("date" | "query" | "page")[],
    period: { startDate: string; endDate: string },
  ) =>
    GscService.getPerformance({
      projectId,
      ...period,
      dimensions,
      rowLimit: ROW_LIMIT,
    });

  try {
    const [
      daily,
      prevDaily,
      queries,
      prevQueries,
      pages,
      prevPages,
      manual,
      unseen,
    ] = await Promise.all([
      fetchRows(["date"], now),
      fetchRows(["date"], prev),
      fetchRows(["query"], now),
      fetchRows(["query"], prev),
      fetchRows(["page"], now),
      fetchRows(["page"], prev),
      getBrandTerms(projectId),
      countUnseenEvents(projectId).catch(() => 0),
    ]);

    const tokens =
      manual.length > 0
        ? normalizeBrandTerms(manual)
        : brandTokens(daily.siteUrl);
    const splitNow = splitBrandRows(queries.rows, tokens);
    const splitPrev = splitBrandRows(prevQueries.rows, tokens);
    const withoutBrand = tokens.length > 0;
    const totals = withoutBrand
      ? subtractTotals(
          sumSearchTotals(daily.rows),
          sumSearchTotals(splitNow.brand),
        )
      : sumSearchTotals(daily.rows);
    const prevTotals = withoutBrand
      ? subtractTotals(
          sumSearchTotals(prevDaily.rows),
          sumSearchTotals(splitPrev.brand),
        )
      : sumSearchTotals(prevDaily.rows);

    const keep = <T extends { keys?: string[] }>(rows: T[]) =>
      rows.filter((row) => !isBrandQuery(row.keys?.[0] ?? "", tokens));
    const changes = winnersAndLosers(
      compareDimension(
        mergePageVariants(pages.rows, 0),
        mergePageVariants(prevPages.rows, 0),
      ),
      1,
    );
    const pick = (row: { key: string; clicksDelta: number } | undefined) =>
      row ? { url: row.key, delta: row.clicksDelta } : null;

    return {
      status: "ok",
      siteUrl: daily.siteUrl,
      generatedAt: new Date().toISOString(),
      clicks: totals.clicks,
      prevClicks: prevTotals.clicks,
      impressions: totals.impressions,
      prevImpressions: prevTotals.impressions,
      position: totals.position,
      prevPosition: prevTotals.position,
      daily: alignDaily(
        daily.rows,
        prevDaily.rows,
        shiftInDays(now.startDate, prev.startDate),
      ).map((point) => ({
        date: point.date,
        clicks: point.clicks,
        prevClicks: point.prevClicks,
      })),
      bands: positionBands(keep(queries.rows), keep(prevQueries.rows)).map(
        (band) => ({
          label: band.label,
          queries: band.queries,
          prevQueries: band.prevQueries,
        }),
      ),
      riser: pick(changes.winners[0]),
      faller: pick(changes.losers[0]),
      unseenAlerts: unseen,
    };
  } catch (error) {
    if (error instanceof GscNotConnectedError) return { status: "none" };
    if (isExpectedGrantFailure(error)) return { status: "reconnect" };
    throw error;
  }
}
