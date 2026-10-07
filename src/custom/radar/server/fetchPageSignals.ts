import { env } from "cloudflare:workers";
import {
  assertUrlInSite,
  parsePageSignals,
  type PageSignals,
} from "@/custom/radar/pageSignals";

const FETCH_TIMEOUT_MS = 10_000;
// Pages that were read stay in KV for a while: opening the plan again, or the
// Panel, does not read the whole site again (and sites that throttle many
// requests at once are asked far less).
const CACHE_SECONDS = 6 * 60 * 60;
const MAX_HTML_BYTES = 1_000_000;

async function readLimited(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  while (received < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  void reader.cancel().catch(() => undefined);
  return text;
}

function failed(url: string, error: string): PageSignals {
  return {
    url,
    ok: false,
    error,
    title: null,
    metaDescription: null,
    h1: [],
    headings: [],
    canonical: null,
    noindex: false,
    links: [],
    wordCount: 0,
  };
}

/** Fetches one page of the user's own site and extracts its on-page signals.
 *  Never throws: a page that cannot be read comes back with `ok: false`. */
async function readPage(url: string, siteUrl: string): Promise<PageSignals> {
  try {
    assertUrlInSite(url, siteUrl);
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; RadarSEO/1.0)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return failed(url, `La web respondió ${response.status}`);
    // A redirect must not leave the site either.
    assertUrlInSite(response.url || url, siteUrl);
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("html")) return failed(url, "No es una página HTML");
    const html = await readLimited(response);
    return { ...parsePageSignals(html, response.url || url), url, ok: true };
  } catch (error) {
    return failed(
      url,
      error instanceof Error && error.name === "TimeoutError"
        ? "La web tardó demasiado en responder"
        : "No se pudo leer la página",
    );
  }
}

const RETRYABLE = ["La web tardó demasiado en responder", "No se pudo leer la página"];

async function cacheKey(url: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `radar:page:${hex.slice(0, 32)}`;
}

/** Reads a page of the site, from KV when it was read recently, trying once
 *  more when the first attempt timed out or failed. Never throws. */
export async function fetchPageSignals(
  url: string,
  siteUrl: string,
): Promise<PageSignals> {
  let key: string | null = null;
  try {
    key = await cacheKey(url);
    const cached = await env.KV.get(key);
    if (cached) return JSON.parse(cached) as PageSignals;
  } catch {
    // No cache: read the page.
  }
  let result = await readPage(url, siteUrl);
  if (!result.ok && RETRYABLE.includes(result.error ?? "")) {
    result = await readPage(url, siteUrl);
  }
  if (result.ok && key) {
    try {
      await env.KV.put(key, JSON.stringify(result), {
        expirationTtl: CACHE_SECONDS,
      });
    } catch {
      // The page is still returned.
    }
  }
  return result;
}
