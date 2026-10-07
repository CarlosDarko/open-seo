// Reads the on-page signals the Radar needs (title, meta description, H1,
// canonical, noindex, internal links, word count) from a page of the user's
// own site. The parsing is pure and works on a string; the network part lives
// in server/fetchPageSignals.ts.

export type PageSignals = {
  url: string;
  ok: boolean;
  error?: string;
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  /** Text of the H2 and H3 headings (first 60). */
  headings: string[];
  canonical: string | null;
  noindex: boolean;
  /** Internal links found on the page, normalized (see normalizeUrl). */
  links: string[];
  wordCount: number;
};

const MAX_LINKS = 400;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    );
}

function cleanText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function hostWithoutWww(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/** Absolute URL without fragment and without a trailing slash, or null when
 *  it is not an http(s) URL. */
export function normalizeUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    const text = url.toString();
    return text.endsWith("/") && url.pathname !== "/"
      ? text.slice(0, -1)
      : text;
  } catch {
    return null;
  }
}

function attributes(tag: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of tag.matchAll(
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    map.set(match[1].toLowerCase(), match[2] ?? match[3] ?? "");
  }
  return map;
}

export function parsePageSignals(
  html: string,
  url: string,
): Omit<PageSignals, "ok" | "error"> {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);

  let metaDescription: string | null = null;
  let noindex = false;
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const name = attrs.get("name")?.toLowerCase();
    const content = attrs.get("content");
    if (name === "description" && content !== undefined) {
      metaDescription ??= decodeEntities(content).trim();
    }
    if ((name === "robots" || name === "googlebot") && content) {
      if (/noindex/i.test(content)) noindex = true;
    }
  }

  let canonical: string | null = null;
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (attrs.get("rel")?.toLowerCase().split(/\s+/).includes("canonical")) {
      const href = attrs.get("href");
      if (href) canonical = normalizeUrl(href, url);
      break;
    }
  }

  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean);

  const headings = [...html.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)]
    .map((match) => cleanText(match[1]))
    .filter(Boolean)
    .slice(0, 60);

  const host = hostWithoutWww(new URL(url).hostname);
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attributes(match[0]).get("href");
    if (!href) continue;
    const normalized = normalizeUrl(decodeEntities(href), url);
    if (!normalized) continue;
    if (hostWithoutWww(new URL(normalized).hostname) !== host) continue;
    links.add(normalized);
    if (links.size >= MAX_LINKS) break;
  }

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const text = cleanText(/<body[\s\S]*<\/body>/i.exec(body)?.[0] ?? body);

  return {
    url,
    title: title ? cleanText(title[1]) || null : null,
    metaDescription:
      metaDescription !== null && metaDescription !== ""
        ? metaDescription
        : null,
    h1,
    headings,
    canonical,
    noindex,
    links: [...links],
    wordCount: text ? text.split(" ").length : 0,
  };
}

/** Throws unless `url` is on the Search Console property's own domain, so the
 *  server never fetches arbitrary addresses on behalf of a request. */
export function assertUrlInSite(url: string, siteUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("URL no válida");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Solo se permiten URL http o https");
  }
  const host = hostWithoutWww(parsed.hostname);
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = hostWithoutWww(siteUrl.slice("sc-domain:".length));
    if (host === domain || host.endsWith(`.${domain}`)) return;
  } else if (host === hostWithoutWww(new URL(siteUrl).hostname)) {
    return;
  }
  throw new Error("La URL no pertenece a la propiedad de Search Console");
}
