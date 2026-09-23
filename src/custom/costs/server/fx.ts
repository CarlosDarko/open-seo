import { env } from "cloudflare:workers";
import { FALLBACK_USD_EUR } from "@/custom/costs/shared";

// USD -> EUR rate from the European Central Bank (via frankfurter.dev, free,
// no key). It is fetched at most every 12 hours; only the currency pair is
// sent, no user data. If the fetch fails the last known rate is reused.

const KV_KEY = "costs:fx:usd-eur";
const REFRESH_MS = 12 * 60 * 60 * 1000;
const SOURCE_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR";

export type UsdEurRate = {
  rate: number;
  /** Date the ECB published this rate (YYYY-MM-DD), or null for the fallback. */
  asOf: string | null;
  source: "bce" | "aproximado";
};

type Cached = { rate: number; asOf: string | null; fetchedAt: number };

let memory: { value: UsdEurRate; at: number } | null = null;
const MEMORY_MS = 5 * 60 * 1000;

function isPlausible(rate: unknown): rate is number {
  return typeof rate === "number" && rate > 0.3 && rate < 2;
}

async function readCache(): Promise<Cached | null> {
  try {
    const raw = await env.KV.get(KV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    return isPlausible(parsed.rate) ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchFromEcb(): Promise<Cached | null> {
  try {
    const response = await fetch(SOURCE_URL, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      date?: string;
      rates?: { EUR?: number };
    };
    const rate = body.rates?.EUR;
    if (!isPlausible(rate)) return null;
    return { rate, asOf: body.date ?? null, fetchedAt: Date.now() };
  } catch {
    return null;
  }
}

export async function getUsdEurRate(): Promise<UsdEurRate> {
  if (memory && Date.now() - memory.at < MEMORY_MS) return memory.value;

  const cached = await readCache();
  let chosen = cached;

  if (!cached || Date.now() - cached.fetchedAt > REFRESH_MS) {
    const fresh = await fetchFromEcb();
    if (fresh) {
      chosen = fresh;
      try {
        await env.KV.put(KV_KEY, JSON.stringify(fresh));
      } catch (error) {
        console.warn("costs.fx-cache-write failed:", error);
      }
    }
  }

  const value: UsdEurRate = chosen
    ? { rate: chosen.rate, asOf: chosen.asOf, source: "bce" }
    : { rate: FALLBACK_USD_EUR, asOf: null, source: "aproximado" };
  memory = { value, at: Date.now() };
  return value;
}
