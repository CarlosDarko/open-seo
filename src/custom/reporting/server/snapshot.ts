// Builds the frozen data of a client report from the Radar analysis: headline
// numbers, trend, what moved, where the queries rank, who brings the traffic,
// the opportunities and the action plan, all trimmed to what a client reads.
import { GscService } from "@/server/features/gsc/services/GscService";
import { buildActions, type Action } from "@/custom/radar/actions";
import { updatesBetween } from "@/custom/radar/googleUpdates";
import {
  isBrandQuery,
  normalizeBrandTerms,
} from "@/custom/radar/radarAnalysis";
import type { PeriodInput } from "@/custom/radar/periods";
import { getGoogleUpdates } from "@/custom/radar/server/googleUpdatesStore";
import { buildRadarReport } from "@/custom/radar/server/radarReport";
import type {
  ChangeLine,
  ReportSnapshot,
  ReportTask,
  SegmentLine,
} from "@/custom/reporting/types";

export type SnapshotResult =
  | { ok: true; snapshot: ReportSnapshot }
  | { ok: false; reason: "none" | "reconnect" };

const TASKS = 12;

function changeLine(row: {
  key: string;
  clicks: number;
  prevClicks: number;
  clicksDelta: number;
  position: number | null;
  prevPosition: number | null;
  status: "new" | "lost" | "changed";
  cause?: string;
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

function task(action: Action): ReportTask {
  return {
    id: action.id,
    kind: action.kind,
    title: action.headline,
    subtitle: action.subtitle,
    stats: action.stats,
    lines: action.lines,
    steps: action.steps,
    gain: action.gain,
    effort: action.effort,
    page: action.page,
    query: action.query,
  };
}

/** The most useful tasks first: those with the most clicks at stake, then
 *  the easy ones. */
function pickTasks(plan: ReturnType<typeof buildActions>): ReportTask[] {
  const all = [
    ...plan.losses,
    ...plan.snippets,
    ...plan.pushes,
    ...plan.cannibals,
    ...plan.questions,
    ...plan.traction,
    ...plan.emerging,
  ];
  const effortRank = { bajo: 0, medio: 1, alto: 2 } as const;
  return all
    .sort(
      (a, b) =>
        (b.gain ?? 0) - (a.gain ?? 0) ||
        effortRank[a.effort] - effortRank[b.effort],
    )
    .slice(0, TASKS)
    .map(task);
}

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
  const queries = await GscService.getPerformance({
    projectId,
    startDate: report.range.startDate,
    endDate: report.range.endDate,
    dimensions: ["query"],
    rowLimit: 200,
  });
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

  const updates = updatesBetween(
    await getGoogleUpdates(),
    report.range.startDate,
    report.range.endDate,
  );

  const plan = buildActions(report);

  return {
    ok: true,
    snapshot: {
      version: 1,
      generatedAt: new Date().toISOString(),
      siteUrl: report.siteUrl,
      range: report.range,
      period: {
        compare: report.period.compare,
        comparable: report.period.comparable,
        days: report.period.days,
        prevStartDate: report.period.prevStartDate,
        prevEndDate: report.period.prevEndDate,
      },
      scope: report.totalsScope,
      totals: report.totals,
      prevTotals: report.prevTotals,
      daily: report.daily,
      topQueries,
      topPages: report.topPages,
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
      tasks: pickTasks(plan),
      updates,
    },
  };
}
