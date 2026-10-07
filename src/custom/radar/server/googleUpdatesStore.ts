import { env } from "cloudflare:workers";
import {
  mergeUpdates,
  parseHistory,
  parseIncidents,
  type GoogleUpdate,
} from "@/custom/radar/googleUpdates";

// The ranking updates come from the Search Status Dashboard. They are kept in
// KV and read again when the copy is older than a day; the worker's daily
// schedule refreshes them too, so they are never more than about a day old.
// Two pages of the same dashboard: the JSON feed has the latest months with
// exact times; the Ranking history page goes back to 2021.
const FEED = "https://status.search.google.com/incidents.json";
const HISTORY =
  "https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history?hl=en";
const KEY = "google:updates";
const MAX_AGE_MS = 20 * 60 * 60 * 1000;
const KEEP_SECONDS = 14 * 24 * 60 * 60;

type Stored = { fetchedAt: string; updates: GoogleUpdate[] };

async function readStored(): Promise<Stored | null> {
  try {
    const raw = await env.KV.get(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

async function readSource(
  url: string,
  accept: string,
): Promise<Response | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { accept },
    });
    return response.ok ? response : null;
  } catch (error) {
    console.error("[google-updates] could not read", url, error);
    return null;
  }
}

/** Reads the dashboard now and stores it. Returns null when it is down, so the
 *  previous copy keeps being used. */
export async function refreshGoogleUpdates(): Promise<GoogleUpdate[] | null> {
  const [feed, history] = await Promise.all([
    readSource(FEED, "application/json"),
    readSource(HISTORY, "text/html"),
  ]);
  if (!feed && !history) return null;
  try {
    const recent = feed ? parseIncidents(await feed.json()) : [];
    const older = history ? parseHistory(await history.text()) : [];
    const updates = mergeUpdates(recent, older);
    // An empty result from a changed page must not wipe a good copy.
    if (updates.length === 0) return null;
    const stored: Stored = { fetchedAt: new Date().toISOString(), updates };
    await env.KV.put(KEY, JSON.stringify(stored), {
      expirationTtl: KEEP_SECONDS,
    });
    return updates;
  } catch (error) {
    console.error("[google-updates] refresh failed", error);
    return null;
  }
}

/** The known ranking updates, refreshed when the copy is a day old. */
export async function getGoogleUpdates(): Promise<GoogleUpdate[]> {
  const stored = await readStored();
  const fresh =
    stored && Date.now() - Date.parse(stored.fetchedAt) < MAX_AGE_MS;
  if (stored && fresh) return stored.updates;
  return (await refreshGoogleUpdates()) ?? stored?.updates ?? [];
}
