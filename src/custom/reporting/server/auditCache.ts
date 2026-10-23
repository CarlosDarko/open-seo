import { env } from "cloudflare:workers";
import type { AuditPage } from "@/custom/reporting/types";

// Microaudit limits audits per IP and per day, and an audit takes a minute. So
// every audit is also kept per project (by page URL): a new report reuses a
// recent one instead of asking again, and when Microaudit is not available the
// last audit of that page still fills the report. KV, 60 days.
const keyFor = (projectId: string) => `report:audit-cache:${projectId}`;
const MAX_ENTRIES = 60;
const TTL_SECONDS = 60 * 24 * 60 * 60;

type Cache = Record<string, AuditPage>;

async function read(projectId: string): Promise<Cache> {
  try {
    const raw = await env.KV.get(keyFor(projectId));
    return raw ? (JSON.parse(raw) as Cache) : {};
  } catch {
    return {};
  }
}

/** The audits stored in the project's other reports count too: they are the
 *  same audits, and they cover the time before this cache existed. */
async function fromReports(projectId: string): Promise<Cache> {
  const found: Cache = {};
  try {
    const rows = await env.DB.prepare(
      `SELECT snapshot_json FROM client_reports WHERE project_id = ? ORDER BY updated_at DESC LIMIT 6`,
    )
      .bind(projectId)
      .all<{ snapshot_json: string }>();
    for (const row of rows.results ?? []) {
      const snapshot = JSON.parse(row.snapshot_json) as {
        audits?: AuditPage[];
      };
      for (const audit of snapshot.audits ?? []) {
        const known = found[audit.url];
        if (!known || audit.checkedAt > known.checkedAt)
          found[audit.url] = audit;
      }
    }
  } catch {
    // The cache alone is enough.
  }
  return found;
}

export async function cacheAudit(
  projectId: string,
  audit: AuditPage,
): Promise<void> {
  const cache = await read(projectId);
  cache[audit.url] = audit;
  const kept = Object.entries(cache)
    .sort((a, b) => b[1].checkedAt.localeCompare(a[1].checkedAt))
    .slice(0, MAX_ENTRIES);
  await env.KV.put(
    keyFor(projectId),
    JSON.stringify(Object.fromEntries(kept)),
    {
      expirationTtl: TTL_SECONDS,
    },
  );
}

/** The saved audits of these pages that are not older than `maxAgeHours`,
 *  labelled with the page type they have now. */
export async function cachedAudits(
  projectId: string,
  types: { name: string; urls: string[] }[],
  maxAgeHours: number,
): Promise<AuditPage[]> {
  const cache = await read(projectId);
  for (const [url, audit] of Object.entries(await fromReports(projectId))) {
    const known = cache[url];
    if (!known || audit.checkedAt > known.checkedAt) cache[url] = audit;
  }
  const limit = Date.now() - maxAgeHours * 3_600_000;
  const found: AuditPage[] = [];
  for (const type of types) {
    for (const url of type.urls) {
      const hit = cache[url];
      // Audits saved in the first, shorter format (no "passed" counts) lack
      // the detail the report shows: they are asked again.
      const complete = hit?.version === 2;
      if (hit && complete && Date.parse(hit.checkedAt) >= limit) {
        found.push({ ...hit, type: type.name });
      }
    }
  }
  return found;
}
