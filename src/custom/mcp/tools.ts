// Carlos Ortega fork: extra MCP tools for the Radar family and the client
// reports. They sit beside OpenSEO's own tools and use no credits: everything
// here reads Search Console (free) or the fork's own tables. One line in
// src/server/mcp/server.ts registers them all.
import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { buildActions } from "@/custom/radar/actions";
import { RADAR_RANGES } from "@/custom/radar/periods";
import { updatesBetween } from "@/custom/radar/googleUpdates";
import { getCostOverview } from "@/custom/costs/server/ledger";
import { buildCrawlHealth } from "@/custom/radar/server/crawlHealth";
import { buildDiscoverReport } from "@/custom/radar/server/discoverReport";
import { getGoogleUpdates } from "@/custom/radar/server/googleUpdatesStore";
import { buildIndexReport } from "@/custom/radar/server/indexReport";
import {
  listActions,
  listEvents,
  listRules,
} from "@/custom/radar/server/radarDb";
import { buildRadarReport } from "@/custom/radar/server/radarReport";
import { buildTopicsReport } from "@/custom/radar/server/topicsReport";
import { buildInsights } from "@/custom/reporting/insights";
import { buildVerdict } from "@/custom/reporting/narrative";
import {
  deleteReport,
  getReport,
  insertReport,
  listReports,
  replaceSnapshot,
  updateReport,
} from "@/custom/reporting/server/reportingDb";
import { buildReportSnapshot } from "@/custom/reporting/server/snapshot";
import {
  EMPTY_NOTES,
  REPORT_SECTIONS,
  type ReportNotes,
} from "@/custom/reporting/types";
import type { ToolContext } from "@/server/mcp/context";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { looseObjectOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

type Shape = z.ZodRawShape;
type Args<S extends Shape> = z.infer<z.ZodObject<S>>;
type ProjectContext = Parameters<Parameters<typeof withMcpProjectAuth>[0]>[1];

export type CustomMcpTool = {
  name: string;
  config: {
    title: string;
    description: string;
    inputSchema: Shape;
    outputSchema: z.ZodType;
    annotations: {
      readOnlyHint: boolean;
      openWorldHint: boolean;
      destructiveHint: boolean;
    };
  };
  handler: (
    args: Record<string, unknown>,
    context: ToolContext,
  ) => Promise<CallToolResult>;
};

/** Declares one tool whose input always carries a projectId and whose answer
 *  is a JSON object, shown to the model as compact JSON. */
function defineTool<S extends Shape>(def: {
  name: string;
  title: string;
  description: string;
  input: S;
  write?: "none" | "write" | "delete";
  openWorld?: boolean;
  path?: (args: Args<S> & { projectId: string }) => string;
  run: (
    args: Args<S> & { projectId: string },
    context: ProjectContext,
  ) => Promise<Record<string, unknown>>;
}): CustomMcpTool {
  const write = def.write ?? "none";
  return {
    name: def.name,
    config: {
      title: def.title,
      description: def.description,
      inputSchema: { projectId: projectIdSchema, ...def.input },
      outputSchema: looseObjectOutputSchema,
      annotations: {
        readOnlyHint: write === "none",
        openWorldHint: def.openWorld ?? false,
        destructiveHint: write === "delete",
      },
    },
    handler: (rawArgs, toolContext) =>
      withMcpProjectAuth(
        async (
          args: { projectId: string } & Record<string, unknown>,
          context,
        ) => {
          const typed = args as Args<S> & { projectId: string };
          const result = await def.run(typed, context);
          return mcpResponse({
            text: JSON.stringify(result),
            meta: buildProjectMeta(
              context,
              typed.projectId,
              def.path?.(typed) ?? `/p/${typed.projectId}/radar`,
            ),
            structuredContent: result,
          });
        },
      )(
        rawArgs as { projectId: string } & Record<string, unknown>,
        toolContext,
      ),
  };
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const periodShape = {
  range: z
    .enum(RADAR_RANGES)
    .default("last_28_days")
    .describe(
      'Period to analyse. Use "custom" with startDate and endDate (YYYY-MM-DD). Search Console keeps 16 months.',
    ),
  startDate: date.optional().describe("Only with range=custom."),
  endDate: date.optional().describe("Only with range=custom."),
  compare: z
    .enum(["previous", "year"])
    .default("previous")
    .describe(
      "Compare with the period right before, or with the same dates a year earlier. Nothing is compared when that falls outside the 16 months Search Console keeps.",
    ),
};

const brandShape = {
  includeBrand: z
    .boolean()
    .default(false)
    .describe(
      "Brand queries (the site's own name) are left out by default because they hide how the site does for everything else.",
    ),
};

const NOT_CONNECTED = (reason: "none" | "reconnect") => ({
  connected: false,
  reason,
  message:
    reason === "reconnect"
      ? "Google ya no acepta el permiso guardado: hay que volver a conectar Search Console en los ajustes del proyecto."
      : "Este proyecto no tiene Search Console conectado.",
});

const take = <T>(rows: T[], limit: number) => rows.slice(0, limit);

const radarTool = defineTool({
  name: "radar_overview",
  title: "Radar: overview of a period",
  description:
    "Headline numbers of the site from Search Console (clicks, impressions, CTR, average position) against the previous period or last year, the daily trend, how queries distribute across position bands (top 3, 4-10…), the segments (page type, search intent, device, brand) and the top pages. Free, no credits. Brand queries are excluded unless includeBrand is true. Start here to understand how a site is doing.",
  input: { ...periodShape, ...brandShape },
  run: async ({ projectId, ...input }) => {
    const report = await buildRadarReport(projectId, input);
    if (!report.connected) return NOT_CONNECTED(report.reason);
    const segment = (rows: typeof report.segments.device) =>
      rows.map((row) => ({
        label: row.label,
        clicks: row.clicks,
        prevClicks: row.prevClicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        items: row.items,
      }));
    return {
      connected: true,
      siteUrl: report.siteUrl,
      range: report.range,
      period: report.period,
      scope: report.totalsScope,
      totals: report.totals,
      prevTotals: report.prevTotals,
      brand: {
        terms: report.brand.terms,
        clicks: report.brand.clicks,
        prevClicks: report.brand.prevClicks,
        otherClicks: report.brand.otherClicks,
      },
      daily: report.daily.map((point) => [
        point.date,
        point.clicks,
        point.impressions,
        Math.round(point.position * 10) / 10,
        point.prevClicks,
      ]),
      dailyColumns: ["date", "clicks", "impressions", "position", "prevClicks"],
      bands: report.bands.map((band) => ({
        label: band.label,
        queries: band.queries,
        prevQueries: band.prevQueries,
        clicks: band.clicks,
        prevClicks: band.prevClicks,
        entered: take(band.entered, 5),
        left: take(band.left, 5),
      })),
      segments: {
        pageType: segment(report.segments.pageType),
        intent: segment(report.segments.intent),
        device: segment(report.segments.device),
        brand: segment(report.segments.brand),
        language: segment(report.segments.language),
      },
      topPages: report.topPages,
    };
  },
});

const changesTool = defineTool({
  name: "radar_changes",
  title: "Radar: what went up and down",
  description:
    "Pages and queries that gained or lost clicks against the comparison period, with the probable cause of each page change (position, demand, CTR) and the queries behind it, plus the new and lost queries. Free, no credits. Use it to explain a drop or a rise.",
  input: {
    ...periodShape,
    ...brandShape,
    limit: z.number().int().min(1).max(10).default(10),
  },
  run: async ({ projectId, limit, ...input }) => {
    const report = await buildRadarReport(projectId, input);
    if (!report.connected) return NOT_CONNECTED(report.reason);
    return {
      connected: true,
      comparable: report.period.comparable,
      pageWinners: take(report.pageChanges.winners, limit),
      pageLosers: take(report.pageChanges.losers, limit),
      queryWinners: take(report.queryChanges.winners, limit),
      queryLosers: take(report.queryChanges.losers, limit),
      newQueries: take(report.newQueries, limit),
      lostQueries: take(report.lostQueries, limit),
    };
  },
});

const opportunitiesTool = defineTool({
  name: "radar_opportunities",
  title: "Radar: opportunities",
  description:
    "Where clicks are within reach: snippets that underperform for their position (against the site's own CTR curve), queries close to the top 3, queries where several pages compete (cannibalization), questions to answer, pages with thin traction and emerging queries. Free, no credits.",
  input: {
    ...periodShape,
    ...brandShape,
    limit: z.number().int().min(1).max(30).default(15),
  },
  run: async ({ projectId, limit, ...input }) => {
    const report = await buildRadarReport(projectId, input);
    if (!report.connected) return NOT_CONNECTED(report.reason);
    return {
      connected: true,
      snippets: take(report.ctrOpportunities, limit),
      nearTop: take(report.nearTop, limit),
      cannibalized: take(report.cannibalized, limit),
      questions: take(report.questions, limit),
      lowTraction: take(report.lowTraction, limit),
      emerging: take(report.emerging, limit),
      ctrCurve: report.ctrCurve,
    };
  },
});

const actionPlanTool = defineTool({
  name: "radar_action_plan",
  title: "Radar: action plan",
  description:
    "The prioritised action plan the app shows (recover losses, rewrite snippets, push queries to the top, answer questions, fix competing pages, add traction, ride emerging queries): each action with its headline, key figures, what the data says, concrete steps, estimated clicks at stake and effort. Also returns the actions already marked as done. Free, no credits.",
  input: { ...periodShape, ...brandShape },
  path: ({ projectId }: { projectId: string }) => `/p/${projectId}/action-plan`,
  run: async ({ projectId, ...input }) => {
    const report = await buildRadarReport(projectId, input);
    if (!report.connected) return NOT_CONNECTED(report.reason);
    const done = await listActions(projectId, 30);
    return {
      connected: true,
      plan: buildActions(report),
      done: done.map((row) => ({
        key: row.action_key,
        kind: row.kind,
        title: row.title,
        page: row.page,
        query: row.query,
        doneAt: row.done_at,
        note: row.note,
      })),
    };
  },
});

const topicsTool = defineTool({
  name: "radar_topics",
  title: "Radar: topics",
  description:
    "Search queries grouped into topics (no paid API), with each topic's clicks, impressions and position against the comparison period, how much is within reach and the pages that show for it. Free, no credits.",
  input: { ...periodShape, ...brandShape },
  path: ({ projectId }: { projectId: string }) => `/p/${projectId}/topics`,
  run: async ({ projectId, ...input }) => {
    const report = await buildTopicsReport(projectId, { ...input, projectId });
    return report.connected
      ? { ...report, topics: take(report.topics, 40) }
      : NOT_CONNECTED(report.reason);
  },
});

const discoverTool = defineTool({
  name: "discover_report",
  title: "Discover, News, image and video traffic",
  description:
    "Traffic from Google Discover (default), Google News, image or video search from Search Console: daily trend, top pages, countries and what moved. Discover has no queries or position. Free, no credits.",
  input: {
    ...periodShape,
    type: z
      .enum(["discover", "googleNews", "news", "image", "video"])
      .default("discover"),
  },
  path: ({ projectId }: { projectId: string }) => `/p/${projectId}/discover`,
  run: async ({ projectId, ...input }) =>
    (await buildDiscoverReport(projectId, { ...input, projectId })) as Record<
      string,
      unknown
    >,
});

const indexTool = defineTool({
  name: "crawl_index_report",
  title: "Sitemap vs Google: indexing report",
  description:
    "Compares the URLs in the site's sitemaps with the pages Google actually shows (last 3 months): sitemaps sent to Search Console with errors, URLs in the sitemap without a single impression, pages with impressions missing from the sitemap, and the weight of each site section. Free, no credits. Follow with inspect_urls (OpenSEO's own tool) to ask Google about specific URLs.",
  input: { limit: z.number().int().min(1).max(300).default(50) },
  path: ({ projectId }: { projectId: string }) => `/p/${projectId}/indexing`,
  openWorld: true,
  run: async ({ projectId, limit }) => {
    const report = await buildIndexReport(projectId);
    if (!report.connected) return NOT_CONNECTED(report.reason);
    return {
      ...report,
      unseen: take(report.unseen, limit),
      notInSitemap: take(report.notInSitemap, limit),
    } as Record<string, unknown>;
  },
});

const crawlTool = defineTool({
  name: "crawl_server_health",
  title: "Server and robots.txt health",
  description:
    "Reads the site's robots.txt (the rules Googlebot obeys, declared sitemaps) and measures the 10 pages with most clicks: status, redirect chain, time to first byte, size, noindex header, and whether robots.txt blocks them. Measured from Cloudflare's network, so it is a reference rather than Googlebot's own figures. Makes real HTTP requests to the site. Free, no credits.",
  input: {},
  path: ({ projectId }: { projectId: string }) => `/p/${projectId}/indexing`,
  openWorld: true,
  run: async ({ projectId }) =>
    (await buildCrawlHealth(projectId)) as unknown as Record<string, unknown>,
});

const updatesTool = defineTool({
  name: "google_updates",
  title: "Google ranking updates",
  description:
    "Google's own list of ranking updates (core, spam, helpful content, Discover…) from the Search Status Dashboard, refreshed daily. Use it to check whether a traffic change coincides with an update. Pass from/to to keep only those overlapping that window. Free, no credits.",
  input: { from: date.optional(), to: date.optional() },
  run: async ({ from, to }) => {
    const all = await getGoogleUpdates();
    const updates =
      from && to
        ? updatesBetween(all, from, to)
        : from
          ? updatesBetween(all, from, "9999-12-31")
          : all;
    return { updates: take(updates, 60), total: updates.length };
  },
});

const alertsTool = defineTool({
  name: "radar_alerts",
  title: "Radar alerts: rules and recent events",
  description:
    "The project's alert rules (what is watched, metric, condition, threshold, whether enabled) and the latest alerts raised. Read only. Free, no credits.",
  input: { events: z.number().int().min(0).max(100).default(30) },
  path: ({ projectId }: { projectId: string }) => `/p/${projectId}/alerts`,
  run: async ({ projectId, events }) => {
    const [rules, raised] = await Promise.all([
      listRules(projectId),
      events > 0 ? listEvents(projectId) : Promise.resolve([]),
    ]);
    return {
      rules: rules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        scope: rule.scope,
        target: rule.target,
        metric: rule.metric,
        condition: rule.condition,
        threshold: rule.threshold,
        windowDays: rule.window_days,
        enabled: Boolean(rule.enabled),
      })),
      events: take(raised, events),
    };
  },
});

const costsTool = defineTool({
  name: "cost_overview",
  title: "Spending in euros",
  description:
    "Spending on paid data (DataForSEO) in euros for the organization: today, last 7 days, this month, previous month, by feature and by project, and the provider balance if known. Read only. Free, no credits.",
  input: {},
  run: async (_args, context) =>
    (await getCostOverview(context.auth.organizationId)) as unknown as Record<
      string,
      unknown
    >,
});

// ------------------------------------------------------------- reporting

const reportIdSchema = z
  .string()
  .min(1)
  .describe("Report id from reporting_list.");

const notesPatch = {
  title: z.string().min(1).max(200).optional(),
  clientName: z.string().max(120).nullable().optional(),
  message: z
    .string()
    .max(4000)
    .optional()
    .describe(
      "Personal message after the cover, in the consultant's voice (Spanish). Replaces the previous one.",
    ),
  sectionNotes: z
    .record(z.string(), z.string().max(2000))
    .optional()
    .describe(
      `Notes under sections, keyed by section id (${REPORT_SECTIONS.map((section) => section.id).join(", ")}). Merged into the existing notes; an empty string removes one.`,
    ),
  hidden: z
    .array(z.string())
    .optional()
    .describe("Section ids to leave out. Replaces the previous list."),
  nextSteps: z
    .string()
    .max(4000)
    .optional()
    .describe("Next steps, one per line. Replaces the previous text."),
};

const reportBrief = (
  report: NonNullable<Awaited<ReturnType<typeof getReport>>>,
  baseUrl: string,
) => ({
  id: report.id,
  title: report.title,
  clientName: report.clientName,
  shared: report.shared,
  range: report.range,
  createdAt: report.createdAt,
  updatedAt: report.updatedAt,
  previewUrl: `${baseUrl}/rv/${report.id}`,
  editUrl: `${baseUrl}/p/${report.projectId}/reporting/${report.id}`,
  clientUrl: report.shared ? `${baseUrl}/c/${report.token}` : null,
});

/** The findings an agent can rewrite in its own words. */
const insightBrief = (
  report: NonNullable<Awaited<ReturnType<typeof getReport>>>,
) =>
  buildInsights(report.snapshot).map((item) => ({
    id: item.id,
    tone: item.tone,
    title: item.title,
    body: item.body,
    upside: item.upside,
    stats: item.stats,
  }));

const reportingList = defineTool({
  name: "reporting_list",
  title: "Client reports: list",
  description:
    "Lists the project's client reports (online web pages with interactive charts, not PDFs): title, client, period, whether the public link is on, and the links. Read only.",
  input: {},
  path: ({ projectId }: { projectId: string }) => `/p/${projectId}/reporting`,
  run: async ({ projectId }, context) => ({
    reports: (await listReports(projectId)).map((report) => ({
      id: report.id,
      title: report.title,
      clientName: report.clientName,
      shared: report.shared,
      range: report.range,
      createdAt: report.createdAt,
      editUrl: `${context.baseUrl}/p/${projectId}/reporting/${report.id}`,
      clientUrl: report.shared ? `${context.baseUrl}/c/${report.token}` : null,
    })),
  }),
});

const reportingCreate = defineTool({
  name: "reporting_create",
  title: "Client reports: create",
  description:
    "Creates a client report from Search Console data (free), as a branded web page: cover with the headline numbers, findings that cross the data (traffic vs impressions vs position, Google updates against the daily trend, where the change comes from, concentration, brand dependence), interactive trend chart, positions, topics, audience split, weekly rhythm, opportunities, technical health and Discover. It starts private. Returns the automatic verdict and the findings so you can write the personal message and section notes with reporting_update. Tone: honest but constructive; every finding already carries an encouraging angle. Typical flow: reporting_create → read verdict and insights (use radar_* tools for more depth) → reporting_update with commentary in Spanish → reporting_share only if the user asks to send it.",
  input: {
    title: z
      .string()
      .min(1)
      .max(200)
      .describe('E.g. "Informe SEO — Octubre 2026".'),
    clientName: z.string().max(120).optional(),
    ...periodShape,
  },
  write: "write",
  path: ({ projectId }: { projectId: string }) => `/p/${projectId}/reporting`,
  run: async ({ projectId, title, clientName, ...period }, context) => {
    const built = await buildReportSnapshot(projectId, period);
    if (!built.ok) return NOT_CONNECTED(built.reason);
    const report = await insertReport({
      projectId,
      title,
      clientName: clientName?.trim() || null,
      createdBy: context.auth.userId,
      snapshot: built.snapshot,
      notes: EMPTY_NOTES,
    });
    return {
      created: true,
      report: reportBrief(report, context.baseUrl),
      verdict: buildVerdict(report.snapshot),
      insights: insightBrief(report),
    };
  },
});

const reportingGet = defineTool({
  name: "reporting_get",
  title: "Client reports: read one",
  description:
    "Reads a client report: its notes, the automatic verdict, the findings, headline numbers and the links. Read only. The snapshot's full data is not returned; use radar_* tools for deeper analysis.",
  input: { reportId: reportIdSchema },
  path: ({ projectId }: { projectId: string }) => `/p/${projectId}/reporting`,
  run: async ({ projectId, reportId }, context) => {
    const report = await getReport(projectId, reportId);
    if (!report) return { found: false };
    return {
      found: true,
      report: reportBrief(report, context.baseUrl),
      notes: report.notes,
      verdict: buildVerdict(report.snapshot),
      insights: insightBrief(report),
      totals: report.snapshot.totals,
      prevTotals: report.snapshot.prevTotals,
    };
  },
});

const reportingUpdate = defineTool({
  name: "reporting_update",
  title: "Client reports: write notes",
  description:
    "Edits a client report's texts: title, client name, the personal message after the cover, notes under sections, hidden sections and next steps. Only the fields you pass change. Write for the client in clear, warm Spanish, no jargon, honest but always with a constructive angle. Does not change the numbers (use reporting_refresh) or the sharing state (use reporting_share).",
  input: { reportId: reportIdSchema, ...notesPatch },
  write: "write",
  path: ({ projectId }: { projectId: string }) => `/p/${projectId}/reporting`,
  run: async ({ projectId, reportId, ...patch }, context) => {
    const report = await getReport(projectId, reportId);
    if (!report) return { updated: false, reason: "No existe ese informe." };
    const sectionNotes = { ...report.notes.sectionNotes };
    for (const [id, text] of Object.entries(patch.sectionNotes ?? {})) {
      if (text.trim()) sectionNotes[id] = text;
      else delete sectionNotes[id];
    }
    const notes: ReportNotes = {
      ...report.notes,
      message: patch.message ?? report.notes.message,
      sectionNotes,
      hidden: patch.hidden ?? report.notes.hidden,
      nextSteps: patch.nextSteps ?? report.notes.nextSteps,
    };
    await updateReport(projectId, reportId, {
      title: patch.title,
      clientName: patch.clientName,
      notes,
    });
    return {
      updated: true,
      previewUrl: `${context.baseUrl}/rv/${reportId}`,
      notes,
    };
  },
});

const reportingRefresh = defineTool({
  name: "reporting_refresh",
  title: "Client reports: refresh the numbers",
  description:
    "Rebuilds a report's data from Search Console for the same dates. Notes and the public link stay. Free.",
  input: { reportId: reportIdSchema },
  write: "write",
  path: ({ projectId }: { projectId: string }) => `/p/${projectId}/reporting`,
  run: async ({ projectId, reportId }, context) => {
    const report = await getReport(projectId, reportId);
    if (!report) return { refreshed: false, reason: "No existe ese informe." };
    const built = await buildReportSnapshot(projectId, {
      range: "custom",
      startDate: report.snapshot.range.startDate,
      endDate: report.snapshot.range.endDate,
      compare: report.snapshot.period.compare,
    });
    if (!built.ok) return NOT_CONNECTED(built.reason);
    await replaceSnapshot(projectId, reportId, built.snapshot);
    return {
      refreshed: true,
      previewUrl: `${context.baseUrl}/rv/${reportId}`,
    };
  },
});

const reportingShare = defineTool({
  name: "reporting_share",
  title: "Client reports: turn the public link on or off",
  description:
    "Turns a report's public link on or off. With it on, anyone holding the link can read the report without signing in. Only turn it on when the user explicitly asks to share or send the report; never infer permission. Returns the client URL when on.",
  input: {
    reportId: reportIdSchema,
    shared: z.boolean().describe("true = public link on, false = off."),
  },
  write: "write",
  path: ({ projectId }: { projectId: string }) => `/p/${projectId}/reporting`,
  run: async ({ projectId, reportId, shared }, context) => {
    const report = await getReport(projectId, reportId);
    if (!report) return { shared: false, reason: "No existe ese informe." };
    await updateReport(projectId, reportId, { shared });
    return {
      shared,
      clientUrl: shared ? `${context.baseUrl}/c/${report.token}` : null,
    };
  },
});

const reportingDelete = defineTool({
  name: "reporting_delete",
  title: "Client reports: delete",
  description:
    "Permanently deletes a client report and its public link. Cannot be undone; confirm with the user first.",
  input: { reportId: reportIdSchema },
  write: "delete",
  path: ({ projectId }: { projectId: string }) => `/p/${projectId}/reporting`,
  run: async ({ projectId, reportId }) => ({
    deleted: await deleteReport(projectId, reportId),
  }),
});

export const customMcpTools: CustomMcpTool[] = [
  radarTool,
  changesTool,
  opportunitiesTool,
  actionPlanTool,
  topicsTool,
  discoverTool,
  indexTool,
  crawlTool,
  updatesTool,
  alertsTool,
  costsTool,
  reportingList,
  reportingCreate,
  reportingGet,
  reportingUpdate,
  reportingRefresh,
  reportingShare,
  reportingDelete,
];
