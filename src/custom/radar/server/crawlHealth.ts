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
import { groupFor, parseRobots, robotsVerdict } from "@/custom/radar/robots";

const PAGES = 10;
const PARALLEL = 5;
const MAX_HOPS = 3;
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 300_000;
// Our own name: pretending to be Googlebot would trip the site's firewall.
const USER_AGENT = "Mozilla/5.0 (compatible; RadarSEO/1.0; +health-check)";

export type PageHealth = {
  url: string;
  finalUrl: string;
  /** 0 when the page did not answer. */
  status: number;
  /** The redirects followed before the final answer. */
  hops: { status: number; to: string }[];
  /** Time until the first byte of the final answer. */
  ttfbMs: number | null;
  /** Time for the whole chain, redirects included, with the page downloaded. */
  totalMs: number | null;
  bytes: number | null;
  /** The page asks not to be indexed through the X-Robots-Tag header. */
  noindexHeader: boolean;
  redirectsOutside: boolean;
  /** A Googlebot rule of robots.txt blocks it. */
  blockedByRobots: boolean;
  error: string | null;
};

export type RobotsHealth = {
  /** HTTP status of /robots.txt, or null when it could not be read. */
  status: number | null;
  found: boolean;
  sitemaps: string[];
  /** The group Googlebot obeys: "googlebot", "*" or none. */
  group: "googlebot" | "*" | null;
  /** Disallow rules that apply to Googlebot (the first ones). */
  disallows: string[];
  crawlDelay: number | null;
  /** The home page is blocked for Googlebot. */
  homeBlocked: boolean;
  error: string | null;
};

export type CrawlHealth = {
  connected: true;
  origin: string;
  measuredAt: string;
  robots: RobotsHealth;
  pages: PageHealth[];
};

function originOf(siteUrl: string, sample: string | undefined): string {
  if (sample) {
    try {
      return new URL(sample).origin;
    } catch {
      // Use the property instead.
    }
  }
  if (siteUrl.startsWith("sc-domain:")) {
    return `https://${siteUrl.slice("sc-domain:".length)}`;
  }
  return new URL(siteUrl).origin;
}

async function readLimited(response: Response): Promise<number> {
  if (!response.body) return 0;
  const reader = response.body.getReader();
  let received = 0;
  while (received < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
  }
  void reader.cancel().catch(() => undefined);
  return received;
}

async function measurePage(
  url: string,
  siteUrl: string,
  isBlocked: (path: string) => boolean,
): Promise<PageHealth> {
  const base: PageHealth = {
    url,
    finalUrl: url,
    status: 0,
    hops: [],
    ttfbMs: null,
    totalMs: null,
    bytes: null,
    noindexHeader: false,
    redirectsOutside: false,
    blockedByRobots: false,
    error: null,
  };
  try {
    base.blockedByRobots = isBlocked(new URL(url).pathname);
  } catch {
    // An address that does not parse is reported by the fetch below.
  }
  const startedAt = Date.now();
  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
    const requestStart = Date.now();
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      });
    } catch (error) {
      return {
        ...base,
        finalUrl: current,
        error:
          error instanceof Error && error.name === "TimeoutError"
            ? "No respondió en 12 segundos"
            : "No se pudo conectar",
      };
    }
    const ttfb = Date.now() - requestStart;
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      void response.body?.cancel().catch(() => undefined);
      if (!location)
        return { ...base, finalUrl: current, status: response.status };
      let next: string;
      try {
        next = new URL(location, current).href;
        assertUrlInSite(next, siteUrl);
      } catch {
        return {
          ...base,
          finalUrl: current,
          status: response.status,
          redirectsOutside: true,
        };
      }
      base.hops.push({ status: response.status, to: next });
      current = next;
      continue;
    }
    const bytes = await readLimited(response);
    return {
      ...base,
      finalUrl: current,
      status: response.status,
      ttfbMs: ttfb,
      totalMs: Date.now() - startedAt,
      bytes,
      noindexHeader: /noindex/i.test(
        response.headers.get("x-robots-tag") ?? "",
      ),
    };
  }
  return {
    ...base,
    finalUrl: current,
    status: 0,
    error: "Demasiadas redirecciones",
  };
}

async function readRobots(
  origin: string,
  siteUrl: string,
): Promise<{ health: RobotsHealth; isBlocked: (path: string) => boolean }> {
  const empty: RobotsHealth = {
    status: null,
    found: false,
    sitemaps: [],
    group: null,
    disallows: [],
    crawlDelay: null,
    homeBlocked: false,
    error: null,
  };
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(8_000),
      headers: { "user-agent": USER_AGENT },
      redirect: "follow",
    });
    assertUrlInSite(response.url || `${origin}/robots.txt`, siteUrl);
    if (!response.ok) {
      return {
        health: { ...empty, status: response.status },
        isBlocked: () => false,
      };
    }
    const robots = parseRobots((await response.text()).slice(0, 200_000));
    const group = groupFor(robots, "googlebot");
    const isBlocked = (path: string) =>
      !robotsVerdict(robots, "googlebot", path).allowed;
    return {
      health: {
        status: response.status,
        found: true,
        sitemaps: robots.sitemaps,
        group: !group
          ? null
          : group.agents.includes("googlebot")
            ? "googlebot"
            : "*",
        disallows: (group?.rules ?? [])
          .filter((rule) => !rule.allow)
          .map((rule) => rule.path)
          .slice(0, 15),
        crawlDelay: group?.crawlDelay ?? null,
        homeBlocked: isBlocked("/"),
        error: null,
      },
      isBlocked,
    };
  } catch (error) {
    return {
      health: {
        ...empty,
        error:
          error instanceof Error && error.name === "TimeoutError"
            ? "robots.txt no respondió"
            : "No se pudo leer robots.txt",
      },
      isBlocked: () => false,
    };
  }
}

/**
 * Looks at the site the way a crawler first meets it: robots.txt (which rules
 * apply to Googlebot, which sitemaps it declares) and how the ten pages with
 * most clicks answer (status, redirects, response time, noindex header,
 * whether a rule blocks them). Free, and measured from Cloudflare's network,
 * so it is a reference and not Googlebot's own numbers (Search Console does
 * not offer those through its API).
 */
export async function buildCrawlHealth(projectId: string) {
  try {
    const connection = await GscService.getConnection(projectId);
    if (!connection) throw new GscNotConnectedError(projectId);

    const performance = await GscService.getPerformance({
      projectId: projectId,
      dateRange: "last_28_days",
      dimensions: ["page"],
      rowLimit: 100,
    });
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const row of [...mergePageVariants(performance.rows, 0)].sort(
      (a, b) => b.clicks - a.clicks,
    )) {
      const url = row.keys?.[0];
      if (!url || seen.has(canonicalPageKey(url))) continue;
      seen.add(canonicalPageKey(url));
      urls.push(url);
      if (urls.length === PAGES) break;
    }

    const origin = originOf(connection.siteUrl, urls[0]);
    const { health, isBlocked } = await readRobots(origin, connection.siteUrl);

    const pages: PageHealth[] = [];
    for (let start = 0; start < urls.length; start += PARALLEL) {
      const batch = urls.slice(start, start + PARALLEL);
      pages.push(
        ...(await Promise.all(
          batch.map((url) => measurePage(url, connection.siteUrl, isBlocked)),
        )),
      );
    }

    return {
      connected: true as const,
      origin,
      measuredAt: new Date().toISOString(),
      robots: health,
      pages,
    } satisfies CrawlHealth;
  } catch (error) {
    if (error instanceof GscNotConnectedError) {
      return { connected: false as const, reason: "none" as const };
    }
    if (isExpectedGrantFailure(error)) {
      return { connected: false as const, reason: "reconnect" as const };
    }
    throw error;
  }
}
