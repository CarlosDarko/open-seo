// Reads sitemaps: the XML of a sitemap or a sitemap index, and the Sitemap:
// lines of robots.txt. Pure string handling; fetching is in server/sitemaps.ts.

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

function locOf(block: string): string | null {
  const match = /<loc>([\s\S]*?)<\/loc>/i.exec(block);
  const value = match ? decode(match[1]) : "";
  return value || null;
}

export type ParsedSitemap = {
  /** Page URLs of a regular sitemap. */
  urls: string[];
  /** Child sitemaps of a sitemap index. */
  sitemaps: string[];
};

/** Takes the <loc> of every <url> (pages) and every <sitemap> (children), so
 *  image or news entries inside a <url> are not mistaken for pages. */
export function parseSitemap(xml: string): ParsedSitemap {
  const urls: string[] = [];
  const sitemaps: string[] = [];
  for (const match of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
    const loc = locOf(
      match[1].replace(/<image:image[\s\S]*?<\/image:image>/gi, ""),
    );
    if (loc) urls.push(loc);
  }
  for (const match of xml.matchAll(/<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi)) {
    const loc = locOf(match[1]);
    if (loc) sitemaps.push(loc);
  }
  return { urls, sitemaps };
}

/** The sitemaps a robots.txt announces. */
export function parseRobotsSitemaps(robots: string): string[] {
  return [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(
    (match) => match[1],
  );
}
