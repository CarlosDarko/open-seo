import { env } from "cloudflare:workers";
import { z } from "zod";

// The page types of a client's site (home, category, product, blog…), each
// with one to five example URLs. Reports audit these pages with Microaudit, so
// the technical section speaks about the templates of the site and not about
// a single page. Stored per project in KV.
const keyFor = (projectId: string) => `report:pagetypes:${projectId}`;

export const MAX_TYPES = 8;
export const MAX_URLS = 5;

export const pageTypesSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(40),
      urls: z.array(z.url().max(2000)).min(1).max(MAX_URLS),
    }),
  )
  .max(MAX_TYPES);

export type PageTypeSetting = z.infer<typeof pageTypesSchema>[number];

export async function getPageTypes(
  projectId: string,
): Promise<PageTypeSetting[]> {
  try {
    const raw = await env.KV.get(keyFor(projectId));
    if (!raw) return [];
    const parsed = pageTypesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function savePageTypes(
  projectId: string,
  types: PageTypeSetting[],
): Promise<PageTypeSetting[]> {
  const clean = pageTypesSchema.parse(
    types.map((type) => ({
      name: type.name.trim(),
      urls: [...new Set(type.urls.map((url) => url.trim()))],
    })),
  );
  if (clean.length === 0) await env.KV.delete(keyFor(projectId));
  else await env.KV.put(keyFor(projectId), JSON.stringify(clean));
  return clean;
}
