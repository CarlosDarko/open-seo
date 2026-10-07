// Segmentation and extra opportunity finders for the Radar. Every website is
// different, so the page types are discovered from the site's own URL
// structure and the search intents from the wording of its queries; nothing
// is hard-coded to one site.
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";
import { isBrandQuery } from "@/custom/radar/radarAnalysis";

// ------------------------------------------------------------- segments

/** One page (or query) inside a segment, with its own figures. */
export type SegmentMember = {
  key: string;
  clicks: number;
  prevClicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
};

/** The members kept per segment (most clicks first). */
const MAX_SEGMENT_MEMBERS = 50;

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
  /** The biggest members of the segment: which pages or queries it holds. */
  members: SegmentMember[];
};

/** Groups rows with `classify` and totals each group against the previous
 *  period. Segments are sorted by clicks (impressions break ties). */
export function segmentRows(
  current: GscSearchAnalyticsRow[],
  previous: GscSearchAnalyticsRow[],
  classify: (row: GscSearchAnalyticsRow) => string,
): Segment[] {
  const map = new Map<
    string,
    Segment & { weighted: number; all: Map<string, SegmentMember> }
  >();
  const memberOf = (
    segment: { all: Map<string, SegmentMember> },
    key: string,
  ) => {
    const existing = segment.all.get(key);
    if (existing) return existing;
    const created: SegmentMember = {
      key,
      clicks: 0,
      prevClicks: 0,
      impressions: 0,
      ctr: 0,
      position: null,
    };
    segment.all.set(key, created);
    return created;
  };
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
      members: [],
      weighted: 0,
      all: new Map<string, SegmentMember>(),
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
    const member = memberOf(segment, row.keys?.[0] ?? "");
    member.clicks += row.clicks;
    member.impressions += row.impressions;
    member.ctr =
      member.impressions > 0 ? member.clicks / member.impressions : 0;
    member.position = row.position;
  }
  for (const row of previous) {
    const segment = slot(classify(row));
    segment.prevClicks += row.clicks;
    segment.prevImpressions += row.impressions;
    memberOf(segment, row.keys?.[0] ?? "").prevClicks += row.clicks;
  }
  return [...map.values()]
    .map(({ weighted, all, ...segment }) => ({
      ...segment,
      members: [...all.values()]
        .sort(
          (a, b) =>
            b.clicks - a.clicks ||
            b.prevClicks - a.prevClicks ||
            b.impressions - a.impressions,
        )
        .slice(0, MAX_SEGMENT_MEMBERS),
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

// Two-letter language codes that sites use as the first folder of the URL
// (/es/, /fr/…). Matching a known list avoids mistaking "/us/" or "/me/" for
// a language.
const LANGUAGES = new Set([
  "es",
  "en",
  "fr",
  "de",
  "it",
  "pt",
  "ca",
  "eu",
  "gl",
  "nl",
  "pl",
  "ru",
  "tr",
  "ar",
  "zh",
  "ja",
  "ko",
  "sv",
  "da",
  "no",
  "nb",
  "fi",
  "cs",
  "el",
  "he",
  "hi",
  "id",
  "ro",
  "hu",
  "uk",
  "bg",
  "hr",
  "sk",
  "sl",
  "sr",
  "lt",
  "lv",
  "et",
  "vi",
  "th",
  "ms",
  "fa",
]);

/** The language folder of a URL path ("es", "pt-br"), if it starts with one. */
function languageFolder(parts: string[]): string | null {
  const first = parts[0]?.toLowerCase();
  if (!first) return null;
  if (LANGUAGES.has(first)) return first;
  const [language, region] = first.split(/[-_]/);
  return region?.length === 2 && LANGUAGES.has(language) ? first : null;
}

/** Page parts once the language folder is removed. */
function withoutLanguage(parts: string[]): string[] {
  return languageFolder(parts) ? parts.slice(1) : parts;
}

/** Language of the pages, from the first folder of the URL. Returns the
 *  classifier and how many different languages were found; with fewer than
 *  two, a language split says nothing. */
export function languageClassifier(urls: string[]): {
  classify: (url: string) => string;
  count: number;
} {
  const found = new Set<string>();
  for (const url of urls) {
    const language = languageFolder(pathParts(url));
    if (language) found.add(language);
  }
  return {
    count: found.size,
    classify: (url) => {
      const language = languageFolder(pathParts(url));
      return language ? `/${language}/` : "Sin prefijo de idioma";
    },
  };
}

/** Folders that mean the same thing in different languages
 *  (/services/, /servicios/, /tjenester/...): they are one page type. */
const FOLDER_GROUPS: string[][] = [
  [
    "servicios",
    "servicio",
    "services",
    "service",
    "tjenester",
    "dienstleistungen",
    "dienstleistung",
    "leistungen",
    "diensten",
    "dienste",
    "servicos",
    "servizi",
    "tjanster",
  ],
  [
    "productos",
    "producto",
    "products",
    "product",
    "produkte",
    "producten",
    "produits",
    "prodotti",
    "produtos",
  ],
  ["contacto", "contact", "kontakt", "contatto", "contato"],
  [
    "sobre-nosotros",
    "nosotros",
    "about",
    "about-us",
    "over-ons",
    "uber-uns",
    "ueber-uns",
    "om-oss",
    "a-propos",
    "chi-siamo",
    "sobre-nos",
  ],
  [
    "categorias",
    "categoria",
    "category",
    "categories",
    "categorie",
    "kategorie",
    "kategorien",
    "categorias-de-producto",
  ],
  ["tienda", "shop", "store", "winkel", "laden", "boutique", "negozio", "loja"],
  [
    "precios",
    "tarifas",
    "pricing",
    "prices",
    "preise",
    "prijzen",
    "tarifs",
    "prezzi",
  ],
  [
    "casos",
    "casos-de-exito",
    "casos-de-estudio",
    "cases",
    "case-studies",
    "fallstudien",
    "referenties",
  ],
  ["recursos", "resources", "ressourcen", "ressources", "risorse"],
  ["noticias", "news", "nieuws", "nachrichten", "actualites", "notizie"],
  [
    "empleo",
    "ofertas-empleo",
    "jobs",
    "careers",
    "vacatures",
    "stellenangebote",
    "karriere",
  ],
];

const GROUP_OF = new Map<string, number>(
  FOLDER_GROUPS.flatMap((names, index) =>
    names.map((name): [string, number] => [name, index]),
  ),
);

/** The key a folder is counted under: its group, or the folder itself. */
function folderKey(folder: string): string {
  const name = plain(folder);
  const group = GROUP_OF.get(name);
  return group === undefined ? name : `#${group}`;
}

export type PageTypeMerge = {
  /** The Spanish name the merged folders are shown under. */
  label: string;
  /** The spellings found on the site that were merged into it. */
  folders: string[];
};

/** Page type from the URL structure, ignoring the language folder: the first
 *  folder when several pages share it ("/blog/"), the home page (of any
 *  language), pages directly in the root, or other. The folders come from the
 *  site itself, so any site gets its own types. Folders that are the same word
 *  in other languages are merged and shown under their Spanish name; `merged`
 *  says which ones were merged so the chart can explain it. A group found in a
 *  single spelling keeps the site's own folder name. */
export function buildPageTypes(urls: string[]): {
  classify: (url: string) => string;
  merged: PageTypeMerge[];
} {
  const counts = new Map<string, number>();
  const spellings = new Map<string, Map<string, number>>();
  for (const url of urls) {
    const parts = withoutLanguage(pathParts(url));
    if (parts.length < 2) continue;
    const key = folderKey(parts[0]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const variants = spellings.get(key) ?? new Map<string, number>();
    const spelling = parts[0].toLowerCase();
    variants.set(spelling, (variants.get(spelling) ?? 0) + 1);
    spellings.set(key, variants);
  }
  const label = new Map<string, string>();
  const merged: PageTypeMerge[] = [];
  for (const [key, variants] of spellings) {
    const best = [...variants.entries()].sort((x, y) => y[1] - x[1])[0][0];
    if (key.startsWith("#") && variants.size > 1) {
      const spanish = FOLDER_GROUPS[Number(key.slice(1))][0];
      label.set(key, `/${spanish}/`);
      merged.push({
        label: `/${spanish}/`,
        folders: [...variants.keys()].sort().map((name) => `/${name}/`),
      });
    } else {
      label.set(key, `/${best}/`);
    }
  }
  const classify = (url: string): string => {
    const parts = withoutLanguage(pathParts(url));
    if (parts.length === 0) return "Inicio";
    if (parts.length === 1) return "Páginas en la raíz";
    const key = folderKey(parts[0]);
    return (counts.get(key) ?? 0) >= 2
      ? (label.get(key) ?? `/${parts[0]}/`)
      : OTHER_PAGES;
  };
  return { classify, merged };
}

export function pageTypeClassifier(urls: string[]): (url: string) => string {
  return buildPageTypes(urls).classify;
}

// --------------------------------------------------------------- intent

function plain(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
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
const CONTENT_FOLDERS = new Set([
  "blog",
  "noticias",
  "news",
  "articulos",
  "articles",
  "guia",
  "guias",
  "guides",
  "recursos",
  "resources",
  "wiki",
  "faq",
  "preguntas",
  "ayuda",
  "help",
  "aprende",
  "learn",
  "actualidad",
  "consejos",
  "tips",
]);
const SERVICE_FOLDERS = new Set([
  "servicios",
  "servicio",
  "services",
  "service",
  "productos",
  "producto",
  "products",
  "product",
  "tienda",
  "shop",
  "store",
  "comprar",
  "precios",
  "tarifas",
  "contacto",
  "contact",
  "presupuesto",
  "reservar",
  "booking",
  "catalogo",
  "catalog",
]);

/** What kind of page a query lands on, from the first folder of its URL
 *  ("content", "service") or null when the folder says nothing. Used to place
 *  queries that carry no intent words of their own. */
export function pageKindOf(
  url: string | null | undefined,
): "content" | "service" | null {
  if (!url) return null;
  const parts = withoutLanguage(pathParts(url));
  const folder = parts[0]?.toLowerCase().split("-")[0];
  if (!folder || parts.length < 2) return null;
  const whole = parts[0].toLowerCase();
  if (CONTENT_FOLDERS.has(whole) || CONTENT_FOLDERS.has(folder))
    return "content";
  if (SERVICE_FOLDERS.has(whole) || SERVICE_FOLDERS.has(folder))
    return "service";
  return null;
}

export function queryIntent(
  query: string,
  brand: string[],
  landingPage?: string | null,
): string {
  if (isBrandQuery(query, brand)) return "Marca";
  const text = plain(query);
  if (TRANSACTIONAL.test(text)) return "Quieren comprar o contratar";
  if (COMPARISON.test(text)) return "Comparan opciones";
  if (LOCAL.test(text)) return "Búsqueda local";
  if (
    QUESTION_START.test(text) ||
    INFORMATIONAL.test(text) ||
    text.includes("?")
  ) {
    return "Quieren informarse";
  }
  // No intent words in the query: the page it lands on is the best clue.
  const kind = pageKindOf(landingPage);
  if (kind === "content") return "Quieren informarse";
  if (kind === "service") return "Quieren comprar o contratar";
  return "Sin intención clara";
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
