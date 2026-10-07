import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { sumSearchTotals } from "@/server/features/gsc/searchPerformanceReport";
import {
  periodInputSchema,
  resolvePeriods,
  shiftInDays,
} from "@/custom/radar/periods";
import {
  alignDaily,
  compareDimension,
  mergePageVariants,
  winnersAndLosers,
} from "@/custom/radar/radarAnalysis";
import { pageTypeClassifier, segmentRows } from "@/custom/radar/radarSegments";
import { requireProjectContext } from "@/serverFunctions/middleware";

const discoverInputSchema = periodInputSchema.extend({
  projectId: z.string().min(1),
  // Search Console reports these Google surfaces apart from web search.
  type: z
    .enum(["discover", "googleNews", "news", "image", "video"])
    .default("discover"),
});

const DAILY_ROW_LIMIT = 500;
const PAGE_ROW_LIMIT = 1000;
const COUNTRY_ROW_LIMIT = 25;
const TOP_PAGES = 15;

/**
 * Discover (and Google News, images and video) from Search Console. Discover
 * has no queries and no position: only pages, countries and dates, so this
 * report is about which content Google recommends and how that moves.
 */
export const getDiscoverReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(discoverInputSchema)
  .handler(async ({ data, context }) => {
    const periods = resolvePeriods(data);
    const { current: now, previous: prev } = periods;
    const projectId = context.projectId;
    const fetchRows = (
      dimensions: ("date" | "page" | "country")[],
      period: { startDate: string; endDate: string },
      rowLimit: number,
      type: typeof data.type | "web" = data.type,
    ) =>
      GscService.getPerformance({
        projectId,
        ...period,
        dimensions,
        rowLimit,
        type,
      });

    const comparable = periods.comparable;
    const NO_ROWS = {
      rows: [],
      siteUrl: "",
    } as unknown as Awaited<ReturnType<typeof fetchRows>>;
    const fetchPrev: typeof fetchRows = (...args) =>
      comparable ? fetchRows(...args) : Promise.resolve(NO_ROWS);

    try {
      const [
        daily,
        prevDaily,
        pages,
        prevPages,
        countries,
        prevCountries,
        web,
      ] = await Promise.all([
        fetchRows(["date"], now, DAILY_ROW_LIMIT),
        fetchPrev(["date"], prev, DAILY_ROW_LIMIT),
        fetchRows(["page"], now, PAGE_ROW_LIMIT),
        fetchPrev(["page"], prev, PAGE_ROW_LIMIT),
        fetchRows(["country"], now, COUNTRY_ROW_LIMIT),
        fetchPrev(["country"], prev, COUNTRY_ROW_LIMIT),
        fetchRows(["date"], now, DAILY_ROW_LIMIT, "web"),
      ]);

      const pageRows = mergePageVariants(pages.rows, 0);
      const prevPageRows = mergePageVariants(prevPages.rows, 0);
      const classify = pageTypeClassifier(
        [...pageRows, ...prevPageRows].flatMap((row) => row.keys?.[0] ?? []),
      );
      const changes = comparable
        ? compareDimension(pageRows, prevPageRows)
        : [];
      const prevByPage = new Map(
        prevPageRows.flatMap((row) =>
          row.keys?.[0] ? [[row.keys[0], row] as const] : [],
        ),
      );

      return {
        connected: true as const,
        type: data.type,
        range: now,
        period: {
          compare: periods.compare,
          fellBack: periods.fellBack,
          comparable,
          days: periods.days,
          prevStartDate: prev.startDate,
          prevEndDate: prev.endDate,
        },
        totals: sumSearchTotals(daily.rows),
        prevTotals: sumSearchTotals(prevDaily.rows),
        webClicks: sumSearchTotals(web.rows).clicks,
        daily: alignDaily(
          daily.rows,
          prevDaily.rows,
          shiftInDays(now.startDate, prev.startDate),
        ),
        topPages: [...pageRows]
          .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
          .slice(0, TOP_PAGES)
          .flatMap((row) => {
            const url = row.keys?.[0];
            if (!url) return [];
            const old = prevByPage.get(url);
            return [
              {
                url,
                clicks: row.clicks,
                impressions: row.impressions,
                ctr: row.ctr,
                prevClicks: old?.clicks ?? 0,
                prevImpressions: old?.impressions ?? 0,
              },
            ];
          }),
        pageChanges: winnersAndLosers(changes, 8),
        pageTypes: segmentRows(pageRows, prevPageRows, (row) =>
          classify(row.keys?.[0] ?? ""),
        ),
        countries: segmentRows(countries.rows, prevCountries.rows, (row) =>
          (row.keys?.[0] ?? "").toUpperCase(),
        ),
      };
    } catch (error) {
      if (error instanceof GscNotConnectedError) {
        return { connected: false as const, reason: "none" as const };
      }
      if (isExpectedGrantFailure(error)) {
        return { connected: false as const, reason: "reconnect" as const };
      }
      throw error;
    }
  });
