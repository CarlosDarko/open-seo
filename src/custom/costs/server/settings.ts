import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  DEFAULT_COST_SETTINGS,
  type CostSettings,
} from "@/custom/costs/shared";

const KV_KEY = "costs:settings";

export const costSettingsSchema = z.object({
  monthlyBudgetEur: z.number().min(0).max(100000),
  warnAtPercent: z.number().int().min(1).max(100),
  confirmAboveEur: z.number().min(0).max(10000),
  lowBalanceEur: z.number().min(0).max(100000),
});

export async function getCostSettings(): Promise<CostSettings> {
  try {
    const raw = await env.KV.get(KV_KEY);
    if (!raw) return DEFAULT_COST_SETTINGS;
    const parsed = costSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_COST_SETTINGS;
  } catch {
    return DEFAULT_COST_SETTINGS;
  }
}

export async function saveCostSettings(
  settings: CostSettings,
): Promise<CostSettings> {
  const clean = costSettingsSchema.parse(settings);
  await env.KV.put(KV_KEY, JSON.stringify(clean));
  return clean;
}
