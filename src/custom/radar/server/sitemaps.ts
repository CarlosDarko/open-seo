import { getGoogleAccessToken } from "@/server/features/google/googleOAuth";
import { GSC_OAUTH_PROVIDER_ID } from "@/shared/gsc";
import { assertUrlInSite } from "@/custom/radar/pageSignals";
import { parseRobotsSitemaps, parseSitemap } from "@/custom/radar/sitemap";

const GSC_API_BASE = "https://www.googleapis.com/webmasters/v3";
const FETCH_TIMEOUT_MS = 8000;
const MAX_FILES = 12;
const MAX_URLS = 5000;
const MAX_BYTES = 5_000_000;
const MAX_DEPTH = 2;

export type GscSitemap = {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  isIndex: boolean;
  pending: boolean;
  errors: number;
  warnings: number;
  /** URLs submitted by content type, as Search Console reports them. */
  submitted: number;
};

type RawSitemap = {
  path?: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isSitemapsIndex?: boolean;
  isPending?: boolean;
  errors?: string | number;
  warnings?: string | number;
  contents?: { type?: string; submitted?: string | number }[];
};

/** The sitemaps submitted in Search Console and what Google says about them. */
export async function listGscSitemaps(input: {
  siteUrl: string;
  userId: string;
  accountId?: string;
}): Promise<GscSitemap[]> {
  const token = await getGoogleAccessToken({
    providerId: GSC_OAUTH_PROVIDER_ID,
    userId: input.userId,
    accountId: input.accountId,
  });
  const response = await fetch(
    `${GSC_API_BASE}/sites/${encodeURIComponent(input.siteUrl)}/sitemaps`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return [];
  const body = (await response.json()) as { sitemap?: RawSitemap[] };
  return (body.sitemap ?? []).flatMap((item) =>
    item.path
      ? [
          {
            path: item.path,
            lastSubmitted: item.lastSubmitted ?? null,
            lastDownloaded: item.lastDownloaded ?? null,
            isIndex: Boolean(item.isSitemapsIndex),
            pending: Boolean(item.isPending),
            errors: Number(item.errors ?? 0),
            warnings: Number(item.warnings ?? 0),
            submitted: (item.contents ?? []).reduce(
              (sum, entry) => sum + Number(entry.submitted ?? 0),
              0,
            ),
          },
        ]
      : [],
  );
}

async function fetchText(url: string, siteUrl: string): Promise<string | null> {
  try {
    assertUrlInSite(url, siteUrl);
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "Mozilla/5.0 (compatible; RadarSEO/1.0)" },
    });
    if (!response.ok || !response.body) return null;
    assertUrlInSite(response.url || url, siteUrl);
    const compressed =
      url.endsWith(".gz") ||
      (response.headers.get("content-type") ?? "").includes("gzip");
    const stream = compressed
      ? response.body.pipeThrough(new DecompressionStream("gzip"))
      : response.body;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let text = "";
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
    void reader.cancel().catch(() => undefined);
    return text;
  } catch {
    return null;
  }
}

export type CollectedSitemaps = {
  urls: string[];
  files: number;
  truncated: boolean;
  /** Sitemaps that could not be read. */
  failed: string[];
};

/** Reads the URLs listed in the sitemaps: the ones submitted in Search Console,
 *  else those announced in robots.txt, else /sitemap.xml. Follows sitemap
 *  indexes two levels deep, up to a limit of files and URLs. */
export async function collectSitemapUrls(
  siteUrl: string,
  submitted: string[],
): Promise<CollectedSitemaps> {
  const origin = siteUrl.startsWith("sc-domain:")
    ? `https://${siteUrl.slice("sc-domain:".length)}`
    : new URL(siteUrl).origin;

  let roots = submitted;
  if (roots.length === 0) {
    const robots = await fetchText(`${origin}/robots.txt`, siteUrl);
    roots = robots ? parseRobotsSitemaps(robots) : [];
  }
  if (roots.length === 0) roots = [`${origin}/sitemap.xml`];

  const seen = new Set<string>();
  const urls = new Set<string>();
  const failed: string[] = [];
  let files = 0;
  let truncated = false;
  let level = roots.map((url) => ({ url, depth: 0 }));

  while (level.length > 0 && files < MAX_FILES) {
    const next: { url: string; depth: number }[] = [];
    for (const { url, depth } of level) {
      if (seen.has(url) || files >= MAX_FILES) continue;
      seen.add(url);
      files += 1;
      const xml = await fetchText(url, siteUrl);
      if (xml === null) {
        failed.push(url);
        continue;
      }
      const parsed = parseSitemap(xml);
      for (const page of parsed.urls) {
        if (urls.size >= MAX_URLS) {
          truncated = true;
          break;
        }
        urls.add(page);
      }
      if (depth < MAX_DEPTH) {
        for (const child of parsed.sitemaps)
          next.push({ url: child, depth: depth + 1 });
      }
    }
    level = next;
  }
  if (level.length > 0) truncated = true;
  return { urls: [...urls], files, truncated, failed };
}
