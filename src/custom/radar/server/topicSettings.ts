import { env } from "cloudflare:workers";
import { z } from "zod";

// Topics the user defines by hand (a name and the words that belong to it).
// They take priority over the topics discovered automatically.
const keyFor = (projectId: string) => `radar:topics:${projectId}`;

export const customTopicsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(2).max(60),
      terms: z.array(z.string().trim().min(2).max(60)).min(1).max(20),
    }),
  )
  .max(20);

export type CustomTopics = z.infer<typeof customTopicsSchema>;

export async function getCustomTopics(projectId: string): Promise<CustomTopics> {
  try {
    const raw = await env.KV.get(keyFor(projectId));
    if (!raw) return [];
    const parsed = customTopicsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function saveCustomTopics(
  projectId: string,
  topics: CustomTopics,
): Promise<CustomTopics> {
  const clean = customTopicsSchema.parse(topics);
  if (clean.length === 0) {
    await env.KV.delete(keyFor(projectId));
  } else {
    await env.KV.put(keyFor(projectId), JSON.stringify(clean));
  }
  return clean;
}
