import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  buildDiscoverReport,
  discoverInputSchema,
} from "@/custom/radar/server/discoverReport";

/**
 * Discover (and Google News, images and video) from Search Console. Discover
 * has no queries and no position: only pages, countries and dates, so this
 * report is about which content Google recommends and how that moves.
 */
export const getDiscoverReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(discoverInputSchema)
  .handler(({ data, context }) => buildDiscoverReport(context.projectId, data));
