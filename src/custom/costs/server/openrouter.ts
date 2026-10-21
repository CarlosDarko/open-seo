import { env } from "cloudflare:workers";
import { recordCost } from "@/custom/costs/server/ledger";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

// OpenRouter pays for the AI that researches a brand and the SAM assistant.
// Its calls happen inside OpenSEO's own code, so instead of hooking every one
// the spend is read from OpenRouter itself: the usage of this API key grows
// with every call, and each growth is booked in the euro ledger (feature
// "openrouter"). The remaining credit comes from the same API. Both endpoints
// are free. Checked at most every five minutes, whenever the cost meter asks.

const KV_KEY = "costs:openrouter";
const CACHE_MS = 5 * 60 * 1000;
const API = "https://openrouter.ai/api/v1";

export type OpenRouterState = {
  /** Total spent by this API key, in US dollars, at the last check. */
  lastUsageUsd: number;
  /** Credit left in the account, in US dollars (null if unknown). */
  balanceUsd: number | null;
  fetchedAt: number;
};

async function readState(): Promise<OpenRouterState | null> {
  try {
    const raw = await env.KV.get(KV_KEY);
    return raw ? (JSON.parse(raw) as OpenRouterState) : null;
  } catch {
    return null;
  }
}

async function getJson(path: string, key: string): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok)
    throw new Error(`OpenRouter ${path} answered ${response.status}`);
  return response.json();
}

/** Books what OpenRouter has charged since the last check and returns the
 *  remaining credit. Never throws; returns null without a key or when the
 *  API cannot be reached. */
export async function syncOpenRouterUsage(
  organizationId: string,
  options: { force?: boolean } = {},
): Promise<OpenRouterState | null> {
  const key = await getOptionalEnvValue("OPENROUTER_API_KEY");
  if (!key) return null;
  const previous = await readState();
  if (
    previous &&
    !options.force &&
    Date.now() - previous.fetchedAt < CACHE_MS
  ) {
    return previous;
  }
  try {
    const keyInfo = (await getJson("/key", key)) as {
      data?: { usage?: number };
    };
    const usage = keyInfo.data?.usage;
    if (typeof usage !== "number") return previous;
    let balanceUsd: number | null = previous?.balanceUsd ?? null;
    try {
      const credits = (await getJson("/credits", key)) as {
        data?: { total_credits?: number; total_usage?: number };
      };
      const total = credits.data?.total_credits;
      const used = credits.data?.total_usage;
      if (typeof total === "number" && typeof used === "number") {
        balanceUsd = total - used;
      }
    } catch (error) {
      console.warn("costs.openrouter-credits failed:", error);
    }
    // The first check only sets the starting point when the key had spent
    // before this tracking existed; later checks book the difference.
    const delta = previous ? usage - previous.lastUsageUsd : usage;
    if (delta > 0.00001) {
      await recordCost({
        organizationId,
        userEmail: null,
        projectId: null,
        feature: "openrouter",
        endpoint: "ai",
        costUsd: delta,
        outcome: "ok",
      });
    }
    const fresh: OpenRouterState = {
      lastUsageUsd: usage,
      balanceUsd,
      fetchedAt: Date.now(),
    };
    await env.KV.put(KV_KEY, JSON.stringify(fresh));
    return fresh;
  } catch (error) {
    console.warn("costs.openrouter-sync failed:", error);
    return previous;
  }
}
