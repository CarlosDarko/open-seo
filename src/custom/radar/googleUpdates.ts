// Google's own list of ranking updates (core, spam, Discover...), published by
// the Search Status Dashboard at https://status.search.google.com. The Radar
// marks them on the charts and takes them into account when a loss may be
// explained by one.
import { z } from "zod";

export type GoogleUpdateKind =
  | "core"
  | "spam"
  | "discover"
  | "helpful"
  | "reviews"
  | "other";

export type GoogleUpdate = {
  id: string;
  kind: GoogleUpdateKind;
  /** In Spanish, with the month: "Core update (mayo de 2026)". */
  label: string;
  /** The title Google gave it. */
  title: string;
  /** First day of the rollout (YYYY-MM-DD). */
  begin: string;
  /** Last day, or null while it is still rolling out. */
  end: string | null;
  url: string;
};

export const KIND_NAME: Record<GoogleUpdateKind, string> = {
  core: "Core update",
  spam: "Update de spam",
  discover: "Update de Discover",
  helpful: "Update de contenido útil",
  reviews: "Update de reseñas",
  other: "Update de Google",
};

/** One colour per kind of update, used on the charts and in the badges. */
export const KIND_COLOR: Record<GoogleUpdateKind, string> = {
  core: "#7c3aed",
  spam: "#ea580c",
  discover: "#0d9488",
  helpful: "#0284c7",
  reviews: "#db2777",
  other: "#475569",
};

/** The short tag drawn on the charts. */
export const KIND_SHORT: Record<GoogleUpdateKind, string> = {
  core: "Core",
  spam: "Spam",
  discover: "Discover",
  helpful: "Útil",
  reviews: "Reseñas",
  other: "Update",
};

const STATUS_URL = "https://status.search.google.com";

const incidentSchema = z.object({
  id: z.string(),
  begin: z.string(),
  end: z.string().optional(),
  external_desc: z.string(),
  uri: z.string().optional(),
});

/** What kind of ranking update an incident is, or null when it is some other
 *  incident (an outage, for instance). */
function classify(title: string): GoogleUpdateKind | null {
  if (/core update/i.test(title)) return "core";
  if (/spam update/i.test(title)) return "spam";
  if (/discover update/i.test(title)) return "discover";
  if (/helpful content/i.test(title)) return "helpful";
  if (/review/i.test(title) && /update/i.test(title)) return "reviews";
  if (/update/i.test(title)) return "other";
  return null;
}

const monthYear = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Turns the dashboard's incidents.json into the ranking updates in it,
 *  newest first. Anything that does not look right is skipped. */
export function parseIncidents(raw: unknown): GoogleUpdate[] {
  if (!Array.isArray(raw)) return [];
  const updates: GoogleUpdate[] = [];
  for (const item of raw) {
    const parsed = incidentSchema.safeParse(item);
    if (!parsed.success) continue;
    const incident = parsed.data;
    const kind = classify(incident.external_desc);
    const begin = incident.begin.slice(0, 10);
    if (!kind || !/^\d{4}-\d{2}-\d{2}$/.test(begin)) continue;
    updates.push({
      id: incident.id,
      kind,
      label: `${KIND_NAME[kind]} (${monthYear.format(new Date(`${begin}T00:00:00Z`))})`,
      title: incident.external_desc,
      begin,
      end: incident.end ? incident.end.slice(0, 10) : null,
      url: incident.uri ? `${STATUS_URL}/${incident.uri}` : STATUS_URL,
    });
  }
  return updates.sort((a, b) => b.begin.localeCompare(a.begin));
}

/** The updates whose rollout overlaps the given days (YYYY-MM-DD, both
 *  included). One still rolling out counts as running until `end`. */
export function updatesBetween(
  updates: GoogleUpdate[],
  start: string,
  end: string,
): GoogleUpdate[] {
  return updates.filter(
    (update) => update.begin <= end && (update.end ?? end) >= start,
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reads the dashboard's "History" page of the Ranking product, which lists
 *  every incident since 2021 (the JSON feed only keeps the latest months).
 *  Each row has the incident link, the title, the start date ("21 May 2026")
 *  and how long it lasted ("11 days, 21 hours"). */
export function parseHistory(html: string): GoogleUpdate[] {
  const updates: GoogleUpdate[] = [];
  for (const row of html.split("<tr>").slice(1)) {
    const id = /incidents\/([A-Za-z0-9_-]+)"/.exec(row)?.[1];
    const title = /summary-text">([^<]+)</.exec(row)?.[1]?.trim();
    const dateText = /__date">([^<]+)</.exec(row)?.[1]?.trim();
    if (!id || !title || !dateText) continue;
    const kind = classify(title);
    // The page gives no time of day: assume midday, so the end date is not early.
    const start = new Date(`${dateText} 12:00:00 UTC`);
    if (!kind || Number.isNaN(start.getTime())) continue;
    const duration = /duration-text">([^<]+)</.exec(row)?.[1] ?? "";
    const days = Number(/(\d+)\s*days?/.exec(duration)?.[1] ?? 0);
    const hours = Number(/(\d+)\s*hours?/.exec(duration)?.[1] ?? 0);
    const known = /\d/.test(duration);
    const begin = start.toISOString().slice(0, 10);
    updates.push({
      id,
      kind,
      label: `${KIND_NAME[kind]} (${monthYear.format(start)})`,
      title,
      begin,
      end: known
        ? new Date(start.getTime() + days * DAY_MS + hours * 3_600_000)
            .toISOString()
            .slice(0, 10)
        : null,
      url: `${STATUS_URL}/incidents/${id}`,
    });
  }
  return updates;
}

/** Joins lists of updates; when one appears in several, the first list wins.
 *  Newest first. */
export function mergeUpdates(...lists: GoogleUpdate[][]): GoogleUpdate[] {
  const byId = new Map<string, GoogleUpdate>();
  for (const list of lists) {
    for (const update of list) {
      if (!byId.has(update.id)) byId.set(update.id, update);
    }
  }
  return [...byId.values()].sort((a, b) => b.begin.localeCompare(a.begin));
}
