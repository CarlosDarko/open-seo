import { describe, expect, it } from "vitest";
import { parseRobotsSitemaps, parseSitemap } from "@/custom/radar/sitemap";

describe("parseSitemap", () => {
  it("lists the pages of a sitemap and ignores image entries", () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url><loc>https://x.com/a/</loc><lastmod>2026-01-01</lastmod>
    <image:image><image:loc>https://x.com/a.jpg</image:loc></image:image></url>
  <url><loc><![CDATA[https://x.com/b?x=1&amp;y=2]]></loc></url>
  <url><loc> https://x.com/c </loc></url>
</urlset>`;
    expect(parseSitemap(xml)).toEqual({
      urls: ["https://x.com/a/", "https://x.com/b?x=1&y=2", "https://x.com/c"],
      sitemaps: [],
    });
  });

  it("lists the children of a sitemap index", () => {
    const xml = `<sitemapindex><sitemap><loc>https://x.com/s1.xml</loc></sitemap>
<sitemap><loc>https://x.com/s2.xml</loc><lastmod>2026</lastmod></sitemap></sitemapindex>`;
    expect(parseSitemap(xml)).toEqual({
      urls: [],
      sitemaps: ["https://x.com/s1.xml", "https://x.com/s2.xml"],
    });
  });
});

describe("parseRobotsSitemaps", () => {
  it("finds the Sitemap lines of robots.txt", () => {
    const robots =
      "User-agent: *\nDisallow: /admin\nSitemap: https://x.com/sitemap.xml\nsitemap: https://x.com/news.xml\n";
    expect(parseRobotsSitemaps(robots)).toEqual([
      "https://x.com/sitemap.xml",
      "https://x.com/news.xml",
    ]);
  });
});
