// Builds the "Plan de acción" from a Radar report: concrete tasks, each with
// the page and query involved, the numbers behind it and the steps to take.
// Tasks are grouped by kind instead of ranked against each other, because a
// lost click, a snippet fix and a cannibalization have impacts that cannot be
// compared honestly.
import {
  clicksText,
  decimal,
  integer,
  pathOf,
  percent,
  position,
  signed,
} from "@/custom/radar/format";
import type { ChangeCause, PageChange } from "@/custom/radar/radarAnalysis";
import type { getRadarReport } from "@/serverFunctions/radar";

export type RadarReport = Extract<
  Awaited<ReturnType<typeof getRadarReport>>,
  { connected: true }
>;

export type Effort = "bajo" | "medio" | "alto";

export type Stat = { label: string; value: string };

export type ActionKind =
  | "loss"
  | "snippet"
  | "push"
  | "question"
  | "cannibal"
  | "traction"
  | "emerging";

export type Action = {
  id: string;
  kind: ActionKind;
  headline: string;
  /** One line under the page title: what to do and for which query. */
  subtitle: string;
  /** The key figures, shown as chips on the card. */
  stats: Stat[];
  /** What the data says, one fact per line. */
  lines: string[];
  /** Steps that do not depend on reading the page. */
  steps: string[];
  /** Estimated clicks at stake, when it can be estimated. */
  gain: number | null;
  effort: Effort;
  page: string | null;
  query: string | null;
  /** Why a page lost clicks (losses only). */
  cause?: ChangeCause;
  /** The CTR is so far below the usual that the snippet is unlikely to be the
   *  only cause (snippets only). */
  anomaly?: boolean;
  /** Your strongest other pages: where to add an internal link from. */
  linkSources: string[];
  /** Competing pages, owner first (cannibalization only). */
  pages: { page: string; clicks: number; impressions: number; position: number }[];
};

export type ActionPlan = {
  losses: Action[];
  snippets: Action[];
  pushes: Action[];
  questions: Action[];
  cannibals: Action[];
  traction: Action[];
  emerging: Action[];
};

const MIN_LOSS_CLICKS = 2;

function queryList(row: PageChange): string | null {
  if (row.topQueries.length === 0) return null;
  const items = row.topQueries.map(
    (q) =>
      `«${q.query}» (${signed(q.clicksDelta)} clics, posición ${position(q.prevPosition)} → ${position(q.position)})`,
  );
  return `Consultas que más pesan: ${items.join("; ")}.`;
}

function lossLines(row: PageChange): string[] {
  const pos = `${position(row.prevPosition)} → ${position(row.position)}`;
  const impressions = `${integer.format(row.prevImpressions)} → ${integer.format(row.impressions)}`;
  const lines: string[] = [
    `${clicksText(row.prevClicks)} antes, ${integer.format(row.clicks)} ahora.`,
  ];
  switch (row.cause) {
    case "posicion":
      lines.push(
        `Causa probable: ha perdido posición (media ${pos}); otras páginas te han pasado por delante.`,
      );
      break;
    case "demanda":
      lines.push(
        `Causa probable: se busca menos (impresiones ${impressions}) con la posición casi igual (${pos}). Suele ser estacionalidad.`,
      );
      break;
    case "ctr": {
      const ctr = row.impressions > 0 ? row.clicks / row.impressions : 0;
      const prevCtr =
        row.prevImpressions > 0 ? row.prevClicks / row.prevImpressions : 0;
      lines.push(
        `Causa probable: tu posición (${pos}) y las impresiones (${impressions}) aguantan, pero el CTR baja de ${percent.format(prevCtr)} a ${percent.format(ctr)}: tu fragmento atrae menos o hay resultados nuevos a su alrededor.`,
      );
      break;
    }
    case "perdida":
      lines.push("Este periodo no recibe ningún clic de Google.");
      break;
    default:
      lines.push(
        `Varias cosas a la vez: posición ${pos}, impresiones ${impressions}.`,
      );
  }
  const queries = queryList(row);
  if (queries) lines.push(queries);
  return lines;
}

function lossSteps(row: PageChange): string[] {
  const topQuery = row.topQueries[0]?.query;
  const search = topQuery ? `«${topQuery}»` : "su consulta principal";
  switch (row.cause) {
    case "posicion":
      return [
        `Busca ${search} en Google (enlace de abajo) y compara tu página con las tres primeras: qué secciones, datos o formatos tienen que a ti te faltan.`,
        "Actualiza el contenido: cifras y fechas actuales, secciones que faltan, ejemplos y preguntas frecuentes.",
        "Añade enlaces internos hacia ella desde tus páginas con más tráfico.",
        "Cuando acabes: Search Console → Inspección de URL → «Solicitar indexación».",
      ];
    case "demanda":
      return [
        "Search Console → Rendimiento → Comparar con el mismo periodo del año pasado: si cae todos los años en estas fechas es estacionalidad y no hay nada roto.",
        "Si no es estacional, mira el interés del tema en Google Trends.",
        "Aprovecha para actualizar el contenido antes de la próxima temporada alta.",
      ];
    case "ctr":
      return [
        `Busca ${search} en Google y mira qué hay por encima de ti (cuadros de IA, vídeos, «Otras preguntas»).`,
        "Reescribe título y meta descripción para destacar frente a esos resultados (dato, beneficio, año).",
        "Prueba durante 2-3 semanas y vuelve a mirar el CTR.",
      ];
    case "perdida":
      return [
        "Comprueba que la URL sigue activa, sin «noindex» ni redirecciones nuevas.",
        "Inspecciónala en Search Console (Inspección de URL) para ver si Google la indexa.",
        "Si la borraste a propósito, redirígela con un 301 a la página más parecida.",
      ];
    default:
      return [
        `Busca ${search} en Google y compara tu página con las tres primeras.`,
        "Revisa título, meta descripción y contenido; actualiza lo que haya quedado antiguo.",
      ];
  }
}

export function buildActions(report: RadarReport): ActionPlan {
  const sources = report.topPages.map((page) => page.url);

  const losses: Action[] = report.pageChanges.losers
    .filter((row) => row.clicksDelta <= -MIN_LOSS_CLICKS)
    .slice(0, 3)
    .map((row) => ({
      id: `loss:${row.key}`,
      kind: "loss",
      headline: `${pathOf(row.key)} pierde ${clicksText(-row.clicksDelta)}`,
      lines: lossLines(row),
      steps: lossSteps(row),
      subtitle: `Ha perdido ${clicksText(-row.clicksDelta)} frente al periodo anterior`,
      stats: [
        {
          label: "Clics",
          value: `${integer.format(row.prevClicks)} → ${integer.format(row.clicks)}`,
        },
        {
          label: "Posición",
          value: `${position(row.prevPosition)} → ${position(row.position)}`,
        },
        {
          label: "Impresiones",
          value: `${integer.format(row.prevImpressions)} → ${integer.format(row.impressions)}`,
        },
      ],
      gain: -row.clicksDelta,
      effort: "medio",
      page: row.key,
      cause: row.cause,
      query: row.topQueries[0]?.query ?? null,
      linkSources: [],
      pages: [],
    }));

  const snippets: Action[] = report.ctrOpportunities
    .filter((item) => item.page)
    .slice(0, 5)
    .map((item) => ({
      id: `snippet:${item.query}`,
      kind: "snippet",
      headline: `Reescribe el título y la meta de ${pathOf(item.page!)} para «${item.query}»`,
      anomaly: item.ctr < item.expectedCtr * 0.15,
      lines: [
        `Posición ${decimal.format(item.position)} con ${integer.format(item.impressions)} impresiones, pero solo ${clicksText(item.clicks)} (CTR ${percent.format(item.ctr)}).`,
        `Tu sitio consigue de media ${percent.format(item.expectedCtr)} en esa posición: la diferencia son unos ${clicksText(item.potentialClicks)}.`,
        ...(item.ctr < item.expectedCtr * 0.15
          ? [
              "La diferencia es enorme: con este CTR el título y la meta rara vez son la única causa. Puede haber respuestas de IA, anuncios o vídeos delante, o que la consulta no sea realmente para esta página.",
            ]
          : []),
      ],
      steps: [],
      subtitle: `Consulta «${item.query}»: reescribe título y meta descripción`,
      stats: [
        { label: "Posición", value: decimal.format(item.position) },
        { label: "Impresiones", value: integer.format(item.impressions) },
        { label: "Clics", value: integer.format(item.clicks) },
        {
          label: "CTR",
          value: `${percent.format(item.ctr)} (habitual ${percent.format(item.expectedCtr)})`,
        },
      ],
      gain: item.potentialClicks,
      effort: "bajo",
      page: item.page,
      query: item.query,
      linkSources: [],
      pages: [],
    }));

  const pushes: Action[] = report.nearTop.slice(0, 3).map((item) => ({
    id: `push:${item.query}`,
    kind: "push",
    headline: `Sube «${item.query}» al top 3 con ${pathOf(item.page)}`,
    lines: [
      `Posición ${decimal.format(item.position)} con ${integer.format(item.impressions)} impresiones y ${clicksText(item.clicks)}.`,
      `En el top 3 tu sitio consigue de media ${percent.format(report.ctrCurve[2])} de CTR: unos ${clicksText(item.potentialClicks)} más (potencial máximo).`,
    ],
    steps: [
      `Busca «${item.query}» en Google (enlace de abajo) y mira qué cubren las tres primeras páginas que tú no cubres.`,
      "Amplía o reordena el contenido para responder mejor; añade las preguntas y subtemas que aparecen en Google.",
    ],
    subtitle: `Consulta «${item.query}»: súbela al top 3`,
    stats: [
      { label: "Posición", value: decimal.format(item.position) },
      { label: "Impresiones", value: integer.format(item.impressions) },
      { label: "Clics", value: integer.format(item.clicks) },
    ],
    gain: item.potentialClicks,
    effort: "medio",
    page: item.page,
    query: item.query,
    linkSources: sources.filter((url) => url !== item.page).slice(0, 3),
    pages: [],
  }));

  const cannibals: Action[] = report.cannibalized.slice(0, 3).map((item) => {
    const [owner, ...others] = item.pages;
    return {
      id: `cannibal:${item.query}`,
      kind: "cannibal",
      headline: `«${item.query}»: ${item.pages.length} de tus páginas compiten entre sí`,
      lines: [
        `Se reparten ${integer.format(item.totalImpressions)} impresiones y ${clicksText(item.totalClicks)}.`,
        `Página propuesta como principal: ${pathOf(owner.page)} (${clicksText(owner.clicks)}, posición ${decimal.format(owner.position)}).`,
      ],
      steps: [
        `Decide que ${pathOf(owner.page)} es la página para «${item.query}».`,
        ...others.map(
          (other) =>
            `${pathOf(other.page)}: si trata lo mismo, redirígela con un 301 a ${pathOf(owner.page)} (rescatando lo útil de su contenido); si es otra intención, cambia su título y su H1 para que no compita por «${item.query}».`,
        ),
        `Enlaza desde las secundarias a ${pathOf(owner.page)} con el texto «${item.query}», y no uses ese texto para enlazar a las secundarias.`,
      ],
      subtitle: `${item.pages.length} páginas tuyas compiten por esta consulta`,
      stats: [
        { label: "Páginas", value: String(item.pages.length) },
        { label: "Impresiones", value: integer.format(item.totalImpressions) },
        { label: "Clics", value: integer.format(item.totalClicks) },
      ],
      gain: null,
      effort: "medio",
      page: owner.page,
      query: item.query,
      linkSources: [],
      pages: item.pages,
    };
  });

  const topThree = report.ctrCurve[2];
  const questions: Action[] = report.questions.slice(0, 5).map((item) => ({
    id: `question:${item.query}`,
    kind: "question",
    headline: `Responde «${item.query}» en ${pathOf(item.page)}`,
    lines: [
      `Posición ${decimal.format(item.position)} con ${integer.format(item.impressions)} impresiones y ${clicksText(item.clicks)}.`,
      "Es una pregunta: Google suele destacar una respuesta breve sacada de una página, justo encima de los resultados.",
    ],
    steps: [
      `Pon «${item.query}» como encabezado (H2) de la página, tal cual lo escribe la gente.`,
      "Justo debajo, responde en 40-60 palabras, sin rodeos: es el formato que Google extrae.",
      "Después amplía con detalle, ejemplos y, si procede, una lista o una tabla.",
      "Si reúnes varias preguntas relacionadas, agrúpalas en una sección de preguntas frecuentes con datos estructurados FAQ.",
    ],
    subtitle: `Pregunta «${item.query}»: respóndela mejor`,
    stats: [
      { label: "Posición", value: decimal.format(item.position) },
      { label: "Impresiones", value: integer.format(item.impressions) },
      { label: "Clics", value: integer.format(item.clicks) },
    ],
    gain: Math.max(0, Math.round(item.impressions * topThree - item.clicks)) || null,
    effort: "bajo",
    page: item.page,
    query: item.query,
    linkSources: [],
    pages: [],
  }));

  const traction: Action[] = report.lowTraction.slice(0, 4).map((item) => ({
    id: `traction:${item.url}`,
    kind: "traction",
    headline: `${pathOf(item.url)} se muestra mucho pero muy abajo`,
    lines: [
      `${integer.format(item.impressions)} impresiones con posición media ${decimal.format(item.position)} y solo ${clicksText(item.clicks)}.`,
      ...(item.topQuery
        ? [`Su consulta con más impresiones: «${item.topQuery}».`]
        : []),
      "Google la considera relevante para el tema pero no la ve suficientemente buena para subirla.",
    ],
    steps: [
      item.topQuery
        ? `Busca «${item.topQuery}» en Google y compara profundidad, formato y enfoque con las tres primeras.`
        : "Busca su tema en Google y compara profundidad, formato y enfoque con las tres primeras.",
      "Amplía la página: secciones que faltan, datos propios, ejemplos y preguntas frecuentes.",
      item.topQuery
        ? `Enlázala desde 3-5 páginas con tráfico usando el texto «${item.topQuery}».`
        : "Enlázala desde 3-5 páginas con tráfico.",
      "Si no puedes mejorarla de forma realista, fusiónala con otra más fuerte y redirige con un 301.",
    ],
    subtitle: item.topQuery
      ? `Se muestra mucho pero muy abajo · «${item.topQuery}»`
      : "Se muestra mucho pero muy abajo",
    stats: [
      { label: "Posición", value: decimal.format(item.position) },
      { label: "Impresiones", value: integer.format(item.impressions) },
      { label: "Clics", value: integer.format(item.clicks) },
    ],
    gain: null,
    effort: "alto",
    page: item.url,
    query: item.topQuery,
    linkSources: sources.filter((url) => url !== item.url).slice(0, 3),
    pages: [],
  }));

  const emerging: Action[] = report.emerging.slice(0, 5).map((item) => ({
    id: `emerging:${item.query}`,
    kind: "emerging",
    headline: `«${item.query}» empieza a traerte impresiones`,
    lines: [
      `Es nueva este periodo: ${integer.format(item.impressions)} impresiones con posición ${decimal.format(item.position)}.`,
      item.page
        ? `Aparece con ${pathOf(item.page)}.`
        : "No se ha podido asociar a una página concreta.",
    ],
    steps: [
      item.page
        ? `Comprueba que ${pathOf(item.page)} responde de verdad a «${item.query}»; si no, añade una sección con ese encabezado.`
        : `Comprueba qué página debería responder a «${item.query}» y refuérzala.`,
      "Si no tienes contenido sobre esto y el volumen sigue creciendo, crea una página propia y enlázala desde las relacionadas.",
    ],
    subtitle: `Consulta nueva «${item.query}»`,
    stats: [
      { label: "Posición", value: decimal.format(item.position) },
      { label: "Impresiones", value: integer.format(item.impressions) },
    ],
    gain: null,
    effort: "bajo",
    page: item.page,
    query: item.query,
    linkSources: [],
    pages: [],
  }));

  return { losses, snippets, pushes, questions, cannibals, traction, emerging };
}

/** Every URL whose on-page signals the plan needs, without repeats. */
export function signalUrls(plan: ActionPlan): string[] {
  const urls = new Set<string>();
  for (const action of [
    ...plan.losses,
    ...plan.emerging,
    ...plan.snippets,
    ...plan.pushes,
    ...plan.questions,
    ...plan.cannibals,
    ...plan.traction,
  ]) {
    if (action.kind === "cannibal") {
      for (const page of action.pages.slice(0, 2)) urls.add(page.page);
    } else if (action.page) {
      urls.add(action.page);
    }
    for (const source of action.linkSources) urls.add(source);
  }
  return [...urls].slice(0, 32);
}
