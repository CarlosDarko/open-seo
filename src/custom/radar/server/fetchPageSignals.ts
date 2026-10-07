import {
  assertUrlInSite,
  parsePageSignals,
  type PageSignals,
} from "@/custom/radar/pageSignals";

const FETCH_TIMEOUT_MS = 7000;
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
    canonical: null,
    noindex: false,
    links: [],
    wordCount: 0,
  };
}

/** Fetches one page of the user's own site and extracts its on-page signals.
 *  Never throws: a page that cannot be read comes back with `ok: false`. */
export async function fetchPageSignals(
  url: string,
  siteUrl: string,
): Promise<PageSignals> {
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
