import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { sumSearchTotals } from "@/server/features/gsc/searchPerformanceReport";
import { periodInputSchema, resolvePeriods, shiftInDays } from "@/custom/radar/periods";
import {
  alignDaily,
  attachPageQueries,
  bestPageByQuery,
  brandSuspects,
  brandTokens,
  cannibalizedQueries,
  compareDimension,
  ctrOpportunities,
  isBrandQuery,
  mergePageVariants,
  newAndLostQueries,
  normalizeBrandTerms,
  nearTopOpportunities,
  ownCtrCurve,
  positionBands,
  splitBrandRows,
  subtractTotals,
  sumClicks,
  winnersAndLosers,
} from "@/custom/radar/radarAnalysis";
import {
  emergingQueries,
  lowTractionPages,
  pageTypeClassifier,
  queryIntent,
  questionOpportunities,
  segmentRows,
} from "@/custom/radar/radarSegments";
import {
  brandTermsSchema,
  getBrandTerms,
  saveBrandTerms,
} from "@/custom/radar/server/brandSettings";
import { fetchPageSignals } from "@/custom/radar/server/fetchPageSignals";
import { requireProjectContext } from "@/serverFunctions/middleware";

const radarInputSchema = periodInputSchema.extend({
  projectId: z.string().min(1),
  // Brand queries ("carlos ortega") hide how the site does for everything
  // else, so they are left out of the analysis unless asked for.
  includeBrand: z.boolean().default(false),
});

// One row per day (the longest range is ~16 months) and the top 1000 rows of
// each dimension: GSC's per-call cap.
const DAILY_ROW_LIMIT = 500;
const DIMENSION_ROW_LIMIT = 1000;
// A query needs this many impressions in 28 days to be worth acting on; the
// bar scales with the length of the period.
const MIN_IMPRESSIONS_PER_28_DAYS = 50;
const TOP_PAGES = 6;

const DEVICE_LABEL: Record<string, string> = {
  MOBILE: "Móvil",
  DESKTOP: "Ordenador",
  TABLET: "Tableta",
};

/**
 * Everything the Radar, the action plan and the segment charts show, built
 * from Search Console only (free first-party data): daily trend, gains and
 * losses with their probable cause, snippets that underperform for their
 * position (against this site's own CTR curve), queries close to the top
 * three, competing pages, questions, thin-traction pages, emerging queries
 * and the segments by page type, search intent, device and brand.
 */
export const getRadarReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(radarInputSchema)
  .handler(async ({ data, context }) => {
    const periods = resolvePeriods(data);
    const { current: now, previous: prev } = periods;
    const projectId = context.projectId;
    const fetchRows = (
      dimensions: ("date" | "query" | "page" | "device")[],
      period: { startDate: string; endDate: string },
      rowLimit: number,
    ) => GscService.getPerformance({ projectId, ...period, dimensions, rowLimit });

    try {
      const [
        daily,
        prevDaily,
        queries,
        prevQueries,
        pages,
        prevPages,
        queryPages,
        prevQueryPages,
        devices,
        prevDevices,
        manualBrand,
      ] = await Promise.all([
        fetchRows(["date"], now, DAILY_ROW_LIMIT),
        fetchRows(["date"], prev, DAILY_ROW_LIMIT),
        fetchRows(["query"], now, DIMENSION_ROW_LIMIT),
        fetchRows(["query"], prev, DIMENSION_ROW_LIMIT),
        fetchRows(["page"], now, DIMENSION_ROW_LIMIT),
        fetchRows(["page"], prev, DIMENSION_ROW_LIMIT),
        fetchRows(["query", "page"], now, DIMENSION_ROW_LIMIT),
        fetchRows(["query", "page"], prev, DIMENSION_ROW_LIMIT),
        fetchRows(["device"], now, 10),
        fetchRows(["device"], prev, 10),
        getBrandTerms(projectId),
      ]);

      // The same page comes back under several URL variants: merge them.
      const pageRows = mergePageVariants(pages.rows, 0);
      const prevPageRows = mergePageVariants(prevPages.rows, 0);
      const mergedQueryPages = mergePageVariants(queryPages.rows, 1);
      const mergedPrevQueryPages = mergePageVariants(prevQueryPages.rows, 1);

      const siteUrl = daily.siteUrl;
      const autoTokens = brandTokens(siteUrl);
      const tokens =
        manualBrand.length > 0 ? normalizeBrandTerms(manualBrand) : autoTokens;
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

      const minImpressions = Math.max(
        20,
        Math.round((MIN_IMPRESSIONS_PER_28_DAYS * periods.days) / 28),
      );
      const curve = ownCtrCurve(queryRows);
      const pageByQuery = bestPageByQuery(queryPageRows);

      const pageGroups = winnersAndLosers(
        compareDimension(pageRows, prevPageRows),
      );
      const withCauses = (rows: typeof pageGroups.winners) =>
        attachPageQueries(rows, queryPageRows, prevQueryPageRows);
      const queryChanges = compareDimension(queryRows, prevQueryRows);

      // A query whose snippet underperforms is a snippet task: keep it out of
      // the "near the top" list so one query is not reported twice.
      const allCtr = ctrOpportunities(
        queryRows,
        pageByQuery,
        curve,
        minImpressions,
        500,
      );
      const ctrQueries = new Set(allCtr.map((item) => item.query));

      // The headline figures follow the brand switch too: without brand they
      // are the site totals minus the detected brand queries.
      const withoutBrand = !data.includeBrand && tokens.length > 0;
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

      const classifyPage = pageTypeClassifier(
        [...pageRows, ...prevPageRows].flatMap((row) => row.keys?.[0] ?? []),
      );

      return {
        connected: true as const,
        siteUrl,
        range: { startDate: now.startDate, endDate: now.endDate },
        period: {
          compare: periods.compare,
          fellBack: periods.fellBack,
          days: periods.days,
          prevStartDate: prev.startDate,
          prevEndDate: prev.endDate,
        },
        totals,
        prevTotals,
        totalsScope: withoutBrand ? ("sin marca" as const) : ("todo" as const),
        brand: {
          hasBrand: tokens.length > 0,
          included: data.includeBrand,
          source: manualBrand.length > 0 ? ("manual" as const) : ("auto" as const),
          terms: manualBrand.length > 0 ? manualBrand : autoTokens,
          autoSuggestion: autoTokens,
          examples: [...splitNow.brand]
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 5)
            .flatMap((row) =>
              row.keys?.[0] ? [{ query: row.keys[0], clicks: row.clicks }] : [],
            ),
          suspects: brandSuspects(splitNow.other, tokens),
          clicks: sumClicks(splitNow.brand),
          prevClicks: sumClicks(splitPrev.brand),
          otherClicks: sumClicks(splitNow.other),
          prevOtherClicks: sumClicks(splitPrev.other),
        },
        daily: alignDaily(
          daily.rows,
          prevDaily.rows,
          shiftInDays(now.startDate, prev.startDate),
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
        segments: {
          pageType: segmentRows(pageRows, prevPageRows, (row) =>
            classifyPage(row.keys?.[0] ?? ""),
          ),
          intent: segmentRows(queries.rows, prevQueries.rows, (row) =>
            queryIntent(row.keys?.[0] ?? "", tokens),
          ),
          device: segmentRows(
            devices.rows,
            prevDevices.rows,
            (row) => DEVICE_LABEL[row.keys?.[0] ?? ""] ?? row.keys?.[0] ?? "Otro",
          ),
          brand: segmentRows(queries.rows, prevQueries.rows, (row) =>
            isBrandQuery(row.keys?.[0] ?? "", tokens) ? "Marca" : "Sin marca",
          ),
        },
        pageChanges: {
          winners: withCauses(pageGroups.winners),
          losers: withCauses(pageGroups.losers),
        },
        queryChanges: winnersAndLosers(queryChanges),
        ...newAndLostQueries(queryChanges),
        ctrOpportunities: allCtr.slice(0, 20),
        nearTop: nearTopOpportunities(queryPageRows, curve, minImpressions, 60)
          .filter((item) => !ctrQueries.has(item.query))
          .slice(0, 20),
        cannibalized: cannibalizedQueries(queryPageRows),
        questions: questionOpportunities(queryPageRows, minImpressions),
        lowTraction: lowTractionPages(pageRows, queryPageRows, minImpressions),
        emerging: emergingQueries(
          queryRows,
          new Set(prevQueryRows.flatMap((row) => row.keys?.[0] ?? [])),
          pageByQuery,
          minImpressions,
        ),
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
  urls: z.array(z.string().max(2000)).max(32),
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

/** Saves the brand words of a project (empty list = deduce from the domain). */
export const saveRadarBrand = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1), terms: brandTermsSchema }))
  .handler(async ({ data, context }) => ({
    terms: await saveBrandTerms(context.projectId, data.terms),
  }));
