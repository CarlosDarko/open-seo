// The project menu, regrouped by how the work is done. OpenSEO defines the
// entries (src/client/navigation/items.ts); this file only decides where each
// one goes, so an entry OpenSEO adds in a future version that is not listed
// here lands in the collapsed "More tools" group instead of being lost.
import { getProjectNavGroups } from "@/client/navigation/items";

type UpstreamItem = ReturnType<
  typeof getProjectNavGroups
>[number]["items"][number];

export type CustomNavGroup = {
  label: string;
  items: UpstreamItem[];
  /** Starts folded; opens by itself when the current page is inside it. */
  collapsible?: boolean;
};

// Group labels are written in Spanish here: custom/i18n only translates
// OpenSEO's own files, and this one is ours.
const LAYOUT: { label: string; paths: string[]; collapsible?: boolean }[] = [
  { label: "Resumen", paths: ["/p/$projectId"] },
  {
    label: "Seguimiento",
    paths: [
      "/p/$projectId/radar",
      "/p/$projectId/alerts",
      "/p/$projectId/rank-tracking",
      "/p/$projectId/discover",
    ],
  },
  {
    label: "Mejoras",
    paths: [
      "/p/$projectId/action-plan",
      "/p/$projectId/topics",
      "/p/$projectId/indexing",
    ],
  },
  {
    label: "Investigación",
    paths: [
      "/p/$projectId/keywords",
      "/p/$projectId/saved",
      "/p/$projectId/domain",
      "/p/$projectId/backlinks",
    ],
  },
  {
    label: "Visibilidad en IA",
    paths: [
      "/p/$projectId/ai-visibility",
      "/p/$projectId/ai-visibility/research",
      "/p/$projectId/prompt-explorer",
    ],
  },
  {
    label: "Herramientas de IA",
    paths: ["/p/$projectId/reports", "/p/$projectId/context", "/ai"],
  },
  // Kept reachable but out of the way: the Radar covers what Search Console
  // Insights shows, and the site audit needs the paid Workers plan to crawl
  // more than ~40 pages (free plan: 50 subrequests per invocation).
  {
    label: "Más herramientas",
    paths: ["/p/$projectId/search-performance", "/p/$projectId/audit"],
    collapsible: true,
  },
];

export function getCustomProjectNavGroups(projectId: string): CustomNavGroup[] {
  const upstream = getProjectNavGroups(projectId).flatMap((group) => [
    ...group.items,
  ]);
  const byPath = new Map(upstream.map((item) => [item.to as string, item]));
  const placed = new Set<string>();

  const groups: CustomNavGroup[] = LAYOUT.map((entry) => ({
    label: entry.label,
    collapsible: entry.collapsible,
    items: entry.paths.flatMap((path) => {
      const item = byPath.get(path);
      if (!item) return [];
      placed.add(path);
      return [item];
    }),
  }));

  // Anything OpenSEO offers that the layout does not know goes to the end.
  const leftovers = upstream.filter((item) => !placed.has(item.to as string));
  const more = groups[groups.length - 1];
  more.items.push(...leftovers);

  return groups.filter((group) => group.items.length > 0);
}
