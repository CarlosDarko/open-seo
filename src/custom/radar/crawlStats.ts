// What the crawl-and-indexing page concludes from its three sources: the
// sitemap against Search Console, Google's URL Inspection answers and the
// live measurement of the site. Pure functions, so they can be tested.

export type CrawlTab = "resumen" | "sitemap" | "google" | "servidor";

export type InspectionLike = {
  url: string;
  verdict: string | null;
  lastCrawlTime: string | null;
  canonicalMismatch: boolean;
  robotsTxtState: string | null;
  error: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export type InspectionStats = {
  total: number;
  indexed: number;
  notIndexed: number;
  canonicalMismatches: number;
  blockedByRobots: number;
  /** When Google last crawled each page, in four buckets. */
  freshness: { recent: number; medium: number; old: number; unknown: number };
  /** The pages Google has not crawled for more than 30 days, or never. */
  stale: { url: string; days: number | null }[];
};

export function inspectionStats(
  results: InspectionLike[],
  now: number = Date.now(),
): InspectionStats {
  const answered = results.filter((item) => !item.error);
  const stats: InspectionStats = {
    total: answered.length,
    indexed: 0,
    notIndexed: 0,
    canonicalMismatches: 0,
    blockedByRobots: 0,
    freshness: { recent: 0, medium: 0, old: 0, unknown: 0 },
    stale: [],
  };
  for (const item of answered) {
    if (item.verdict === "PASS") stats.indexed += 1;
    else stats.notIndexed += 1;
    if (item.canonicalMismatch) stats.canonicalMismatches += 1;
    if (item.robotsTxtState === "DISALLOWED") stats.blockedByRobots += 1;
    const crawled = item.lastCrawlTime ? Date.parse(item.lastCrawlTime) : NaN;
    if (Number.isNaN(crawled)) {
      stats.freshness.unknown += 1;
      stats.stale.push({ url: item.url, days: null });
      continue;
    }
    const days = Math.max(0, Math.floor((now - crawled) / DAY_MS));
    if (days <= 7) stats.freshness.recent += 1;
    else if (days <= 30) stats.freshness.medium += 1;
    else {
      stats.freshness.old += 1;
      stats.stale.push({ url: item.url, days });
    }
  }
  stats.stale.sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity));
  return stats;
}

export type Finding = {
  id: string;
  tone: "bad" | "warn" | "good" | "todo";
  title: string;
  detail: string;
  /** The tab that shows more about it. */
  go: CrawlTab;
};

export type FindingsInput = {
  inSitemap: number;
  unseen: number;
  notInSitemap: number;
  sitemapErrors: number;
  inspection: InspectionStats | null;
  crawl: {
    homeBlocked: boolean;
    blockedPages: number;
    slowPages: number;
    problemPages: number;
    pages: number;
    robotsFound: boolean;
  } | null;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** What to look at first, worst first. A source that has not been checked yet
 *  appears as a "todo" so the page invites to check it. */
export function buildFindings(input: FindingsInput): Finding[] {
  const out: Finding[] = [];

  if (input.inSitemap === 0) {
    out.push({
      id: "no-sitemap",
      tone: "bad",
      title: "No encuentro tu sitemap",
      detail:
        "Sin sitemap, Google descubre tus páginas solo siguiendo enlaces. Créalo y envíalo en Search Console.",
      go: "sitemap",
    });
  } else {
    const share = input.unseen / input.inSitemap;
    out.push(
      share >= 0.5
        ? {
            id: "unseen",
            tone: "bad",
            title: `La mitad de tu sitemap no aparece en Google (${input.unseen} URLs)`,
            detail:
              "Llevan 3 meses sin una sola impresión: probablemente no están indexadas o Google las ignora.",
            go: "sitemap",
          }
        : share >= 0.2
          ? {
              id: "unseen",
              tone: "warn",
              title: `${input.unseen} URLs del sitemap sin ninguna impresión`,
              detail: `Son el ${Math.round(share * 100)} % del sitemap. Revisa de qué secciones son y compruébalas con Google.`,
              go: "sitemap",
            }
          : {
              id: "unseen",
              tone: "good",
              title: "Casi todo tu sitemap aparece en Google",
              detail: `Solo ${input.unseen} de ${input.inSitemap} URLs no tienen impresiones en 3 meses.`,
              go: "sitemap",
            },
    );
  }

  if (input.sitemapErrors > 0) {
    out.push({
      id: "sitemap-errors",
      tone: "bad",
      title: `Search Console informa de ${input.sitemapErrors} ${plural(input.sitemapErrors, "error", "errores")} en tus sitemaps`,
      detail: "Google no puede leer bien alguno de los sitemaps enviados.",
      go: "sitemap",
    });
  }
  if (input.notInSitemap > 0) {
    out.push({
      id: "not-in-sitemap",
      tone: "warn",
      title: `${input.notInSitemap} ${plural(input.notInSitemap, "página con impresiones no está", "páginas con impresiones no están")} en el sitemap`,
      detail:
        "Google ya las muestra y tú no las declaras: si quieres posicionarlas, añádelas.",
      go: "sitemap",
    });
  }

  if (!input.inspection) {
    out.push({
      id: "inspect-todo",
      tone: "todo",
      title: "Aún no has comprobado cómo ve Google tus páginas clave",
      detail:
        "Pregunta a Google por tus 20 páginas con más tráfico: si están indexadas, cuándo las rastreó por última vez y si eligió otra canónica.",
      go: "google",
    });
  } else {
    const s = input.inspection;
    if (s.notIndexed > 0) {
      out.push({
        id: "not-indexed",
        tone: s.notIndexed > s.total / 2 ? "bad" : "warn",
        title: `${s.notIndexed} de ${s.total} páginas comprobadas no están indexadas`,
        detail: "Mira el motivo que da Google en cada una.",
        go: "google",
      });
    }
    if (s.stale.length > 0) {
      out.push({
        id: "stale",
        tone: "warn",
        title: `${s.stale.length} ${plural(s.stale.length, "página importante sin rastrear", "páginas importantes sin rastrear")} en más de 30 días`,
        detail:
          "Google tarda en volver a ellas: actualízalas, enlázalas desde otras páginas o pide su indexación.",
        go: "google",
      });
    }
    if (s.canonicalMismatches > 0) {
      out.push({
        id: "canonical",
        tone: "warn",
        title: `${s.canonicalMismatches} ${plural(s.canonicalMismatches, "página donde", "páginas donde")} Google eligió otra canónica`,
        detail:
          "Google considera principal otra URL distinta de la que declaras: puede que tu página no sea la que se muestra.",
        go: "google",
      });
    }
    if (s.blockedByRobots > 0) {
      out.push({
        id: "robots-google",
        tone: "bad",
        title: `${s.blockedByRobots} ${plural(s.blockedByRobots, "página bloqueada", "páginas bloqueadas")} por robots.txt`,
        detail:
          "Google no puede rastrearlas. Revisa las reglas de tu robots.txt.",
        go: "google",
      });
    }
  }

  if (!input.crawl) {
    out.push({
      id: "crawl-todo",
      tone: "todo",
      title: "Aún no has medido cómo responde tu servidor",
      detail:
        "Lee tu robots.txt y mide el tiempo de respuesta de tus 10 páginas con más clics.",
      go: "servidor",
    });
  } else {
    const c = input.crawl;
    if (c.homeBlocked) {
      out.push({
        id: "home-blocked",
        tone: "bad",
        title: "Tu robots.txt bloquea toda la web a Googlebot",
        detail: "Es la causa más grave posible: Google no puede rastrear nada.",
        go: "servidor",
      });
    } else if (c.blockedPages > 0) {
      out.push({
        id: "blocked-pages",
        tone: "bad",
        title: `${c.blockedPages} ${plural(c.blockedPages, "página clave bloqueada", "páginas clave bloqueadas")} (robots.txt o noindex)`,
        detail: "Googlebot no puede rastrearlas o no debe indexarlas.",
        go: "servidor",
      });
    }
    if (c.slowPages > 0) {
      out.push({
        id: "slow",
        tone: c.slowPages > c.pages / 2 ? "bad" : "warn",
        title: `${c.slowPages} de ${c.pages} páginas responden con lentitud`,
        detail:
          "Más de 1,5 s hasta el primer byte. Un servidor lento hace que Google rastree menos páginas.",
        go: "servidor",
      });
    }
    if (c.problemPages > 0 && c.problemPages !== c.slowPages) {
      out.push({
        id: "problems",
        tone: "warn",
        title: `${c.problemPages} ${plural(c.problemPages, "página con avisos", "páginas con avisos")} al medir el servidor`,
        detail: "Errores, redirecciones en cadena o respuestas extrañas.",
        go: "servidor",
      });
    }
    if (!c.robotsFound) {
      out.push({
        id: "no-robots",
        tone: "warn",
        title: "Tu web no tiene robots.txt",
        detail:
          "No es grave, pero es el sitio donde declarar el sitemap y bloquear zonas que no deben rastrearse.",
        go: "servidor",
      });
    }
  }

  const rank = { bad: 0, warn: 1, todo: 2, good: 3 } as const;
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}
