import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  GscNotConnectedError,
  GscService,
  isExpectedGrantFailure,
} from "@/server/features/gsc/services/GscService";
import { periodInputSchema, resolvePeriods } from "@/custom/radar/periods";
import {
  brandTokens,
  isBrandQuery,
  mergePageVariants,
  normalizeBrandTerms,
} from "@/custom/radar/radarAnalysis";
import { getBrandTerms } from "@/custom/radar/server/brandSettings";
import {
  customTopicsSchema,
  getCustomTopics,
  saveCustomTopics,
} from "@/custom/radar/server/topicSettings";
import { buildTopics } from "@/custom/radar/topics";
import { requireProjectContext } from "@/serverFunctions/middleware";

const topicsInputSchema = periodInputSchema.extend({
  projectId: z.string().min(1),
  includeBrand: z.boolean().default(false),
});

const ROW_LIMIT = 1000;

/**
 * Search queries grouped into topics, with how each topic moves between two
 * periods: clicks, impressions, position, how much of it is within reach and
 * the pages that show for it. Free Search Console data.
 */
export const getTopicsReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(topicsInputSchema)
  .handler(async ({ data, context }) => {
    const periods = resolvePeriods(data);
    const projectId = context.projectId;
    const fetchRows = (
      dimensions: ("query" | "page")[],
      period: { startDate: string; endDate: string },
    ) =>
      GscService.getPerformance({
        projectId,
        ...period,
        dimensions,
        rowLimit: ROW_LIMIT,
      });

    try {
      const [current, previous, queryPages, manualBrand, custom] =
        await Promise.all([
          fetchRows(["query"], periods.current),
          // Nothing to compare with when the period before is out of reach.
          periods.comparable
            ? fetchRows(["query"], periods.previous)
            : Promise.resolve({ rows: [], siteUrl: "" } as unknown as Awaited<
                ReturnType<typeof fetchRows>
              >),
          fetchRows(["query", "page"], periods.current),
          getBrandTerms(projectId),
          getCustomTopics(projectId),
        ]);

      const tokens =
        manualBrand.length > 0
          ? normalizeBrandTerms(manualBrand)
          : brandTokens(current.siteUrl);
      const keep = <T extends { keys?: string[] }>(rows: T[]) =>
        data.includeBrand
          ? rows
          : rows.filter((row) => !isBrandQuery(row.keys?.[0] ?? "", tokens));

      const build = buildTopics({
        current: keep(current.rows),
        previous: keep(previous.rows),
        queryPages: keep(mergePageVariants(queryPages.rows, 1)),
        custom,
      });

      return {
        connected: true as const,
        range: periods.current,
        period: {
          compare: periods.compare,
          fellBack: periods.fellBack,
          comparable: periods.comparable,
          prevStartDate: periods.previous.startDate,
          prevEndDate: periods.previous.endDate,
        },
        brand: { hasBrand: tokens.length > 0, included: data.includeBrand },
        topics: build.topics,
        othersShare: build.othersShare,
        custom,
        analysedQueries: current.rows.length,
      };
    } catch (error) {
      if (error instanceof GscNotConnectedError) {
        return { connected: false as const, reason: "none" as const };
      }
      if (isExpectedGrantFailure(error)) {
        return { connected: false as const, reason: "reconnect" as const };
      }
      throw error;
    }
  });

/** Saves the topics the user defines by hand (empty list = automatic only). */
export const saveRadarTopics = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({ projectId: z.string().min(1), topics: customTopicsSchema }),
  )
  .handler(async ({ data, context }) => ({
    topics: await saveCustomTopics(context.projectId, data.topics),
  }));
