import { env } from "cloudflare:workers";
import {
  evaluateAndStore,
  ruleFromRow,
} from "@/custom/radar/server/alertsEngine";
import { refreshGoogleUpdates } from "@/custom/radar/server/googleUpdatesStore";
import {
  deleteEventsOlderThan,
  listRules,
  projectsWithRules,
} from "@/custom/radar/server/radarDb";

const LAST_RUN_KEY = "radar:alerts:lastrun";
const RUN_AFTER_UTC_HOUR = 6;
const KEEP_DAYS = 180;

/**
 * Checks every project's alert rules once a day. The worker's scheduled
 * handler calls this every few minutes; a stored date makes it a single cheap
 * read except on the first call after 06:00 UTC, when Search Console already
 * has the previous days.
 */
export async function runDailyRadarAlerts(): Promise<void> {
  const now = new Date();
  if (now.getUTCHours() < RUN_AFTER_UTC_HOUR) return;
  const today = now.toISOString().slice(0, 10);
  if ((await env.KV.get(LAST_RUN_KEY)) === today) return;
  // Claim the day first so overlapping runs do not repeat the work.
  await env.KV.put(LAST_RUN_KEY, today);

  // Google's ranking updates, read once a day so they are always current.
  await refreshGoogleUpdates();

  for (const projectId of await projectsWithRules()) {
    try {
      const rules = (await listRules(projectId))
        .filter((row) => row.enabled === 1)
        .map(ruleFromRow);
      const { created } = await evaluateAndStore(projectId, rules);
      if (created > 0) {
        console.log(`[radar-alerts] ${created} new alert(s) for ${projectId}`);
      }
    } catch (error) {
      // Typically a Google connection that expired: nothing to alert about.
      console.error("[radar-alerts] project check failed", projectId, error);
    }
  }
  await deleteEventsOlderThan(
    new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  );
}
