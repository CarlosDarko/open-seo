import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { assertUrlInSite } from "@/custom/radar/pageSignals";
import {
  canonicalPageKey,
  mergePageVariants,
} from "@/custom/radar/radarAnalysis";
import { pageTypeClassifier } from "@/custom/radar/radarSegments";
import {
  collectSitemapUrls,
  listGscSitemaps,
} from "@/custom/radar/server/sitemaps";
import type { UrlInspectionResult } from "@/server/lib/gscClient";
import { requireProjectContext } from "@/serverFunctions/middleware";

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
  .handler(async ({ context }) => {
    const projectId = context.projectId;
    try {
      const connection = await GscService.getConnection(projectId);
      if (!connection) throw new GscNotConnectedError(projectId);

      const sitemaps = await listGscSitemaps({
        siteUrl: connection.siteUrl,
        userId: connection.connectedByUserId,
        accountId: connection.gscAccountId ?? undefined,
      }).catch(() => []);
      const roots = sitemaps
        .filter((item) => !item.pending)
        .map((item) => item.path);

      const pageRows = [];
      for (let request = 0; request < MAX_PAGE_REQUESTS; request += 1) {
        const batch = await GscService.getPerformance({
          projectId,
          dateRange: "last_3_months",
          dimensions: ["page"],
          rowLimit: PAGE_ROWS,
          startRow: request * PAGE_ROWS,
        });
        pageRows.push(...batch.rows);
        if (batch.rows.length < PAGE_ROWS) break;
      }
      const shown = mergePageVariants(pageRows, 0);
      const shownByKey = new Map(
        shown.flatMap((row) =>
          row.keys?.[0] ? [[canonicalPageKey(row.keys[0]), row] as const] : [],
        ),
      );

      const collected = await collectSitemapUrls(connection.siteUrl, roots);
      const sitemapByKey = new Map(
        collected.urls.map((url) => [canonicalPageKey(url), url] as const),
      );

      const classify = pageTypeClassifier(collected.urls);
      const sections = new Map<string, { inSitemap: number; unseen: number }>();
      const unseen: { url: string; section: string }[] = [];
      for (const [key, url] of sitemapByKey) {
        const section = classify(url);
        const entry = sections.get(section) ?? { inSitemap: 0, unseen: 0 };
        entry.inSitemap += 1;
        if (!shownByKey.has(key)) {
          entry.unseen += 1;
          unseen.push({ url, section });
        }
        sections.set(section, entry);
      }

      const notInSitemap =
        sitemapByKey.size === 0
          ? []
          : shown
              .flatMap((row) => {
                const url = row.keys?.[0];
                if (!url || sitemapByKey.has(canonicalPageKey(url))) return [];
                return [
                  { url, impressions: row.impressions, clicks: row.clicks },
                ];
              })
              .sort((a, b) => b.impressions - a.impressions);

      console.log(
        "[radar-index] ok",
        JSON.stringify({
          sitemaps: sitemaps.length,
          sitemapUrls: sitemapByKey.size,
          pages: shownByKey.size,
          files: collected.files,
          failed: collected.failed.length,
        }),
      );
      return {
        connected: true as const,
        siteUrl: connection.siteUrl,
        sitemaps,
        read: {
          files: collected.files,
          truncated: collected.truncated,
          failed: collected.failed,
        },
        counts: {
          inSitemap: sitemapByKey.size,
          pagesWithImpressions: shownByKey.size,
          unseen: unseen.length,
          notInSitemap: notInSitemap.length,
        },
        unseen: unseen.slice(0, LIST_LIMIT),
        notInSitemap: notInSitemap.slice(0, 100),
        sections: [...sections.entries()]
          .map(([label, value]) => ({ label, ...value }))
          .sort((a, b) => b.inSitemap - a.inSitemap),
        topPages: [...shown]
          .sort((a, b) => b.clicks - a.clicks)
          .slice(0, 20)
          .flatMap((row) => (row.keys?.[0] ? [row.keys[0]] : [])),
      };
    } catch (error) {
      if (error instanceof GscNotConnectedError) {
        return { connected: false as const, reason: "none" as const };
      }
      if (isExpectedGrantFailure(error)) {
        return { connected: false as const, reason: "reconnect" as const };
      }
      console.error("[radar-index] failed", error);
      throw error;
    }
  });

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
