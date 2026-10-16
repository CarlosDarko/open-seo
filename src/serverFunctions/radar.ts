import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GscService } from "@/server/features/gsc/services/GscService";
import { periodInputSchema } from "@/custom/radar/periods";
import {
  brandTermsSchema,
  saveBrandTerms,
} from "@/custom/radar/server/brandSettings";
import { fetchPageSignals } from "@/custom/radar/server/fetchPageSignals";
import { buildRadarReport } from "@/custom/radar/server/radarReport";
import { requireProjectContext } from "@/serverFunctions/middleware";

const radarInputSchema = periodInputSchema.extend({
  projectId: z.string().min(1),
  // Brand queries ("carlos ortega") hide how the site does for everything
  // else, so they are left out of the analysis unless asked for.
  includeBrand: z.boolean().default(false),
});

/**
 * Everything the Radar, the action plan and the segment charts show, built
 * from Search Console only (free first-party data): daily trend, gains and
 * losses with their probable cause, snippets that underperform for their
 * position (against this site's own CTR curve), queries close to the top
 * three, competing pages, questions, thin-traction pages, emerging queries
 * and the segments by page type, search intent, device and brand.
 */
export const getRadarReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(radarInputSchema)
  .handler(({ data, context }) => buildRadarReport(context.projectId, data));

const signalsInputSchema = z.object({
  projectId: z.string().min(1),
  urls: z.array(z.string().max(2000)).max(32),
});

/**
 * Title, meta description, H1, canonical, noindex and internal links of pages
 * of the project's own site, read live so the Radar can say exactly what to
 * change. Only URLs on the connected Search Console property are fetched.
 */
export const getRadarPageSignals = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(signalsInputSchema)
  .handler(async ({ data, context }) => {
    const connection = await GscService.getConnection(context.projectId);
    if (!connection) return { signals: [] };
    const urls = [...new Set(data.urls)];
    return {
      signals: await Promise.all(
        urls.map((url) => fetchPageSignals(url, connection.siteUrl)),
      ),
    };
  });

/** Saves the brand words of a project (empty list = deduce from the domain). */
export const saveRadarBrand = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    z.object({ projectId: z.string().min(1), terms: brandTermsSchema }),
  )
  .handler(async ({ data, context }) => ({
    terms: await saveBrandTerms(context.projectId, data.terms),
  }));
