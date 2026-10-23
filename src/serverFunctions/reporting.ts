import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { periodInputSchema } from "@/custom/radar/periods";
import {
  deleteReport,
  getReport,
  insertReport,
  listReports,
  replaceSnapshot,
  updateReport,
} from "@/custom/reporting/server/reportingDb";
import {
  aiStatus,
  analyzeWithAi,
  draftWithAi,
} from "@/custom/reporting/server/aiDraft";
import { parseMicroaudit } from "@/custom/reporting/microauditParse";
import { cachedAudits, cacheAudit } from "@/custom/reporting/server/auditCache";
import { prepareReportWithAi } from "@/custom/reporting/server/prepare";
import {
  getPageTypes,
  pageTypesSchema,
  savePageTypes,
} from "@/custom/reporting/server/pageTypes";
import { buildReportSnapshot } from "@/custom/reporting/server/snapshot";
import { EMPTY_NOTES } from "@/custom/reporting/types";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectInput = z.object({ projectId: z.string().min(1) });
const reportInput = projectInput.extend({ reportId: z.string().min(1) });

const notesSchema = z.object({
  message: z.string().max(4000),
  sectionNotes: z.record(z.string(), z.string().max(2000)),
  hidden: z.array(z.string().max(40)).max(20),
  nextSteps: z.string().max(4000),
  diagnoses: z
    .array(
      z.object({
        url: z.string().max(2000),
        text: z.string().max(1500),
        fixes: z.array(z.string().max(400)).max(6),
      }),
    )
    .max(6),
  titleIdeas: z
    .array(
      z.object({
        query: z.string().max(300),
        url: z.string().max(2000).nullable(),
        current: z.string().max(300).nullable(),
        options: z
          .array(
            z.object({
              title: z.string().max(120),
              description: z.string().max(250),
            }),
          )
          .max(4),
      }),
    )
    .max(8),
  opportunityIdeas: z
    .array(
      z.object({
        query: z.string().max(300),
        analysis: z.string().max(1500),
        actions: z.array(z.string().max(400)).max(6),
      }),
    )
    .max(8),
  contentIdeas: z
    .array(
      z.object({ title: z.string().max(200), reason: z.string().max(600) }),
    )
    .max(8),
});

export const listClientReports = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectInput)
  .handler(({ context }) => listReports(context.projectId));

export const createClientReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    projectInput.extend({
      title: z.string().min(1).max(200),
      clientName: z.string().max(120).nullable(),
      period: periodInputSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    const built = await buildReportSnapshot(context.projectId, data.period);
    if (!built.ok) return { ok: false as const, reason: built.reason };
    const report = await insertReport({
      projectId: context.projectId,
      title: data.title,
      clientName: data.clientName?.trim() || null,
      createdBy: context.userEmail,
      snapshot: built.snapshot,
      notes: EMPTY_NOTES,
    });
    return { ok: true as const, reportId: report.id };
  });

export const getClientReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(reportInput)
  .handler(async ({ data, context }) => {
    const report = await getReport(context.projectId, data.reportId);
    return report ?? null;
  });

export const saveClientReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    reportInput.extend({
      title: z.string().min(1).max(200),
      clientName: z.string().max(120).nullable(),
      notes: notesSchema,
    }),
  )
  .handler(async ({ data, context }) => ({
    saved: await updateReport(context.projectId, data.reportId, {
      title: data.title,
      clientName: data.clientName?.trim() || null,
      notes: data.notes,
    }),
  }));

/** Rebuilds the numbers for the same dates; notes, ticks and link stay. */
export const refreshClientReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(reportInput)
  .handler(async ({ data, context }) => {
    const report = await getReport(context.projectId, data.reportId);
    if (!report) return { ok: false as const, reason: "missing" as const };
    const built = await buildReportSnapshot(context.projectId, {
      range: "custom",
      startDate: report.snapshot.range.startDate,
      endDate: report.snapshot.range.endDate,
      compare: report.snapshot.period.compare,
    });
    if (!built.ok) return { ok: false as const, reason: built.reason };
    // The audits of the page types are slow and limited: a refresh keeps them.
    await replaceSnapshot(context.projectId, data.reportId, {
      ...built.snapshot,
      audits: report.snapshot.audits,
    });
    return { ok: true as const };
  });

/** The AI writes the summary and the analysis of every tab and the result
 *  is saved on the server, in one go. */
export const prepareClientReportWithAi = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(reportInput)
  .handler(({ data, context }) =>
    prepareReportWithAi(context.projectId, data.reportId, {
      organizationId: context.organizationId,
      userEmail: context.userEmail,
    }),
  );

/** The page types (and their example URLs) saved for the project. */
export const getReportPageTypes = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectInput)
  .handler(({ context }) => getPageTypes(context.projectId));

export const saveReportPageTypes = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectInput.extend({ types: pageTypesSchema }))
  .handler(({ data, context }) => savePageTypes(context.projectId, data.types));

/** Keeps Microaudit's answer for one example page. The browser asks
 *  Microaudit (it limits audits per IP, and the consultant's is allowed) and
 *  sends the Markdown here to be read and stored in the report. */
export const saveReportAudit = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    reportInput.extend({
      type: z.string().trim().min(1).max(40),
      url: z.url().max(2000),
      markdown: z.string().min(50).max(300_000),
    }),
  )
  .handler(async ({ data, context }) => {
    const report = await getReport(context.projectId, data.reportId);
    if (!report) return { ok: false as const, reason: "missing" as const };
    const audit = parseMicroaudit(data.markdown, data.type, data.url);
    if (!audit) return { ok: false as const, reason: "unreadable" as const };
    const audits = [
      ...report.snapshot.audits.filter((item) => item.url !== data.url),
      audit,
    ];
    await replaceSnapshot(context.projectId, data.reportId, {
      ...report.snapshot,
      audits,
    });
    await cacheAudit(context.projectId, audit).catch(() => undefined);
    return { ok: true as const, score: audit.score };
  });

/** Fills the report with the audits already saved for the example pages,
 *  as long as they are not older than `maxAgeHours`: no new audit needed. */
export const applyCachedAudits = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    reportInput.extend({
      types: pageTypesSchema,
      maxAgeHours: z
        .number()
        .min(1)
        .max(24 * 90),
    }),
  )
  .handler(async ({ data, context }) => {
    const report = await getReport(context.projectId, data.reportId);
    if (!report) return { applied: [] as string[] };
    const found = await cachedAudits(
      context.projectId,
      data.types,
      data.maxAgeHours,
    );
    if (found.length === 0) return { applied: [] as string[] };
    const urls = new Set(found.map((audit) => audit.url));
    await replaceSnapshot(context.projectId, data.reportId, {
      ...report.snapshot,
      audits: [
        ...report.snapshot.audits.filter((audit) => !urls.has(audit.url)),
        ...found,
      ],
    });
    return { applied: [...urls] };
  });

/** Drops the audits of pages that are no longer an example of any type. */
export const pruneReportAudits = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(reportInput.extend({ urls: z.array(z.url().max(2000)).max(60) }))
  .handler(async ({ data, context }) => {
    const report = await getReport(context.projectId, data.reportId);
    if (!report) return { ok: false as const };
    const keep = new Set(data.urls);
    await replaceSnapshot(context.projectId, data.reportId, {
      ...report.snapshot,
      audits: report.snapshot.audits.filter((audit) => keep.has(audit.url)),
    });
    return { ok: true as const };
  });

/** Removes the stored audits of a report (the consultant starts over). */
export const clearReportAudits = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(reportInput)
  .handler(async ({ data, context }) => {
    const report = await getReport(context.projectId, data.reportId);
    if (!report) return { ok: false as const };
    await replaceSnapshot(context.projectId, data.reportId, {
      ...report.snapshot,
      audits: [],
    });
    return { ok: true as const };
  });

export const setClientReportShared = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(reportInput.extend({ shared: z.boolean() }))
  .handler(async ({ data, context }) => ({
    saved: await updateReport(context.projectId, data.reportId, {
      shared: data.shared,
    }),
  }));

export const deleteClientReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(reportInput)
  .handler(async ({ data, context }) => ({
    deleted: await deleteReport(context.projectId, data.reportId),
  }));

/** Whether AI drafting is switched on (the key is set) and with which model. */
export const getReportingAiStatus = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectInput)
  .handler(() => aiStatus());

/** Drafts the message, section notes and next steps; nothing is saved. */
export const draftClientReportWithAi = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(reportInput)
  .handler(async ({ data, context }) => {
    const report = await getReport(context.projectId, data.reportId);
    if (!report) return { ok: false as const, reason: "failed" as const };
    return draftWithAi(report, {
      organizationId: context.organizationId,
      userEmail: context.userEmail,
    });
  });

/** Reads the pages that fell and the searches seen but not clicked, and
 *  proposes diagnoses and new titles. A draft: nothing is saved. */
export const analyzeClientReportWithAi = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(reportInput)
  .handler(async ({ data, context }) => {
    const report = await getReport(context.projectId, data.reportId);
    if (!report) return { ok: false as const, reason: "failed" as const };
    return analyzeWithAi(report, report.snapshot.siteUrl, {
      organizationId: context.organizationId,
      userEmail: context.userEmail,
    });
  });
