import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  CONDITIONS,
  METRICS,
  SCOPES,
  WINDOWS,
  isValidCombination,
  type Triggered,
} from "@/custom/radar/alertRules";
import {
  evaluateAndStore,
  ruleFromRow,
} from "@/custom/radar/server/alertsEngine";
import {
  countUnseenEvents,
  deleteRule,
  insertRule,
  listEvents,
  listRules,
  markEventsSeen,
  setRuleEnabled,
} from "@/custom/radar/server/radarDb";
import { AppError } from "@/server/lib/errors";
import { requireProjectContext } from "@/serverFunctions/middleware";

const project = z.object({ projectId: z.string().min(1) });

const ruleInputSchema = project.extend({
  name: z.string().trim().min(2).max(80),
  scope: z.enum(SCOPES),
  target: z.string().trim().max(2000).nullable(),
  metric: z.enum(METRICS),
  condition: z.enum(CONDITIONS),
  threshold: z.number().min(0).max(1_000_000),
  windowDays: z.number().refine((value) => (WINDOWS as readonly number[]).includes(value)),
  minValue: z.number().min(0).max(1_000_000),
});

export const listAlertRules = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(async ({ context }) =>
    (await listRules(context.projectId)).map((row) => ({
      ...ruleFromRow(row),
      enabled: row.enabled === 1,
      createdAt: row.created_at,
    })),
  );

export const saveAlertRule = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(ruleInputSchema)
  .handler(async ({ data, context }) => {
    if (!isValidCombination(data.metric, data.condition)) {
      throw new AppError("VALIDATION_ERROR", "Esa condición no se puede usar con esa métrica.");
    }
    if ((data.scope === "page" || data.scope === "query") && !data.target) {
      throw new AppError("VALIDATION_ERROR", "Indica la página o la consulta de la regla.");
    }
    await insertRule({
      id: crypto.randomUUID(),
      project_id: context.projectId,
      name: data.name,
      scope: data.scope,
      target: data.scope === "page" || data.scope === "query" ? data.target : null,
      metric: data.metric,
      condition: data.condition,
      threshold: data.threshold,
      window_days: data.windowDays,
      min_value: data.minValue,
      enabled: 1,
      created_at: new Date().toISOString(),
      created_by: context.userEmail,
    });
    return { ok: true as const };
  });

export const setAlertRuleEnabled = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project.extend({ id: z.string().min(1), enabled: z.boolean() }))
  .handler(async ({ data, context }) => {
    await setRuleEnabled(context.projectId, data.id, data.enabled);
    return { ok: true as const };
  });

export const deleteAlertRule = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project.extend({ id: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    await deleteRule(context.projectId, data.id);
    return { ok: true as const };
  });

type EventDetails = {
  window?: { start: string; end: string; prevStart: string; prevEnd: string };
  hits?: Triggered[];
};

export const listAlertEvents = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(async ({ context }) =>
    (await listEvents(context.projectId)).map((row) => {
      let details: EventDetails = {};
      try {
        details = JSON.parse(row.details_json) as EventDetails;
      } catch {
        details = {};
      }
      return {
        id: row.id,
        ruleName: row.rule_name,
        day: row.day,
        createdAt: row.created_at,
        summary: row.summary,
        seen: row.seen === 1,
        window: details.window ?? null,
        hits: details.hits ?? [],
      };
    }),
  );

export const countUnseenAlerts = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(async ({ context }) => ({
    unseen: await countUnseenEvents(context.projectId),
  }));

export const markAlertsSeen = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(async ({ context }) => {
    await markEventsSeen(context.projectId);
    return { ok: true as const };
  });

/** Checks the project's enabled rules now instead of waiting for the daily check. */
export const runAlertsNow = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(async ({ context }) => {
    const rules = (await listRules(context.projectId))
      .filter((row) => row.enabled === 1)
      .map(ruleFromRow);
    const { results, created } = await evaluateAndStore(context.projectId, rules);
    return { checked: rules.length, triggered: results.length, created };
  });
