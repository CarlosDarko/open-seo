import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { actionKey } from "@/custom/radar/actionKey";
import {
  judgeImpact,
  measurementWindows,
  type Baseline,
  type Impact,
} from "@/custom/radar/trackingImpact";
import {
  deleteAction,
  insertAction,
  listActions,
} from "@/custom/radar/server/radarDb";
import {
  fetchScopeStats,
  fetchSiteStats,
  type Scope,
} from "@/custom/radar/server/scopeStats";
import { requireProjectContext } from "@/serverFunctions/middleware";

const KINDS = [
  "loss",
  "snippet",
  "push",
  "question",
  "cannibal",
  "traction",
  "emerging",
] as const;

type Kind = (typeof KINDS)[number];

const markInputSchema = z.object({
  projectId: z.string().min(1),
  kind: z.enum(KINDS),
  page: z.string().max(2000).nullable(),
  query: z.string().max(300).nullable(),
  title: z.string().max(300).nullable(),
  note: z.string().max(500).optional(),
});

/** Which page and/or query an action is measured on. */
function scopeOf(kind: Kind, page: string | null, query: string | null): Scope {
  switch (kind) {
    case "loss":
    case "traction":
      return { page, query: null };
    case "cannibal":
      return { page: null, query };
    default:
      return { page, query };
  }
}

/**
 * Marks an action as done and stores how the page (and the whole site) were
 * doing in the 28 days before, so the effect can be judged weeks later.
 */
export const markActionDone = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(markInputSchema)
  .handler(async ({ data, context }) => {
    const windows = measurementWindows(new Date());
    const window = windows.baseline;
    const scope = scopeOf(data.kind, data.page, data.query);
    const [page, site] = await Promise.all([
      fetchScopeStats(context.projectId, scope, window),
      fetchSiteStats(context.projectId, window),
    ]);
    const baseline: Baseline = {
      start: window.start,
      end: window.end,
      page,
      site,
    };
    const key = actionKey(data);
    await insertAction({
      id: crypto.randomUUID(),
      project_id: context.projectId,
      action_key: key,
      kind: data.kind,
      title: data.title,
      page: data.page,
      query: data.query,
      done_at: new Date().toISOString(),
      done_by: context.userEmail,
      note: data.note ?? null,
      baseline_json: JSON.stringify(baseline),
    });
    return { key };
  });

export const undoAction = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1), id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    await deleteAction(context.projectId, data.id);
    return { ok: true as const };
  });

export type TrackedAction = {
  id: string;
  key: string;
  kind: Kind;
  title: string | null;
  page: string | null;
  query: string | null;
  doneAt: string;
  doneBy: string | null;
  note: string | null;
  baselineWindow: { start: string; end: string };
  afterWindow: { start: string; end: string; days: number } | null;
  waitingDays: number;
  impact: Impact | null;
  error: string | null;
};

// Each measured action costs two Search Console calls (free, but with a
// per-minute quota): the newest ones are measured, older ones show their date.
const MAX_MEASURED = 20;

/** The actions marked as done, with their impact when enough time has passed. */
export const listTrackedActions = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({
      projectId: z.string().min(1),
      /** Only the newest N (the home page shows three). */
      limit: z.number().int().min(1).max(60).optional(),
    }),
  )
  .handler(async ({ data, context }): Promise<TrackedAction[]> => {
    const rows = await listActions(context.projectId, data.limit ?? 60);
    const now = new Date();
    return Promise.all(
      rows.map(async (row, index): Promise<TrackedAction> => {
        const baseline = JSON.parse(row.baseline_json) as Baseline;
        const windows = measurementWindows(row.done_at, now);
        const common = {
          id: row.id,
          key: row.action_key,
          kind: row.kind as Kind,
          title: row.title,
          page: row.page,
          query: row.query,
          doneAt: row.done_at,
          doneBy: row.done_by,
          note: row.note,
          baselineWindow: { start: baseline.start, end: baseline.end },
          afterWindow: windows.after,
          waitingDays: windows.waitingDays,
        };
        if (!windows.after || index >= MAX_MEASURED) {
          return { ...common, impact: null, error: null };
        }
        try {
          const window = {
            start: windows.after.start,
            end: windows.after.end,
            days: windows.after.days,
          };
          const [page, site] = await Promise.all([
            fetchScopeStats(
              context.projectId,
              scopeOf(row.kind as Kind, row.page, row.query),
              window,
            ),
            fetchSiteStats(context.projectId, window),
          ]);
          return {
            ...common,
            impact: judgeImpact(row.kind as Kind, baseline, { page, site }),
            error: null,
          };
        } catch (error) {
          return {
            ...common,
            impact: null,
            error:
              error instanceof Error
                ? error.message
                : "No se pudo medir en Search Console",
          };
        }
      }),
    );
  });
