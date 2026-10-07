// Groups search queries into topics that read like a human would name them
// ("impuesto herencia", "incapacidad temporal"), with no paid API.
//
// Method: every query is reduced to its meaningful words (no accents, no
// connectors, plurals folded). The word or expression (1 to 3 words) that
// explains the biggest share of the still-unassigned impressions becomes a
// topic and takes all the queries containing it; this repeats. A more
// specific expression wins over a general word when it explains most of
// the same queries. Topics the user defines by hand go first. Queries that
// fit no topic stay as "Otros temas" instead of being forced into one.
import type { GscSearchAnalyticsRow } from "@/server/lib/gscClient";

export type CustomTopic = { name: string; terms: string[] };

export type TopicQuery = {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
};

export type Topic = {
  id: string;
  label: string;
  /** Defined by the user rather than discovered. */
  custom: boolean;
  queries: number;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  prev: { queries: number; clicks: number; impressions: number };
  /** Share of the impressions that sit in positions 4 to 20: the closer to 1,
   *  the more of the topic is within reach. */
  nearTopShare: number;
  topQueries: TopicQuery[];
  /** Frequent expressions inside the topic. */
  subtopics: { label: string; queries: number }[];
  /** Pages that show most for the topic. */
  pages: { page: string; clicks: number; impressions: number }[];
};

const STOPWORDS = new Set([
  "a",
  "al",
  "ante",
  "con",
  "de",
  "del",
  "el",
  "en",
  "es",
  "la",
  "las",
  "lo",
  "los",
  "para",
  "por",
  "sin",
  "sobre",
  "un",
  "una",
  "unos",
  "unas",
  "y",
  "o",
  "e",
  "u",
  "que",
  "se",
  "su",
  "sus",
  "mi",
  "tu",
  "me",
  "te",
  "le",
  "les",
  "nos",
  "ya",
  "mas",
  "muy",
  "hay",
  "son",
  "como",
  "cual",
  "cuales",
  "cuanto",
  "cuanta",
  "cuantos",
  "cuantas",
  "cuando",
  "donde",
  "quien",
  "quienes",
  "porque",
  "pueden",
  "puede",
  "puedo",
  "the",
  "of",
  "and",
  "for",
  "to",
  "in",
  "on",
  "with",
  "an",
  "is",
  "are",
  "how",
  "what",
  "why",
  "when",
  "where",
  "who",
  "do",
  "does",
  "can",
  "i",
  "my",
  "your",
  "els",
  "les",
  "per",
  "amb",
  "i",
  "com",
  "quan",
  "on",
  "al",
]);

// Words that describe the kind of search, not its subject: they can sit inside
// a topic ("requisitos herencia") but never be the topic on their own.
const GENERIC = new Set([
  "precio",
  "precios",
  "barato",
  "gratis",
  "online",
  "mejor",
  "mejore",
  "opinion",
  "opiniones",
  "hacer",
  "sirve",
  "tipo",
  "tipos",
  "ejemplo",
  "modelo",
  "plazo",
  "requisito",
  "cerca",
  "espana",
  "guia",
  "tutorial",
  "definicion",
  "significado",
  "paso",
  "pasos",
  "forma",
  "formas",
  "manera",
  "cuesta",
  "coste",
  "costes",
  "tiene",
  "tienen",
  "ser",
  "esta",
  "este",
  "ese",
  "esa",
  "esto",
  "eso",
  "hace",
  "dia",
  "dias",
  "ano",
  "anos",
]);

const MAX_GRAM_WORDS = 3;
const MAX_TOPICS = 24;
const SPECIFIC_SHARE = 0.6;
const LENGTH_BONUS = [1, 1, 1.35, 1.5];
const OTHERS = "Otros temas";

function plain(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Folds plurals: "impuestos" and "impuesto" are one word. */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith("iones")) {
    return `${word.slice(0, -5)}ion`;
  }
  if (word.length > 4 && word.endsWith("ces")) return `${word.slice(0, -3)}z`;
  if (
    word.length > 4 &&
    word.endsWith("es") &&
    "dlrznjy".includes(word[word.length - 3])
  ) {
    return word.slice(0, -2);
  }
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

type Token = { stem: string; surface: string };

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  for (const surface of query.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    const word = plain(surface);
    if (word.length < 2 || STOPWORDS.has(word) || /^[0-9]+$/.test(word))
      continue;
    tokens.push({ stem: stem(word), surface });
  }
  return tokens;
}

function grams(tokens: Token[]): Set<string> {
  const found = new Set<string>();
  for (let i = 0; i < tokens.length; i += 1) {
    for (let n = 1; n <= MAX_GRAM_WORDS && i + n <= tokens.length; n += 1) {
      found.add(
        tokens
          .slice(i, i + n)
          .map((token) => token.stem)
          .join(" "),
      );
    }
  }
  return found;
}

function containsWords(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

function slug(text: string): string {
  return (
    plain(text)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "tema"
  );
}

type PreparedRow = {
  row: GscSearchAnalyticsRow;
  query: string;
  plainQuery: string;
  grams: Set<string>;
};

function prepare(rows: GscSearchAnalyticsRow[]): PreparedRow[] {
  return rows.flatMap((row) => {
    const query = row.keys?.[0];
    if (!query) return [];
    const tokens = tokenize(query);
    return [
      {
        row,
        query,
        plainQuery: tokens.map((token) => token.stem).join(" "),
        grams: grams(tokens),
      },
    ];
  });
}

/** The most frequent expressions inside a topic, without repeating one
 *  that is just a longer or shorter form of another already listed. */
function distinctSubtopics(
  counts: Map<string, number>,
  own: string,
): [string, number][] {
  const picked: [string, number][] = [];
  const candidates = [...counts.entries()]
    .filter(([gram, count]) => count >= 2 && gram !== own)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  for (const [gram, count] of candidates) {
    if (
      picked.some(
        ([other]) => containsWords(other, gram) || containsWords(gram, other),
      )
    ) {
      continue;
    }
    picked.push([gram, count]);
    if (picked.length === 4) break;
  }
  return picked;
}

export type TopicBuild = {
  topics: Topic[];
  /** Share of the impressions left in "Otros temas". */
  othersShare: number;
  /** The topic id a query belongs to (or the id of "Otros temas"). */
  topicOf: (query: string) => string;
};

/** Builds the topics of `current`, measured against `previous`. `queryPages`
 *  (rows with ["query", "page"]) adds the pages that show for each topic. */
export function buildTopics(input: {
  current: GscSearchAnalyticsRow[];
  previous: GscSearchAnalyticsRow[];
  queryPages?: GscSearchAnalyticsRow[];
  custom?: CustomTopic[];
}): TopicBuild {
  const rows = prepare(input.current);
  const minSupport = Math.max(3, Math.round(rows.length * 0.004));
  // A topic needs a minimum of visibility to be worth a line: the long tail of
  // tiny groups would only add noise.
  const allImpressions = rows.reduce(
    (sum, item) => sum + item.row.impressions,
    0,
  );
  const minImpressions = Math.max(20, Math.round(allImpressions * 0.0005));

  const customTopics = (input.custom ?? [])
    .map((topic) => ({
      name: topic.name.trim(),
      terms: topic.terms
        .map((term) =>
          tokenize(term)
            .map((t) => t.stem)
            .join(" "),
        )
        .filter(Boolean),
    }))
    .filter((topic) => topic.name && topic.terms.length > 0);

  const assigned = new Array<number>(rows.length).fill(-1);
  const chosen: {
    gram: string;
    label: string;
    custom: boolean;
    name?: string;
  }[] = [];

  // 1. The user's own topics.
  customTopics.forEach((topic) => {
    const index = chosen.length;
    chosen.push({
      gram: "",
      label: topic.name,
      custom: true,
      name: topic.name,
    });
    rows.forEach((item, rowIndex) => {
      if (assigned[rowIndex] !== -1) return;
      if (topic.terms.some((term) => containsWords(item.plainQuery, term))) {
        assigned[rowIndex] = index;
      }
    });
  });

  // 2. Discovered topics.
  const members = new Map<string, number[]>();
  rows.forEach((item, rowIndex) => {
    if (assigned[rowIndex] !== -1) return;
    for (const gram of item.grams) {
      if (!gram.includes(" ") && GENERIC.has(gram)) continue;
      const list = members.get(gram) ?? [];
      list.push(rowIndex);
      members.set(gram, list);
    }
  });

  const uncovered = (gram: string) => {
    let impressions = 0;
    let count = 0;
    for (const rowIndex of members.get(gram) ?? []) {
      if (assigned[rowIndex] !== -1) continue;
      impressions += rows[rowIndex].row.impressions + 1;
      count += 1;
    }
    return { impressions, count };
  };

  const surface = new Map<string, Map<string, number>>();
  for (const item of rows) {
    for (const token of tokenize(item.query)) {
      const forms = surface.get(token.stem) ?? new Map<string, number>();
      forms.set(
        token.surface,
        (forms.get(token.surface) ?? 0) + item.row.impressions + 1,
      );
      surface.set(token.stem, forms);
    }
  }
  const labelOf = (gram: string) =>
    gram
      .split(" ")
      .map((part) => {
        const forms = surface.get(part);
        if (!forms) return part;
        return [...forms.entries()].sort((a, b) => b[1] - a[1])[0][0];
      })
      .join(" ");

  const discovered = new Set<string>();
  while (chosen.length - customTopics.length < MAX_TOPICS) {
    let best: { gram: string; score: number; impressions: number } | null =
      null;
    for (const gram of members.keys()) {
      const { impressions, count } = uncovered(gram);
      if (count < minSupport || impressions < minImpressions) continue;
      const words = gram.split(" ").length;
      const score = impressions * LENGTH_BONUS[words];
      if (!best || score > best.score) best = { gram, score, impressions };
    }
    if (!best) break;

    // A more specific expression wins when it explains most of the same queries.
    if (!best.gram.includes(" ")) {
      let specific: { gram: string; impressions: number } | null = null;
      for (const gram of members.keys()) {
        if (!gram.includes(" ") || !containsWords(gram, best.gram)) continue;
        const { impressions, count } = uncovered(gram);
        if (
          count < minSupport ||
          impressions < best.impressions * SPECIFIC_SHARE
        ) {
          continue;
        }
        if (!specific || impressions > specific.impressions) {
          specific = { gram, impressions };
        }
      }
      if (specific) best = { ...best, gram: specific.gram };
    }

    const index = chosen.length;
    const broader = [...discovered].some((gram) =>
      containsWords(gram, best.gram),
    );
    chosen.push({
      gram: best.gram,
      label: `${labelOf(best.gram)}${broader ? " (otros)" : ""}`,
      custom: false,
    });
    discovered.add(best.gram);
    for (const rowIndex of members.get(best.gram) ?? []) {
      if (assigned[rowIndex] === -1) assigned[rowIndex] = index;
    }
  }

  const othersIndex = chosen.length;
  const idOf = (index: number) =>
    index === othersIndex
      ? slug(OTHERS)
      : `${index}-${slug(chosen[index].label)}`;

  /** The topic of any query, with the same rules the topics were built with. */
  const indexOfQuery = (query: string): number => {
    const tokens = tokenize(query);
    const plainQuery = tokens.map((token) => token.stem).join(" ");
    const queryGrams = grams(tokens);
    for (let index = 0; index < chosen.length; index += 1) {
      const topic = chosen[index];
      if (topic.custom) {
        const custom = customTopics.find((entry) => entry.name === topic.name);
        if (custom?.terms.some((term) => containsWords(plainQuery, term))) {
          return index;
        }
      } else if (queryGrams.has(topic.gram)) {
        return index;
      }
    }
    return othersIndex;
  };

  // 3. Totals per topic, now and before.
  type Accumulator = {
    clicks: number;
    impressions: number;
    weighted: number;
    near: number;
    queries: TopicQuery[];
    gramCounts: Map<string, number>;
    prev: { queries: number; clicks: number; impressions: number };
    pages: Map<string, { clicks: number; impressions: number }>;
  };
  const accumulators: Accumulator[] = Array.from(
    { length: othersIndex + 1 },
    () => ({
      clicks: 0,
      impressions: 0,
      weighted: 0,
      near: 0,
      queries: [],
      gramCounts: new Map(),
      prev: { queries: 0, clicks: 0, impressions: 0 },
      pages: new Map(),
    }),
  );

  rows.forEach((item, rowIndex) => {
    const index = assigned[rowIndex] === -1 ? othersIndex : assigned[rowIndex];
    const target = accumulators[index];
    const { clicks, impressions, position } = item.row;
    target.clicks += clicks;
    target.impressions += impressions;
    target.weighted += position * impressions;
    if (position >= 3.5 && position <= 20.5) target.near += impressions;
    target.queries.push({ query: item.query, clicks, impressions, position });
    for (const gram of item.grams) {
      if (gram.includes(" ")) {
        target.gramCounts.set(gram, (target.gramCounts.get(gram) ?? 0) + 1);
      }
    }
  });
  for (const row of input.previous) {
    const query = row.keys?.[0];
    if (!query) continue;
    const target = accumulators[indexOfQuery(query)];
    target.prev.queries += 1;
    target.prev.clicks += row.clicks;
    target.prev.impressions += row.impressions;
  }
  for (const row of input.queryPages ?? []) {
    const [query, page] = row.keys ?? [];
    if (!query || !page) continue;
    const pages = accumulators[indexOfQuery(query)].pages;
    const entry = pages.get(page) ?? { clicks: 0, impressions: 0 };
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    pages.set(page, entry);
  }

  const totalImpressions = accumulators.reduce(
    (sum, a) => sum + a.impressions,
    0,
  );
  const topics: Topic[] = accumulators
    .map((acc, index): Topic | null => {
      if (acc.queries.length === 0 && acc.prev.queries === 0) return null;
      const label = index === othersIndex ? OTHERS : chosen[index].label;
      const own = index === othersIndex ? "" : chosen[index].gram;
      return {
        id: idOf(index),
        label,
        custom: index < othersIndex && chosen[index].custom,
        queries: acc.queries.length,
        clicks: acc.clicks,
        impressions: acc.impressions,
        ctr: acc.impressions > 0 ? acc.clicks / acc.impressions : 0,
        position: acc.impressions > 0 ? acc.weighted / acc.impressions : 0,
        prev: acc.prev,
        nearTopShare: acc.impressions > 0 ? acc.near / acc.impressions : 0,
        topQueries: [...acc.queries]
          .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
          .slice(0, 6),
        subtopics: distinctSubtopics(acc.gramCounts, own).map(
          ([gram, count]) => ({ label: labelOf(gram), queries: count }),
        ),
        pages: [...acc.pages.entries()]
          .map(([page, value]) => ({ page, ...value }))
          .sort((a, b) => b.impressions - a.impressions)
          .slice(0, 3),
      };
    })
    .filter((topic): topic is Topic => topic !== null)
    .sort((a, b) => {
      if (a.label === OTHERS) return 1;
      if (b.label === OTHERS) return -1;
      return b.clicks - a.clicks || b.impressions - a.impressions;
    });

  const others = topics.find((topic) => topic.label === OTHERS);
  return {
    topics,
    othersShare:
      totalImpressions > 0 && others
        ? others.impressions / totalImpressions
        : 0,
    topicOf: (query) => idOf(indexOfQuery(query)),
  };
}
