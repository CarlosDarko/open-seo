import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  customTopicsSchema,
  saveCustomTopics,
} from "@/custom/radar/server/topicSettings";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  buildTopicsReport,
  topicsInputSchema,
} from "@/custom/radar/server/topicsReport";

/**
 * Search queries grouped into topics, with how each topic moves between two
 * periods: clicks, impressions, position, how much of it is within reach and
 * the pages that show for it. Free Search Console data.
 */
export const getTopicsReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(topicsInputSchema)
  .handler(({ data, context }) => buildTopicsReport(context.projectId, data));

/** Saves the topics the user defines by hand (empty list = automatic only). */
export const saveRadarTopics = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({ projectId: z.string().min(1), topics: customTopicsSchema }),
  )
  .handler(async ({ data, context }) => ({
    topics: await saveCustomTopics(context.projectId, data.topics),
  }));
