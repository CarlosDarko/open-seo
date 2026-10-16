// A small robots.txt reader: which rules apply to Googlebot, whether a path
// is blocked, and which sitemaps the file declares. It follows Google's
// matching: the most specific user-agent group wins; within it the longest
// matching rule wins and "Allow" beats "Disallow" on a tie; "*" matches any
// text and "$" anchors the end.

export type RobotsRule = { allow: boolean; path: string };
export type RobotsGroup = {
  agents: string[];
  rules: RobotsRule[];
  crawlDelay: number | null;
};
export type Robots = { groups: RobotsGroup[]; sitemaps: string[] };

export function parseRobots(text: string): Robots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let collectingAgents = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
    } else if (key === "user-agent") {
      // Consecutive user-agent lines share one group.
      if (!current || !collectingAgents) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      collectingAgents = true;
    } else if (current && (key === "allow" || key === "disallow")) {
      collectingAgents = false;
      // An empty "Disallow:" allows everything: it is not a rule.
      if (value) current.rules.push({ allow: key === "allow", path: value });
    } else if (current && key === "crawl-delay") {
      collectingAgents = false;
      const seconds = Number(value);
      if (Number.isFinite(seconds)) current.crawlDelay = seconds;
    }
  }
  return { groups, sitemaps };
}

/** The group a crawler obeys: its own if the file names it, else "*". */
export function groupFor(robots: Robots, agent: string): RobotsGroup | null {
  const name = agent.toLowerCase();
  return (
    robots.groups.find((group) => group.agents.includes(name)) ??
    robots.groups.find((group) => group.agents.includes("*")) ??
    null
  );
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
}

/** Whether `agent` may fetch `path`, and the rule that decided it. */
export function robotsVerdict(
  robots: Robots,
  agent: string,
  path: string,
): { allowed: boolean; rule: string | null } {
  const group = groupFor(robots, agent);
  if (!group) return { allowed: true, rule: null };
  let best: RobotsRule | null = null;
  for (const rule of group.rules) {
    if (!matches(rule.path, path)) continue;
    if (
      !best ||
      rule.path.length > best.path.length ||
      (rule.path.length === best.path.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best
    ? {
        allowed: best.allow,
        rule: `${best.allow ? "Allow" : "Disallow"}: ${best.path}`,
      }
    : { allowed: true, rule: null };
}
