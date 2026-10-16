import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  GscNotConnectedError,
  GscService,
} from "@/server/features/gsc/services/GscService";
import { assertUrlInSite } from "@/custom/radar/pageSignals";
import { canonicalPageKey } from "@/custom/radar/radarAnalysis";
import type { UrlInspectionResult } from "@/server/lib/gscClient";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { buildIndexReport } from "@/custom/radar/server/indexReport";

const PAGE_ROWS = 1000;
const MAX_PAGE_REQUESTS = 5;
const LIST_LIMIT = 300;
const INSPECT_LIMIT = 25;

/**
 * Compares what the sitemap lists with what Google actually shows (pages with
 * impressions in the last 3 months): the URLs that are in the sitemap but never
 * appear are candidates for "not indexed or ignored", and pages that get
 * impressions without being in the sitemap are candidates to add. Free data:
 * the sitemaps come from Search Console and from the website itself.
 */
export const getIndexReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(({ context }) => buildIndexReport(context.projectId));

export type InspectedUrl = {
  url: string;
  verdict: string | null;
  coverageState: string | null;
  indexingState: string | null;
  robotsTxtState: string | null;
  pageFetchState: string | null;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  /** Google chose a different canonical than the page declares. */
  canonicalMismatch: boolean;
  error: string | null;
  /** The answer was kept from an earlier check (no quota used). */
  cached: boolean;
};

// Google answers one URL per request, in 1-3 seconds, with a quota of about
// 2000 a day and 600 a minute per property. Asking five at a time keeps a
// batch quick; answers are kept for 12 hours so repeating a check is free.
const PARALLEL = 5;
const CACHE_SECONDS = 12 * 60 * 60;
const inspectCacheKey = (projectId: string, url: string) =>
  `radar:inspect:${projectId}:${canonicalPageKey(url)}`;

function toInspected(
  url: string,
  result: UrlInspectionResult | null,
  error: string | null,
): InspectedUrl {
  const status = result?.indexStatusResult;
  const google = status?.googleCanonical ?? null;
  const own = status?.userCanonical ?? null;
  return {
    url,
    verdict: status?.verdict ?? null,
    coverageState: status?.coverageState ?? null,
    indexingState: status?.indexingState ?? null,
    robotsTxtState: status?.robotsTxtState ?? null,
    pageFetchState: status?.pageFetchState ?? null,
    lastCrawlTime: status?.lastCrawlTime ?? null,
    googleCanonical: google,
    userCanonical: own,
    canonicalMismatch:
      Boolean(google && own) &&
      canonicalPageKey(google as string) !== canonicalPageKey(own as string),
    error,
    cached: false,
  };
}

/**
 * Asks Google how it sees up to 25 URLs of the site (URL Inspection API:
 * free): indexed or not, why, last crawl and which URL it chose as canonical.
 * The client sends them in small batches to show progress.
 */
export const inspectIndexUrls = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({
      projectId: z.string().min(1),
      urls: z.array(z.string().max(2000)).min(1).max(INSPECT_LIMIT),
    }),
  )
  .handler(async ({ data, context }): Promise<{ results: InspectedUrl[] }> => {
    const connection = await GscService.getConnection(context.projectId);
    if (!connection) throw new GscNotConnectedError(context.projectId);
    for (const url of data.urls) assertUrlInSite(url, connection.siteUrl);

    const results = new Map<string, InspectedUrl>();
    const missing: string[] = [];
    for (const url of data.urls) {
      const kept = await env.KV.get(
        inspectCacheKey(context.projectId, url),
      ).catch(() => null);
      if (kept) {
        results.set(url, {
          ...(JSON.parse(kept) as InspectedUrl),
          url,
          cached: true,
        });
      } else {
        missing.push(url);
      }
    }

    for (let start = 0; start < missing.length; start += PARALLEL) {
      const batch = missing.slice(start, start + PARALLEL);
      const answers = await Promise.all(
        batch.map(async (url) => {
          const inspected = await GscService.inspectUrls({
            projectId: context.projectId,
            urls: [url],
            languageCode: "es",
          });
          const item = inspected.results[0];
          return toInspected(url, item?.result ?? null, item?.error ?? null);
        }),
      );
      for (const answer of answers) {
        results.set(answer.url, answer);
        if (!answer.error) {
          await env.KV.put(
            inspectCacheKey(context.projectId, answer.url),
            JSON.stringify(answer),
            { expirationTtl: CACHE_SECONDS },
          ).catch(() => undefined);
        }
      }
    }
    return { results: data.urls.flatMap((url) => results.get(url) ?? []) };
  });
