import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  isSafeWebhookUrl,
  isValidEmail,
} from "@/custom/radar/alertMessages";
import {
  CONDITIONS,
  DEVICES,
  FILTER_OPS,
  METRICS,
  SCOPES,
  SCOPES_WITH_TARGET,
  WINDOWS,
  isValidCombination,
  type Triggered,
} from "@/custom/radar/alertRules";
import {
  evaluateAndStore,
  ruleFromRow,
} from "@/custom/radar/server/alertsEngine";
import {
  getNotifyInfo,
  rememberOrigin,
  saveNotifySettings,
  sendTestNotification,
} from "@/custom/radar/server/notify";
import {
  countUnseenEvents,
  deleteRule,
  insertRule,
  listEvents,
  listRules,
  markEventsSeen,
  setRuleEnabled,
} from "@/custom/radar/server/radarDb";
import { GscService } from "@/server/features/gsc/services/GscService";
import { AppError } from "@/server/lib/errors";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { requireProjectContext } from "@/serverFunctions/middleware";

const project = z.object({ projectId: z.string().min(1) });

const filterSchema = z.object({
  metric: z.enum(METRICS),
  op: z.enum(FILTER_OPS),
  value: z.number().min(0).max(1_000_000),
  period: z.enum(["current", "previous"]),
});

const notifySchema = z.object({
  emails: z
    .array(z.string().trim().toLowerCase())
    .max(10)
    .refine((list) => list.every(isValidEmail), "Correo no válido"),
  webhooks: z
    .array(z.string().trim())
    .max(3)
    .refine((list) => list.every(isSafeWebhookUrl), "Webhook no permitido"),
});

const ruleInputSchema = project.extend({
  name: z.string().trim().min(2).max(80),
  scope: z.enum(SCOPES),
  target: z.string().trim().max(2000).nullable(),
  metric: z.enum(METRICS),
  condition: z.enum(CONDITIONS),
  threshold: z.number().min(0).max(1_000_000),
  windowDays: z
    .number()
    .refine((value) => (WINDOWS as readonly number[]).includes(value)),
  minValue: z.number().min(0).max(1_000_000),
  filters: z.array(filterSchema).max(4).default([]),
  notify: notifySchema.default({ emails: [], webhooks: [] }),
});

async function remember() {
  try {
    await rememberOrigin(getPublicOrigin(getRequest()));
  } catch {
    // Links in messages are a nicety: never block the action for them.
  }
}

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
    const needsTarget = SCOPES_WITH_TARGET.includes(data.scope);
    if (needsTarget && !data.target) {
      throw new AppError("VALIDATION_ERROR", "Indica a qué se aplica la regla.");
    }
    if (
      data.scope === "device" &&
      !(DEVICES as readonly string[]).includes(data.target ?? "")
    ) {
      throw new AppError("VALIDATION_ERROR", "Dispositivo no válido.");
    }
    await insertRule({
      id: crypto.randomUUID(),
      project_id: context.projectId,
      name: data.name,
      scope: data.scope,
      target: needsTarget ? data.target : null,
      metric: data.metric,
      condition: data.condition,
      threshold: data.threshold,
      window_days: data.windowDays,
      min_value: data.minValue,
      enabled: 1,
      created_at: new Date().toISOString(),
      created_by: context.userEmail,
      filters_json: data.filters.length > 0 ? JSON.stringify(data.filters) : null,
      notify_json:
        data.notify.emails.length + data.notify.webhooks.length > 0
          ? JSON.stringify(data.notify)
          : null,
    });
    await remember();
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
    await remember();
    const rules = (await listRules(context.projectId))
      .filter((row) => row.enabled === 1)
      .map(ruleFromRow);
    const { results, created } = await evaluateAndStore(context.projectId, rules);
    return { checked: rules.length, triggered: results.length, created };
  });

/** The e-mail sender and whether a Resend key is stored (never the key). */
export const getAlertChannels = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(project)
  .handler(async ({ context }) => getNotifyInfo(context.projectId));

/** Saves the e-mail sender and, when given, the Resend key (null removes it). */
export const saveAlertChannels = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    project.extend({
      fromEmail: z.string().trim().max(200).nullable(),
      resendKey: z.string().trim().max(300).nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await saveNotifySettings(context.projectId, {
      fromEmail: data.fromEmail,
      resendKey: data.resendKey,
    });
    return { ok: true as const };
  });

/** Sends a harmless test message to check an e-mail address or a webhook. */
export const sendAlertTest = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    project.extend({
      emails: z.array(z.string().trim().toLowerCase()).max(10).default([]),
      webhook: z.string().trim().max(2000).nullable().default(null),
    }),
  )
  .handler(async ({ data, context }) => {
    if (data.emails.length === 0 && !data.webhook) {
      throw new AppError("VALIDATION_ERROR", "Indica un correo o un webhook.");
    }
    if (!data.emails.every(isValidEmail)) {
      throw new AppError("VALIDATION_ERROR", "Correo no válido.");
    }
    if (data.webhook && !isSafeWebhookUrl(data.webhook)) {
      throw new AppError("VALIDATION_ERROR", "Webhook no permitido.");
    }
    await remember();
    const connection = await GscService.getConnection(context.projectId);
    const site = connection
      ? connection.siteUrl.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "")
      : null;
    return {
      results: await sendTestNotification({
        projectId: context.projectId,
        emails: data.emails,
        webhook: data.webhook,
        site,
      }),
    };
  });
