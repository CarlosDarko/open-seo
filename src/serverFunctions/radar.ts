import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { resolveDateRange } from "@/server/features/gsc/searchAnalytics";
import {
  buildStrikingDistanceRows,
  previousPeriod,
  sumSearchTotals,
} from "@/server/features/gsc/searchPerformanceReport";
import {
  alignDaily,
  cannibalizedQueries,
  compareDimension,
  ctrOpportunities,
  daysBetween,
  potentialClicksFromTopThree,
  winnersAndLosers,
} from "@/custom/radar/radarAnalysis";
import { requireProjectContext } from "@/serverFunctions/middleware";

const radarInputSchema = z.object({
  projectId: z.string().min(1),
  range: z.enum(["last_28_days", "last_3_months"]).default("last_28_days"),
});

// One row per day (the longest range is ~92 days) and the top 1000 rows of
// each dimension: GSC's per-call cap.
const DAILY_ROW_LIMIT = 200;
const DIMENSION_ROW_LIMIT = 1000;

/**
 * Everything the "Radar SEO" page shows, built from Search Console only (free
 * first-party data): daily trend against the previous period, gains and losses
 * by query and by page, snippets that underperform for their position,
 * queries close to the top three and pages competing for the same query.
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
    ) =>
      GscService.getPerformance({
        projectId,
        ...period,
        dimensions,
        rowLimit,
      });

    try {
      const [
        daily,
        prevDaily,
        queries,
        prevQueries,
        pages,
        prevPages,
        queryPages,
      ] = await Promise.all([
        fetchRows(["date"], { startDate, endDate }, DAILY_ROW_LIMIT),
        fetchRows(["date"], prev, DAILY_ROW_LIMIT),
        fetchRows(["query"], { startDate, endDate }, DIMENSION_ROW_LIMIT),
        fetchRows(["query"], prev, DIMENSION_ROW_LIMIT),
        fetchRows(["page"], { startDate, endDate }, DIMENSION_ROW_LIMIT),
        fetchRows(["page"], prev, DIMENSION_ROW_LIMIT),
        fetchRows(["query", "page"], { startDate, endDate }, DIMENSION_ROW_LIMIT),
      ]);

      const nearTop = buildStrikingDistanceRows(queryPages.rows, 100)
        .map((row) => ({
          ...row,
          potentialClicks: potentialClicksFromTopThree(row),
        }))
        .filter((row) => row.potentialClicks > 0)
        .sort((a, b) => b.potentialClicks - a.potentialClicks)
        .slice(0, 20);

      return {
        connected: true as const,
        range: { startDate, endDate, prevStartDate: prev.startDate },
        totals: sumSearchTotals(daily.rows),
        prevTotals: sumSearchTotals(prevDaily.rows),
        daily: alignDaily(
          daily.rows,
          prevDaily.rows,
          daysBetween(startDate, prev.startDate),
        ),
        queryChanges: winnersAndLosers(
          compareDimension(queries.rows, prevQueries.rows),
        ),
        pageChanges: winnersAndLosers(
          compareDimension(pages.rows, prevPages.rows),
        ),
        ctrOpportunities: ctrOpportunities(queries.rows),
        nearTop,
        cannibalized: cannibalizedQueries(queryPages.rows),
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
