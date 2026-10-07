import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  exportCostEventsCsv,
  getCostOverview as loadCostOverview,
  getCostSummary as loadCostSummary,
  listCostEvents as loadCostEvents,
} from "@/custom/costs/server/ledger";
import { getProviderBalance } from "@/custom/costs/server/balance";
import { getUsdEurRate } from "@/custom/costs/server/fx";
import {
  costSettingsSchema,
  getCostSettings as loadCostSettings,
  saveCostSettings as persistCostSettings,
} from "@/custom/costs/server/settings";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

// Euro cost tracking (fork feature). Everything is scoped to the caller's
// organization; the ledger itself lives in src/custom/costs.

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .optional();

const eventsSchema = z.object({
  feature: z.string().max(60).optional(),
  month: monthSchema,
  limit: z.number().int().min(1).max(200).default(25),
  offset: z.number().int().min(0).default(0),
});

const exportSchema = z.object({
  feature: z.string().max(60).optional(),
  month: monthSchema,
});

export const getCostOverview = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) => loadCostOverview(context.organizationId));

/** Small payload for the sidebar meter and the alert banner. */
export const getCostSummary = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) => loadCostSummary(context.organizationId));

export const listCostEvents = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(eventsSchema)
  .handler(({ data, context }) => loadCostEvents(context.organizationId, data));

export const exportCostEvents = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(exportSchema)
  .handler(async ({ data, context }) => ({
    csv: await exportCostEventsCsv(context.organizationId, data),
  }));

export const getCostSettings = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    const [settings, fx] = await Promise.all([
      loadCostSettings(),
      getUsdEurRate(),
    ]);
    return { settings, fx };
  });

export const saveCostSettings = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(costSettingsSchema)
  .handler(({ data }) => persistCostSettings(data));

/** Forces a fresh read of the DataForSEO balance (free endpoint). */
export const refreshProviderBalance = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    await getProviderBalance({ forceRefresh: true });
    return { ok: true };
  });
