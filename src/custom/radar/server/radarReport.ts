import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { sumSearchTotals } from "@/server/features/gsc/searchPerformanceReport";
import { resolvePeriods, shiftInDays } from "@/custom/radar/periods";
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
  languageClassifier,
  lowTractionPages,
  buildPageTypes,
  queryIntent,
  questionOpportunities,
  segmentRows,
} from "@/custom/radar/radarSegments";
import { getBrandTerms } from "@/custom/radar/server/brandSettings";

import type { PeriodInput } from "@/custom/radar/periods";

export type RadarInput = PeriodInput & { includeBrand: boolean };

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

/** The Radar analysis of one project, built from Search Console only. Shared
 *  by the Radar page, the client reports and the MCP tools. */
export async function buildRadarReport(projectId: string, data: RadarInput) {
  const periods = resolvePeriods(data);
  const { current: now, previous: prev } = periods;
  const fetchRows = (
    dimensions: ("date" | "query" | "page" | "device")[],
    period: { startDate: string; endDate: string },
    rowLimit: number,
  ) =>
    GscService.getPerformance({ projectId, ...period, dimensions, rowLimit });

  // Nothing is compared when the period before does not fit in the 16
  // months Search Console keeps: its data is simply not asked for.
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
      fetchPrev(["date"], prev, DAILY_ROW_LIMIT),
      fetchRows(["query"], now, DIMENSION_ROW_LIMIT),
      fetchPrev(["query"], prev, DIMENSION_ROW_LIMIT),
      fetchRows(["page"], now, DIMENSION_ROW_LIMIT),
      fetchPrev(["page"], prev, DIMENSION_ROW_LIMIT),
      fetchRows(["query", "page"], now, DIMENSION_ROW_LIMIT),
      fetchPrev(["query", "page"], prev, DIMENSION_ROW_LIMIT),
      fetchRows(["device"], now, 10),
      fetchPrev(["device"], prev, 10),
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

    const pageGroups = comparable
      ? winnersAndLosers(compareDimension(pageRows, prevPageRows))
      : { winners: [], losers: [] };
    const withCauses = (rows: typeof pageGroups.winners) =>
      attachPageQueries(rows, queryPageRows, prevQueryPageRows);
    const queryChanges = comparable
      ? compareDimension(queryRows, prevQueryRows)
      : [];

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

    const allPageUrls = [...pageRows, ...prevPageRows].flatMap(
      (row) => row.keys?.[0] ?? [],
    );
    const languages = languageClassifier(allPageUrls);
    // Where each query lands, brand included: used to place queries that
    // carry no intent words of their own.
    const landing = bestPageByQuery(mergedQueryPages);

    const pageTypes = buildPageTypes(
      [...pageRows, ...prevPageRows].flatMap((row) => row.keys?.[0] ?? []),
    );
    const classifyPage = pageTypes.classify;

    return {
      connected: true as const,
      siteUrl,
      range: { startDate: now.startDate, endDate: now.endDate },
      period: {
        compare: periods.compare,
        fellBack: periods.fellBack,
        comparable,
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
        source:
          manualBrand.length > 0 ? ("manual" as const) : ("auto" as const),
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
      bands: positionBands(queryRows, prevQueryRows).map((band) =>
        comparable
          ? band
          : { ...band, enteredCount: 0, leftCount: 0, entered: [], left: [] },
      ),
      ctrCurve: curve,
      topPages: [...pageRows]
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, TOP_PAGES)
        .flatMap((row) =>
          row.keys?.[0]
            ? [
                {
                  url: row.keys[0],
                  clicks: row.clicks,
                  position: row.position,
                },
              ]
            : [],
        ),
      segments: {
        pageTypeMerges: pageTypes.merged,
        pageType: segmentRows(pageRows, prevPageRows, (row) =>
          classifyPage(row.keys?.[0] ?? ""),
        ),
        language:
          languages.count >= 2
            ? segmentRows(pageRows, prevPageRows, (row) =>
                languages.classify(row.keys?.[0] ?? ""),
              )
            : [],
        intent: segmentRows(queries.rows, prevQueries.rows, (row) => {
          const query = row.keys?.[0] ?? "";
          return queryIntent(query, tokens, landing.get(query));
        }),
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
      // The client reports list more of them than the Radar page does.
      newAndLostFull: newAndLostQueries(queryChanges, 40),
      ctrOpportunities: allCtr.slice(0, 20),
      nearTop: nearTopOpportunities(queryPageRows, curve, minImpressions, 60)
        .filter((item) => !ctrQueries.has(item.query))
        .slice(0, 20),
      cannibalized: cannibalizedQueries(queryPageRows),
      questions: questionOpportunities(queryPageRows, minImpressions),
      lowTraction: lowTractionPages(pageRows, queryPageRows, minImpressions),
      emerging: comparable
        ? emergingQueries(
            queryRows,
            new Set(prevQueryRows.flatMap((row) => row.keys?.[0] ?? [])),
            pageByQuery,
            minImpressions,
          )
        : [],
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
}
