import { env } from "cloudflare:workers";
import { z } from "zod";

// The words that identify a project's brand in search queries: the name, its
// variants and the misspellings people type ("carlos ortega", "carlosortega",
// "carlso ortega"). Stored per project in KV; when empty, the brand is
// deduced from the site's domain.
const keyFor = (projectId: string) => `radar:brand:${projectId}`;

export const brandTermsSchema = z
  .array(z.string().trim().min(3).max(60))
  .max(30);

export async function getBrandTerms(projectId: string): Promise<string[]> {
  try {
    const raw = await env.KV.get(keyFor(projectId));
    if (!raw) return [];
    const parsed = brandTermsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function saveBrandTerms(
  projectId: string,
  terms: string[],
): Promise<string[]> {
  const unique = [
    ...new Map(
      terms.map((term) => [term.trim().toLowerCase(), term.trim()]),
    ).values(),
  ];
  const clean = brandTermsSchema.parse(unique);
  if (clean.length === 0) {
    await env.KV.delete(keyFor(projectId));
  } else {
    await env.KV.put(keyFor(projectId), JSON.stringify(clean));
  }
  return clean;
}
