import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { buildCrawlHealth } from "@/custom/radar/server/crawlHealth";

/**
 * Looks at the site the way a crawler first meets it: robots.txt (which rules
 * apply to Googlebot, which sitemaps it declares) and how the ten pages with
 * most clicks answer (status, redirects, response time, noindex header,
 * whether a rule blocks them). Free, and measured from Cloudflare's network,
 * so it is a reference and not Googlebot's own numbers (Search Console does
 * not offer those through its API).
 */
export const getCrawlHealth = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(z.object({ projectId: z.string().min(1) }))
  .handler(({ context }) => buildCrawlHealth(context.projectId));
export type {
  CrawlHealth,
  PageHealth,
  RobotsHealth,
} from "@/custom/radar/server/crawlHealth";
