import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { resolveDateRange } from "@/server/features/gsc/searchAnalytics";
import {
  previousPeriod,
  sumSearchTotals,
} from "@/server/features/gsc/searchPerformanceReport";
import {
  alignDaily,
  attachPageQueries,
  bestPageByQuery,
  brandTokens,
  cannibalizedQueries,
  compareDimension,
  ctrOpportunities,
  daysBetween,
  isBrandQuery,
  mergePageVariants,
  newAndLostQueries,
  nearTopOpportunities,
  ownCtrCurve,
  positionBands,
  splitBrandRows,
  sumClicks,
  winnersAndLosers,
} from "@/custom/radar/radarAnalysis";
import { fetchPageSignals } from "@/custom/radar/server/fetchPageSignals";
import { requireProjectContext } from "@/serverFunctions/middleware";

const radarInputSchema = z.object({
  projectId: z.string().min(1),
  range: z.enum(["last_28_days", "last_3_months"]).default("last_28_days"),
  // Brand queries ("carlos ortega") hide how the site does for everything
  // else, so they are left out of the analysis unless asked for.
  includeBrand: z.boolean().default(false),
});

// One row per day (the longest range is ~92 days) and the top 1000 rows of
// each dimension: GSC's per-call cap.
const DAILY_ROW_LIMIT = 200;
const DIMENSION_ROW_LIMIT = 1000;
// A query needs this many impressions in 28 days to be worth acting on; the
// bar scales with the length of the period.
const MIN_IMPRESSIONS_PER_28_DAYS = 50;
const TOP_PAGES = 6;

/**
 * Everything the "Radar SEO" page shows, built from Search Console only (free
 * first-party data): daily trend against the previous period, gains and losses
 * with their probable cause, snippets that underperform for their position
 * (against this site's own CTR curve), queries close to the top three, pages
 * competing for the same query, and the position mix.
 */
export const getRadarReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(radarInputSchema)
  .handler(async ({ data, context }) => {
    const { startDate, endDate } = resolveDateRange({ dateRange: data.range });
    const prev = previousPeriod(startDate, endDate);
    const projectId = context.projectId;
    const fetchRows = (
      dimensions: ("date" | "query" | "page")[],
      period: { startDate: string; endDate: string },
      rowLimit: number,
    ) => GscService.getPerformance({ projectId, ...period, dimensions, rowLimit });

    try {
      const now = { startDate, endDate };
      const [
        daily,
        prevDaily,
        queries,
        prevQueries,
        pages,
        prevPages,
        queryPages,
        prevQueryPages,
      ] = await Promise.all([
        fetchRows(["date"], now, DAILY_ROW_LIMIT),
        fetchRows(["date"], prev, DAILY_ROW_LIMIT),
        fetchRows(["query"], now, DIMENSION_ROW_LIMIT),
        fetchRows(["query"], prev, DIMENSION_ROW_LIMIT),
        fetchRows(["page"], now, DIMENSION_ROW_LIMIT),
        fetchRows(["page"], prev, DIMENSION_ROW_LIMIT),
        fetchRows(["query", "page"], now, DIMENSION_ROW_LIMIT),
        fetchRows(["query", "page"], prev, DIMENSION_ROW_LIMIT),
      ]);

      // The same page comes back under several URL variants: merge them.
      const pageRows = mergePageVariants(pages.rows, 0);
      const prevPageRows = mergePageVariants(prevPages.rows, 0);
      const mergedQueryPages = mergePageVariants(queryPages.rows, 1);
      const mergedPrevQueryPages = mergePageVariants(prevQueryPages.rows, 1);

      const siteUrl = daily.siteUrl;
      const tokens = brandTokens(siteUrl);
      const splitNow = splitBrandRows(queries.rows, tokens);
      const splitPrev = splitBrandRows(prevQueries.rows, tokens);
      const keep = <T extends { keys?: string[] }>(rows: T[]) =>
        data.includeBrand
          ? rows
          : rows.filter((row) => !isBrandQuery(row.keys?.[0] ?? "", tokens));

      const queryRows = keep(queries.rows);
      const prevQueryRows = keep(prevQueries.rows);
      const queryPageRows = keep(mergedQueryPages);
      const prevQueryPageRows = keep(mergedPrevQueryPages);

      const days = daysBetween(endDate, startDate) + 1;
      const minImpressions = Math.max(
        20,
        Math.round((MIN_IMPRESSIONS_PER_28_DAYS * days) / 28),
      );
      const curve = ownCtrCurve(queryRows);

      const pageGroups = winnersAndLosers(
        compareDimension(pageRows, prevPageRows),
      );
      const withCauses = (rows: typeof pageGroups.winners) =>
        attachPageQueries(rows, queryPageRows, prevQueryPageRows);
      const queryChanges = compareDimension(queryRows, prevQueryRows);

      return {
        connected: true as const,
        siteUrl,
        range: { startDate, endDate, prevStartDate: prev.startDate },
        totals: sumSearchTotals(daily.rows),
        prevTotals: sumSearchTotals(prevDaily.rows),
        brand: {
          hasBrand: tokens.length > 0,
          included: data.includeBrand,
          clicks: sumClicks(splitNow.brand),
          prevClicks: sumClicks(splitPrev.brand),
          otherClicks: sumClicks(splitNow.other),
          prevOtherClicks: sumClicks(splitPrev.other),
        },
        daily: alignDaily(
          daily.rows,
          prevDaily.rows,
          daysBetween(startDate, prev.startDate),
        ),
        bands: positionBands(queryRows, prevQueryRows),
        ctrCurve: curve,
        topPages: [...pageRows]
          .sort((a, b) => b.clicks - a.clicks)
          .slice(0, TOP_PAGES)
          .flatMap((row) =>
            row.keys?.[0]
              ? [{ url: row.keys[0], clicks: row.clicks, position: row.position }]
              : [],
          ),
        pageChanges: {
          winners: withCauses(pageGroups.winners),
          losers: withCauses(pageGroups.losers),
        },
        queryChanges: winnersAndLosers(queryChanges),
        ...newAndLostQueries(queryChanges),
        ctrOpportunities: ctrOpportunities(
          queryRows,
          bestPageByQuery(queryPageRows),
          curve,
          minImpressions,
        ),
        nearTop: nearTopOpportunities(queryPageRows, curve, minImpressions),
        cannibalized: cannibalizedQueries(queryPageRows),
      };
    } catch (error) {
      // "none": no property linked. "reconnect": a property is linked but
      // Google no longer accepts the stored permission (revoked or expired).
      if (error instanceof GscNotConnectedError) {
        return { connected: false as const, reason: "none" as const };
      }
      if (isExpectedGrantFailure(error)) {
        return { connected: false as const, reason: "reconnect" as const };
      }
      throw error;
    }
  });

const signalsInputSchema = z.object({
  projectId: z.string().min(1),
  urls: z.array(z.string().max(2000)).max(16),
});

/**
 * Title, meta description, H1, canonical, noindex and internal links of pages
 * of the project's own site, read live so the Radar can say exactly what to
 * change. Only URLs on the connected Search Console property are fetched.
 */
export const getRadarPageSignals = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(signalsInputSchema)
  .handler(async ({ data, context }) => {
    const connection = await GscService.getConnection(context.projectId);
    if (!connection) return { signals: [] };
    const urls = [...new Set(data.urls)];
    return {
      signals: await Promise.all(
        urls.map((url) => fetchPageSignals(url, connection.siteUrl)),
      ),
    };
  });
