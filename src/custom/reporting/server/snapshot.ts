// Builds the frozen data of a client report from the Radar analysis: headline
// numbers, trend, what moved and why, where the queries rank, who brings the
// traffic and the opportunities, all trimmed to what a client reads.
import { GscService } from "@/server/features/gsc/services/GscService";
import { updatesBetween } from "@/custom/radar/googleUpdates";
import {
  canonicalPageKey,
  isBrandQuery,
  mergePageVariants,
  normalizeBrandTerms,
} from "@/custom/radar/radarAnalysis";
import type { PeriodInput } from "@/custom/radar/periods";
import { getGoogleUpdates } from "@/custom/radar/server/googleUpdatesStore";
import { buildDiscoverReport } from "@/custom/radar/server/discoverReport";
import { buildIndexReport } from "@/custom/radar/server/indexReport";
import { buildRadarReport } from "@/custom/radar/server/radarReport";
import { buildTopicsReport } from "@/custom/radar/server/topicsReport";
import type {
  BandMove,
  ChangeLine,
  PageLine,
  QueryMove,
  ReportSnapshot,
  SegmentLine,
} from "@/custom/reporting/types";

export type SnapshotResult =
  | { ok: true; snapshot: ReportSnapshot }
  | { ok: false; reason: "none" | "reconnect" };

function changeLine(row: {
  key: string;
  clicks: number;
  prevClicks: number;
  clicksDelta: number;
  position: number | null;
  prevPosition: number | null;
  status: "new" | "lost" | "changed";
  cause?: string;
  topQueries?: QueryMove[];
}): ChangeLine {
  return {
    key: row.key,
    clicks: row.clicks,
    prevClicks: row.prevClicks,
    clicksDelta: row.clicksDelta,
    position: row.position,
    prevPosition: row.prevPosition,
    status: row.status,
    cause: row.cause,
    queries: row.topQueries?.slice(0, 3).map((item) => ({
      query: item.query,
      clicksDelta: item.clicksDelta,
      position: item.position,
      prevPosition: item.prevPosition,
    })),
  };
}

function segmentLines(
  segments: {
    label: string;
    clicks: number;
    prevClicks: number;
    impressions: number;
  }[],
): SegmentLine[] {
  const total = segments.reduce((sum, item) => sum + item.clicks, 0);
  return segments.slice(0, 8).map((item) => ({
    label: item.label,
    clicks: item.clicks,
    prevClicks: item.prevClicks,
    impressions: item.impressions,
    share: total > 0 ? item.clicks / total : 0,
  }));
}

const moves = (
  rows: {
    query: string;
    position: number | null;
    prevPosition: number | null;
  }[],
): BandMove[] =>
  rows.slice(0, 4).map((row) => ({
    query: row.query,
    position: row.position,
    prevPosition: row.prevPosition,
  }));

export async function buildReportSnapshot(
  projectId: string,
  input: PeriodInput,
): Promise<SnapshotResult> {
  const report = await buildRadarReport(projectId, {
    ...input,
    includeBrand: false,
  });
  if (!report.connected) return { ok: false, reason: report.reason };

  const tokens =
    report.brand.source === "manual"
      ? normalizeBrandTerms(report.brand.terms)
      : report.brand.terms;
  const comparable = report.period.comparable;
  const [queries, pages, prevPages] = await Promise.all([
    GscService.getPerformance({
      projectId,
      startDate: report.range.startDate,
      endDate: report.range.endDate,
      dimensions: ["query"],
      rowLimit: 200,
    }),
    GscService.getPerformance({
      projectId,
      startDate: report.range.startDate,
      endDate: report.range.endDate,
      dimensions: ["page"],
      rowLimit: 1000,
    }),
    comparable
      ? GscService.getPerformance({
          projectId,
          startDate: report.period.prevStartDate,
          endDate: report.period.prevEndDate,
          dimensions: ["page"],
          rowLimit: 1000,
        })
      : Promise.resolve(null),
  ]);

  const topQueries = queries.rows
    .flatMap((row) => {
      const query = row.keys?.[0];
      return query && !isBrandQuery(query, tokens)
        ? [
            {
              query,
              clicks: row.clicks,
              impressions: row.impressions,
              position: row.position,
            },
          ]
        : [];
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 12);

  const pageRows = mergePageVariants(pages.rows, 0);
  const prevByKey = new Map(
    mergePageVariants(prevPages?.rows ?? [], 0).flatMap((row) =>
      row.keys?.[0]
        ? [[canonicalPageKey(row.keys[0]), row.clicks] as const]
        : [],
    ),
  );
  const pageClicksTotal = pageRows.reduce((sum, row) => sum + row.clicks, 0);
  const topPages: PageLine[] = [...pageRows]
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 8)
    .flatMap((row) =>
      row.keys?.[0]
        ? [
            {
              url: row.keys[0],
              clicks: row.clicks,
              prevClicks: prevByKey.get(canonicalPageKey(row.keys[0])) ?? 0,
            },
          ]
        : [],
    );

  const extras = await Promise.all([
    buildTopicsReport(projectId, {
      ...input,
      includeBrand: false,
      projectId,
    }).catch(() => null),
    buildIndexReport(projectId).catch(() => null),
    buildDiscoverReport(projectId, {
      ...input,
      type: "discover",
      projectId,
    }).catch(() => null),
  ]);
  const [topicsReport, indexReport, discoverReport] = extras;

  const updates = updatesBetween(
    await getGoogleUpdates(),
    report.range.startDate,
    report.range.endDate,
  );

  return {
    ok: true,
    snapshot: {
      version: 3,
      generatedAt: new Date().toISOString(),
      siteUrl: report.siteUrl,
      range: report.range,
      period: {
        compare: report.period.compare,
        comparable,
        days: report.period.days,
        prevStartDate: report.period.prevStartDate,
        prevEndDate: report.period.prevEndDate,
      },
      scope: report.totalsScope,
      totals: report.totals,
      prevTotals: report.prevTotals,
      daily: report.daily,
      brand: {
        hasBrand: report.brand.hasBrand,
        clicks: report.brand.clicks,
        prevClicks: report.brand.prevClicks,
        otherClicks: report.brand.otherClicks,
        prevOtherClicks: report.brand.prevOtherClicks,
      },
      topQueries,
      topPages,
      pageClicksTotal,
      pageWinners: report.pageChanges.winners.slice(0, 6).map(changeLine),
      pageLosers: report.pageChanges.losers.slice(0, 6).map(changeLine),
      queryWinners: report.queryChanges.winners.slice(0, 6).map(changeLine),
      queryLosers: report.queryChanges.losers.slice(0, 6).map(changeLine),
      newQueries: report.newQueries.length,
      lostQueries: report.lostQueries.length,
      bands: report.bands.map((band) => ({
        label: band.label,
        queries: band.queries,
        prevQueries: band.prevQueries,
        clicks: band.clicks,
        prevClicks: band.prevClicks,
        entered: moves(band.entered),
        left: moves(band.left),
      })),
      segments: {
        device: segmentLines(report.segments.device),
        pageType: segmentLines(report.segments.pageType),
        intent: segmentLines(report.segments.intent),
      },
      opportunities: [
        ...report.ctrOpportunities.slice(0, 6).map((item) => ({
          query: item.query,
          page: item.page,
          position: item.position,
          impressions: item.impressions,
          clicks: item.clicks,
          potentialClicks: item.potentialClicks,
          kind: "snippet" as const,
        })),
        ...report.nearTop.slice(0, 6).map((item) => ({
          query: item.query,
          page: item.page,
          position: item.position,
          impressions: item.impressions,
          clicks: item.clicks,
          potentialClicks: item.potentialClicks,
          kind: "push" as const,
        })),
      ],
      updates,
      topics:
        topicsReport && topicsReport.connected
          ? topicsReport.topics.slice(0, 8).map((topic) => ({
              label: topic.label,
              clicks: topic.clicks,
              prevClicks: topic.prev.clicks,
              impressions: topic.impressions,
              position: topic.position,
              queries: topic.queries,
              nearTopShare: topic.nearTopShare,
              topQueries: topic.topQueries.slice(0, 3).map((item) => ({
                query: item.query,
                clicks: item.clicks,
                position: item.position,
              })),
            }))
          : [],
      health:
        indexReport && indexReport.connected
          ? {
              inSitemap: indexReport.counts.inSitemap,
              pagesWithImpressions: indexReport.counts.pagesWithImpressions,
              unseen: indexReport.counts.unseen,
              notInSitemap: indexReport.counts.notInSitemap,
              sitemapErrors: indexReport.sitemaps.reduce(
                (sum, item) => sum + item.errors,
                0,
              ),
            }
          : null,
      discover:
        discoverReport &&
        discoverReport.connected &&
        discoverReport.totals.clicks > 0
          ? {
              clicks: discoverReport.totals.clicks,
              prevClicks: discoverReport.prevTotals.clicks,
              impressions: discoverReport.totals.impressions,
              topPages: discoverReport.topPages.slice(0, 4).map((page) => ({
                url: page.url,
                clicks: page.clicks,
                prevClicks: page.prevClicks,
              })),
            }
          : null,
    },
  };
}
