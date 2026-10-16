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
import { buildReportSnapshot } from "@/custom/reporting/server/snapshot";
import { EMPTY_NOTES } from "@/custom/reporting/types";
import { requireProjectContext } from "@/serverFunctions/middleware";

const projectInput = z.object({ projectId: z.string().min(1) });
const reportInput = projectInput.extend({ reportId: z.string().min(1) });

const notesSchema = z.object({
  message: z.string().max(4000),
  sectionNotes: z.record(z.string(), z.string().max(2000)),
  hidden: z.array(z.string().max(40)).max(20),
  extraTasks: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        title: z.string().min(1).max(200),
        detail: z.string().max(1000),
      }),
    )
    .max(30),
  nextSteps: z.string().max(4000),
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
    await replaceSnapshot(context.projectId, data.reportId, built.snapshot);
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
