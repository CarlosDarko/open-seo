// Segmentation and extra opportunity finders for the Radar. Every website is
// different, so the page types are discovered from the site's own URL
// structure and the search intents from the wording of its queries; nothing
// is hard-coded to one site.
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";
import { isBrandQuery } from "@/custom/radar/radarAnalysis";

// ------------------------------------------------------------- segments

export type Segment = {
  label: string;
  clicks: number;
  prevClicks: number;
  impressions: number;
  prevImpressions: number;
  ctr: number;
  position: number | null;
  /** How many queries / pages fall in the segment. */
  items: number;
};

/** Groups rows with `classify` and totals each group against the previous
 *  period. Segments are sorted by clicks (impressions break ties). */
export function segmentRows(
  current: GscSearchAnalyticsRow[],
  previous: GscSearchAnalyticsRow[],
  classify: (row: GscSearchAnalyticsRow) => string,
): Segment[] {
  const map = new Map<string, Segment & { weighted: number }>();
  const slot = (label: string) => {
    const existing = map.get(label);
    if (existing) return existing;
    const created = {
      label,
      clicks: 0,
      prevClicks: 0,
      impressions: 0,
      prevImpressions: 0,
      ctr: 0,
      position: null,
      items: 0,
      weighted: 0,
    };
    map.set(label, created);
    return created;
  };
  for (const row of current) {
    const segment = slot(classify(row));
    segment.clicks += row.clicks;
    segment.impressions += row.impressions;
    segment.weighted += row.position * row.impressions;
    segment.items += 1;
  }
  for (const row of previous) {
    const segment = slot(classify(row));
    segment.prevClicks += row.clicks;
    segment.prevImpressions += row.impressions;
  }
  return [...map.values()]
    .map(({ weighted, ...segment }) => ({
      ...segment,
      ctr: segment.impressions > 0 ? segment.clicks / segment.impressions : 0,
      position: segment.impressions > 0 ? weighted / segment.impressions : null,
    }))
    .sort(
      (a, b) =>
        b.clicks - a.clicks ||
        b.impressions - a.impressions ||
        b.prevClicks - a.prevClicks,
    );
}

// ------------------------------------------------------------ page types

function pathParts(url: string): string[] {
  try {
    return new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
}

const OTHER_PAGES = "Otras páginas";

/** Page type from the URL structure: the first folder when several pages
 *  share it ("/blog/"), the home page, pages directly in the root, or other.
 *  The folders come from the site itself, so any site gets its own types. */
export function pageTypeClassifier(urls: string[]): (url: string) => string {
  const folders = new Map<string, number>();
  for (const url of urls) {
    const parts = pathParts(url);
    if (parts.length >= 2) folders.set(parts[0], (folders.get(parts[0]) ?? 0) + 1);
  }
  return (url) => {
    const parts = pathParts(url);
    if (parts.length === 0) return "Inicio";
    if (parts.length === 1) return "Páginas en la raíz";
    return (folders.get(parts[0]) ?? 0) >= 2 ? `/${parts[0]}/` : OTHER_PAGES;
  };
}

// --------------------------------------------------------------- intent

function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const QUESTION_START =
  /^(que|como|cuanto|cuanta|cuantos|cuantas|cuando|donde|adonde|por que|porque|quien|quienes|cual|cuales|puede|pueden|puedo|se puede|hay|existe|what|how|why|when|where|who|which|can|does|is)\b/;
const TRANSACTIONAL =
  /\b(comprar|compra|precio|precios|barato|baratos|oferta|ofertas|contratar|presupuesto|tarifa|tarifas|coste|costes|costo|cuanto cuesta|alquiler|venta|pedido|descuento|cupon|buy|price|cheap|hire|quote)\b/;
const COMPARISON =
  /\b(mejor|mejores|vs|versus|opiniones|comparativa|alternativa|alternativas|resenas|top|review|reviews|best)\b/;
const LOCAL = /\b(cerca de mi|cerca|near me|a domicilio)\b/;
const INFORMATIONAL =
  /\b(significado|definicion|ejemplo|ejemplos|guia|tutorial|pasos|requisitos|plazo|plazos|tipos de|diferencia|diferencias|para que sirve|que es|como se)\b/;

export function isQuestionQuery(query: string): boolean {
  return query.includes("?") || QUESTION_START.test(plain(query));
}

/** What the searcher is after, from the wording of the query. */
export function queryIntent(query: string, brand: string[]): string {
  if (isBrandQuery(query, brand)) return "Marca";
  const text = plain(query);
  if (TRANSACTIONAL.test(text)) return "Quieren comprar o contratar";
  if (COMPARISON.test(text)) return "Comparan opciones";
  if (LOCAL.test(text)) return "Búsqueda local";
  if (QUESTION_START.test(text) || INFORMATIONAL.test(text) || text.includes("?")) {
    return "Quieren informarse";
  }
  return "Otras búsquedas";
}

// ------------------------------------------------- extra opportunities

export type QuestionOpportunity = {
  query: string;
  page: string;
  position: number;
  impressions: number;
  clicks: number;
};

/** Questions people ask that you rank for on page one or two: each is a
 *  chance to add the exact question as a heading with a short answer. Needs
 *  ["query", "page"] rows. */
export function questionOpportunities(
  queryPageRows: GscSearchAnalyticsRow[],
  minImpressions: number,
  limit = 8,
): QuestionOpportunity[] {
  const best = new Map<string, QuestionOpportunity>();
  for (const row of queryPageRows) {
    const [query, page] = row.keys ?? [];
    if (!query || !page || !isQuestionQuery(query)) continue;
    if (row.position < 3.5 || row.position > 20) continue;
    const current = best.get(query);
    if (current && current.position <= row.position) continue;
    best.set(query, {
      query,
      page,
      position: row.position,
      impressions: row.impressions,
      clicks: row.clicks,
    });
  }
  return [...best.values()]
    .filter((item) => item.impressions >= minImpressions)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);
}

export type TractionPage = {
  url: string;
  impressions: number;
  clicks: number;
  position: number;
  /** The query that brings it most impressions. */
  topQuery: string | null;
};

/** Pages Google shows a lot but only far down (position beyond 20): they
 *  have the topic right and lack authority, depth or internal links. */
export function lowTractionPages(
  pageRows: GscSearchAnalyticsRow[],
  queryPageRows: GscSearchAnalyticsRow[],
  minImpressions: number,
  limit = 6,
): TractionPage[] {
  const topQuery = new Map<string, { query: string; impressions: number }>();
  for (const row of queryPageRows) {
    const [query, page] = row.keys ?? [];
    if (!query || !page) continue;
    const current = topQuery.get(page);
    if (!current || row.impressions > current.impressions) {
      topQuery.set(page, { query, impressions: row.impressions });
    }
  }
  return pageRows
    .flatMap((row) => {
      const url = row.keys?.[0];
      if (!url || row.position <= 20 || row.impressions < minImpressions * 4) {
        return [];
      }
      return [
        {
          url,
          impressions: row.impressions,
          clicks: row.clicks,
          position: row.position,
          topQuery: topQuery.get(url)?.query ?? null,
        },
      ];
    })
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);
}

export type EmergingQuery = {
  query: string;
  page: string | null;
  position: number;
  impressions: number;
};

/** Queries that show up this period and not the last one, with the page that
 *  ranks for them: topics Google starts to link you to. */
export function emergingQueries(
  queryRows: GscSearchAnalyticsRow[],
  previousQueries: Set<string>,
  pageByQuery: Map<string, string>,
  minImpressions: number,
  limit = 6,
): EmergingQuery[] {
  return queryRows
    .flatMap((row) => {
      const query = row.keys?.[0];
      if (!query || previousQueries.has(query)) return [];
      if (row.impressions < Math.max(10, minImpressions / 2)) return [];
      return [
        {
          query,
          page: pageByQuery.get(query) ?? null,
          position: row.position,
          impressions: row.impressions,
        },
      ];
    })
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);
}
