import { env } from "cloudflare:workers";
import { fetchUserData } from "@/server/lib/dataforseo/appendix";

// DataForSEO account snapshot from the free /v3/appendix/user_data endpoint
// (never billed). Cached for 5 minutes so the sidebar and banners can ask for
// it on every page without hammering the API.

const KV_KEY = "costs:balance";
const CACHE_MS = 5 * 60 * 1000;

export type ProviderBalance = {
  balanceUsd: number;
  depositedUsd: number;
  fetchedAt: number;
};

async function readCache(): Promise<ProviderBalance | null> {
  try {
    const raw = await env.KV.get(KV_KEY);
    return raw ? (JSON.parse(raw) as ProviderBalance) : null;
  } catch {
    return null;
  }
}

/** Returns null when DataForSEO cannot be reached; never throws. */
export async function getProviderBalance(
  options: { forceRefresh?: boolean } = {},
): Promise<ProviderBalance | null> {
  const cached = await readCache();
  if (
    cached &&
    !options.forceRefresh &&
    Date.now() - cached.fetchedAt < CACHE_MS
  ) {
    return cached;
  }

  try {
    const data = await fetchUserData();
    const balance = data?.money?.balance;
    const total = data?.money?.total;
    if (typeof balance !== "number" || typeof total !== "number") {
      return cached;
    }
    const fresh: ProviderBalance = {
      balanceUsd: balance,
      depositedUsd: total,
      fetchedAt: Date.now(),
    };
    try {
      await env.KV.put(KV_KEY, JSON.stringify(fresh));
    } catch (error) {
      console.warn("costs.balance-cache-write failed:", error);
    }
    return fresh;
  } catch (error) {
    console.warn("costs.balance-fetch failed:", error);
    return cached;
  }
}
