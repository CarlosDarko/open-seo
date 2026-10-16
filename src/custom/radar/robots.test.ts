import { describe, expect, it } from "vitest";
import { parseRobots, robotsVerdict } from "@/custom/radar/robots";

const file = `
# comment
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php
Disallow: /*?s=
Disallow: /private$
Sitemap: https://x.com/sitemap.xml

User-agent: Googlebot
User-agent: Bingbot
Disallow: /nogoogle/
Crawl-delay: 5
`;

describe("robots.txt", () => {
  const robots = parseRobots(file);

  it("reads the sitemaps and the groups, sharing rules between agents", () => {
    expect(robots.sitemaps).toEqual(["https://x.com/sitemap.xml"]);
    expect(robots.groups).toHaveLength(2);
    expect(robots.groups[1].agents).toEqual(["googlebot", "bingbot"]);
    expect(robots.groups[1].crawlDelay).toBe(5);
  });

  it("uses the group of the crawler when the file names it", () => {
    expect(robotsVerdict(robots, "Googlebot", "/nogoogle/page")).toEqual({
      allowed: false,
      rule: "Disallow: /nogoogle/",
    });
    // The Googlebot group does not inherit the "*" rules.
    expect(robotsVerdict(robots, "Googlebot", "/wp-admin/x").allowed).toBe(
      true,
    );
  });

  it("applies the longest rule, Allow on ties, wildcards and the end anchor", () => {
    expect(robotsVerdict(robots, "Other", "/wp-admin/x").allowed).toBe(false);
    expect(
      robotsVerdict(robots, "Other", "/wp-admin/admin-ajax.php").allowed,
    ).toBe(true);
    expect(robotsVerdict(robots, "Other", "/blog/?s=term").allowed).toBe(false);
    expect(robotsVerdict(robots, "Other", "/private").allowed).toBe(false);
    expect(robotsVerdict(robots, "Other", "/private/ok").allowed).toBe(true);
  });

  it("allows everything when there is no file or an empty Disallow", () => {
    expect(robotsVerdict(parseRobots(""), "Googlebot", "/").allowed).toBe(true);
    expect(
      robotsVerdict(parseRobots("User-agent: *\nDisallow:"), "Googlebot", "/x")
        .allowed,
    ).toBe(true);
  });
});
