// Turns the on-page signals of a URL into concrete findings for the Radar:
// what is wrong with its title, meta description and headings for the query
// it should win, and which of your strongest pages do not link to it yet.
import { normalizeUrl, type PageSignals } from "@/custom/radar/pageSignals";

export type Finding = { level: "bad" | "warn" | "ok"; text: string };

const STOPWORDS = new Set([
  "para", "como", "con", "sin", "por", "los", "las", "del", "una", "unos",
  "unas", "que", "cual", "cuales", "donde", "cuando", "the", "and", "for",
  "with", "from", "that", "this", "what", "how", "are", "your", "you",
]);

const TITLE_MAX = 60;
const TITLE_MIN = 30;
const META_MAX = 160;
const META_MIN = 70;
const THIN_WORDS = 300;

function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** The meaningful words of a query, lowercase and without accents. */
export function queryWords(query: string): string[] {
  return plain(query)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

function stem(word: string): string {
  return word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word;
}

/** Query words that do not appear in the text (plural-insensitive). */
export function missingWords(text: string | null, words: string[]): string[] {
  const haystack = plain(text ?? "");
  return words.filter((word) => !haystack.includes(stem(word)));
}

function quoted(words: string[]): string {
  return words.map((word) => `«${word}»`).join(", ");
}

function titleExample(query: string, site: string): string {
  const words = query.trim();
  const capital = words.charAt(0).toUpperCase() + words.slice(1);
  return `«${capital}: guía ${new Date().getFullYear()} | ${site}»`;
}

function siteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "tu marca";
  }
}

/** Findings for a page that should earn more clicks for `query` with its
 *  search snippet (title and meta description). */
export function snippetFindings(signals: PageSignals, query: string): Finding[] {
  if (!signals.ok) {
    return [
      {
        level: "warn",
        text: `No he podido leer la página (${signals.error ?? "error"}). Revisa su título y su meta descripción a mano.`,
      },
    ];
  }
  const words = queryWords(query);
  const findings: Finding[] = [];

  if (signals.noindex) {
    findings.push({
      level: "bad",
      text: "La página tiene «noindex»: pide a Google que no la muestre. Quítalo si debe posicionar.",
    });
  }
  if (signals.canonical && signals.canonical !== normalizeUrl(signals.url, signals.url)) {
    findings.push({
      level: "bad",
      text: `Su canónica apunta a otra URL (${signals.canonical}). Google puede estar mostrando esa en su lugar.`,
    });
  }

  const title = signals.title;
  if (!title) {
    findings.push({
      level: "bad",
      text: `No tiene etiqueta <title>. Escribe una de ≤ ${TITLE_MAX} caracteres. Ejemplo: ${titleExample(query, siteLabel(signals.url))}.`,
    });
  } else {
    const missing = missingWords(title, words);
    const problems: string[] = [];
    if (title.length > TITLE_MAX) {
      problems.push(
        `mide ${title.length} caracteres y Google lo corta hacia los ${TITLE_MAX}: pon lo importante al principio`,
      );
    }
    if (title.length < TITLE_MIN) {
      problems.push(
        `mide solo ${title.length} caracteres: añade un gancho (beneficio, año, número)`,
      );
    }
    if (missing.length > 0) {
      problems.push(`no contiene ${quoted(missing)} de la consulta`);
    }
    findings.push(
      problems.length > 0
        ? {
            level: "warn",
            text: `Título actual «${title}»: ${problems.join("; ")}. Ejemplo de estructura: ${titleExample(query, siteLabel(signals.url))}.`,
          }
        : {
            level: "ok",
            text: `Título correcto (${title.length} caracteres) y con la consulta: «${title}».`,
          },
    );
  }

  const meta = signals.metaDescription;
  if (!meta) {
    findings.push({
      level: "bad",
      text: `Sin meta descripción: Google inventa el fragmento. Escribe una de ${META_MIN}-${META_MAX} caracteres que incluya «${query}» y un motivo para hacer clic (beneficio, dato, llamada a la acción).`,
    });
  } else {
    const missing = missingWords(meta, words);
    const problems: string[] = [];
    if (meta.length > META_MAX) {
      problems.push(`mide ${meta.length} caracteres y se corta a los ${META_MAX}`);
    }
    if (meta.length < META_MIN) {
      problems.push(`mide solo ${meta.length}: aprovecha hasta ${META_MAX}`);
    }
    if (missing.length > 0) {
      problems.push(`no menciona ${quoted(missing)}`);
    }
    findings.push(
      problems.length > 0
        ? {
            level: "warn",
            text: `Meta descripción actual «${meta}»: ${problems.join("; ")}.`,
          }
        : { level: "ok", text: `Meta descripción correcta (${meta.length} caracteres).` },
    );
  }
  return findings;
}

/** Findings for a page that ranks just below the top three for `query`. */
export function pushFindings(signals: PageSignals, query: string): Finding[] {
  if (!signals.ok) return snippetFindings(signals, query);
  const words = queryWords(query);
  const findings: Finding[] = [];

  if (signals.noindex) {
    findings.push({
      level: "bad",
      text: "La página tiene «noindex»: quítalo si debe posicionar.",
    });
  }

  const h1 = signals.h1[0] ?? null;
  const h1Missing = missingWords(h1, words);
  if (!h1) {
    findings.push({
      level: "warn",
      text: `No tiene H1. Añade uno que contenga «${query}».`,
    });
  } else if (h1Missing.length > 0) {
    findings.push({
      level: "warn",
      text: `El H1 actual «${h1}» no contiene ${quoted(h1Missing)}: acércalo a lo que busca la gente.`,
    });
  } else {
    findings.push({ level: "ok", text: `El H1 contiene la consulta: «${h1}».` });
  }

  const titleMissing = missingWords(signals.title, words);
  findings.push(
    signals.title && titleMissing.length === 0
      ? { level: "ok", text: "El título contiene la consulta." }
      : {
          level: "warn",
          text: `El título ${signals.title ? `«${signals.title}» ` : ""}no contiene ${quoted(titleMissing.length ? titleMissing : words)}.`,
        },
  );

  if (signals.wordCount > 0 && signals.wordCount < THIN_WORDS) {
    findings.push({
      level: "warn",
      text: `El contenido es corto (${signals.wordCount} palabras): amplíalo con las preguntas que Google muestra en «Otras preguntas de los usuarios» para «${query}».`,
    });
  } else if (signals.wordCount >= THIN_WORDS) {
    findings.push({
      level: "ok",
      text: `Contenido de ${signals.wordCount} palabras: revisa que responda a la consulta mejor que las 3 primeras.`,
    });
  }
  return findings;
}

/** Strong pages of the site that do not link to `target` yet, with the
 *  anchor text to use: the best places to add an internal link. */
export function missingLinkSources(
  target: string,
  sources: PageSignals[],
): string[] {
  const goal = normalizeUrl(target, target);
  return sources
    .filter(
      (source) =>
        source.ok &&
        normalizeUrl(source.url, source.url) !== goal &&
        goal !== null &&
        !source.links.includes(goal),
    )
    .map((source) => source.url);
}
