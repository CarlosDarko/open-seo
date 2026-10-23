// Optional AI for client reports. The numbers and findings are always computed
// by the app; the model only interprets and writes. It runs only when the
// ANTHROPIC_API_KEY secret is set. Two models: REPORT_AI_MODEL for writing and
// REPORT_AI_MODEL_DEEP for reading pages and reasoning about them (both
// default to Sonnet). Everything comes back as a draft: nothing is saved or
// sent until the consultant reviews it, and the model is told never to invent
// figures. Every call is priced from the tokens the API reports, added to the
// report's total and recorded in the euro cost ledger.
import { recordCost } from "@/custom/costs/server/ledger";
import { fetchPageSignals } from "@/custom/radar/server/fetchPageSignals";
import {
  buildInsights,
  pathOf,
  silverLining,
  updateImpacts,
  weekdayStats,
} from "@/custom/reporting/insights";
import { parseJson } from "@/custom/reporting/jsonLoose";
import { buildVerdict } from "@/custom/reporting/narrative";
import { addAiCost } from "@/custom/reporting/server/reportingDb";
import type {
  ContentIdea,
  Diagnosis,
  OpportunityIdea,
  ReportFull,
  TitleIdea,
} from "@/custom/reporting/types";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

const DEFAULT_MODEL = "claude-sonnet-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";

/** US dollars per million tokens (Anthropic's list prices, 2026-10): the
 *  specific models first, the families after for any other version. Update
 *  when Anthropic changes its prices. */
const PRICES = [
  { match: "opus-5-5", input: 4, output: 20 },
  { match: "sonnet-5-5", input: 2, output: 10 },
  { match: "haiku-5-5", input: 0.1, output: 0.5 },
  { match: "fable", input: 10, output: 50 },
  { match: "opus", input: 5, output: 25 },
  { match: "sonnet-5", input: 2, output: 10 },
  { match: "sonnet", input: 3, output: 15 },
  { match: "haiku", input: 1, output: 5 },
] as const;

function priceOf(model: string) {
  const lower = model.toLowerCase();
  return (
    PRICES.find((price) => lower.includes(price.match)) ?? {
      input: 4,
      output: 20,
    }
  );
}

export type AiWho = { organizationId: string; userEmail: string | null };

export type AiDraft = {
  message: string;
  sectionNotes: Record<string, string>;
  nextSteps: string;
};

export async function aiStatus(): Promise<{
  available: boolean;
  model: string;
  deepModel: string;
}> {
  const key = await getOptionalEnvValue("ANTHROPIC_API_KEY");
  return {
    available: Boolean(key),
    model: (await getOptionalEnvValue("REPORT_AI_MODEL")) || DEFAULT_MODEL,
    deepModel:
      (await getOptionalEnvValue("REPORT_AI_MODEL_DEEP")) || DEFAULT_MODEL,
  };
}

type CallResult =
  | { ok: true; text: string; costEur: number; truncated: boolean }
  | { ok: false; reason: "no_key" | "failed"; detail?: string };

/** These texts need no long reasoning before they are written: the models
 *  that think first by default would spend most of the answer's length on it
 *  and the JSON would come back cut. Each model has its own way to keep that
 *  short. */
function modelOptions(model: string): Record<string, unknown> {
  const lower = model.toLowerCase();
  if (lower.includes("sonnet-5-5")) {
    return { thinking: { type: "between_tools" } };
  }
  if (lower.includes("opus-5-5") || lower.includes("opus-5")) {
    return { output_config: { effort: "low" } };
  }
  if (lower.includes("haiku-5-5")) return { thinking: { type: "disabled" } };
  return {};
}

async function callClaude(input: {
  deep: boolean;
  system: string;
  user: string;
  maxTokens: number;
  report: ReportFull;
  who: AiWho;
  kind: string;
}): Promise<CallResult> {
  const key = await getOptionalEnvValue("ANTHROPIC_API_KEY");
  if (!key) return { ok: false, reason: "no_key" };
  const status = await aiStatus();
  const model = input.deep ? status.deepModel : status.model;
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      signal: AbortSignal.timeout(120_000),
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: input.maxTokens,
        ...modelOptions(model),
        system: input.system,
        messages: [{ role: "user", content: input.user }],
      }),
    });
    if (!response.ok) {
      const reply = (await response.text().catch(() => "")).slice(0, 220);
      console.error("[report-ai] API answered", response.status, reply);
      return {
        ok: false,
        reason: "failed",
        detail: `Anthropic ha respondido ${response.status}: ${reply}`,
      };
    }
    const body = (await response.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const truncated = body.stop_reason === "max_tokens";
    if (truncated) {
      console.error("[report-ai] the answer was cut at max_tokens", input.kind);
    }
    const price = priceOf(model);
    const costUsd =
      ((body.usage?.input_tokens ?? 0) * price.input +
        (body.usage?.output_tokens ?? 0) * price.output) /
      1_000_000;
    let costEur = costUsd * 0.92;
    try {
      await recordCost({
        organizationId: input.who.organizationId,
        userEmail: input.who.userEmail,
        projectId: input.report.projectId,
        feature: "report-ai",
        endpoint: input.kind,
        costUsd,
        outcome: "ok",
      });
      // The ledger holds the exact euro figure for the day's exchange rate.
      costEur = costUsd * 0.92;
    } catch (error) {
      console.error("[report-ai] could not record the cost", error);
    }
    await addAiCost(input.report.id, costEur).catch(() => undefined);
    return {
      ok: true,
      costEur,
      truncated,
      text: (body.content ?? [])
        .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
        .join(""),
    };
  } catch (error) {
    console.error("[report-ai] failed", error);
    return { ok: false, reason: "failed" };
  }
}

const clip = (value: unknown, max: number) =>
  String(value ?? "")
    .trim()
    .slice(0, max);

/** What the project owner told OpenSEO about the business, trimmed. */
async function businessContext(projectId: string): Promise<string> {
  try {
    const context = await ProjectContextService.getProjectContext(projectId);
    return ProjectContextService.renderProjectContextMarkdown(context).slice(
      0,
      2500,
    );
  } catch {
    return "";
  }
}

const STYLE = `Estilo obligatorio: castellano claro, sencillo y profesional, propio de un informe para un cliente no técnico. NO tutees al lector y no uses "tú", "tu", "tus", "te": el sujeto es la web, el sitio, el proyecto o las páginas (por ejemplo "la web gana posiciones", "las páginas principales concentran el 60 % de los clics"). Si usas un término técnico, explícalo en pocas palabras. Sé honesto con los datos pero constructivo: si algo va mal, dilo con claridad y explica por qué es recuperable. No escribas nunca etiquetas ni frases como "en positivo" o "el lado bueno": el cliente no debe notar ninguna instrucción interna, solo un análisis serio y equilibrado. Nunca inventes cifras, causas ni contenido que no se te haya dado; si no hay base suficiente para afirmar algo, usa un tono prudente ("conviene comprobar", "posiblemente").
Lenguaje: claro, cercano y sencillo, como se lo explicarías a un cliente listo que no es técnico: frases cortas y palabras de uso diario, sin jerga ni palabras rebuscadas (nada de «reservorio», «sinergia», «apalancar», «holístico», «catalizador»...). Si hace falta un término SEO, usa el normal y explícalo en pocas palabras entre paréntesis. Cercano no es informal: el tono sigue siendo profesional.
Formato: puedes usar **negritas** para las cifras, páginas o ideas clave; ==resaltado== (se pinta en el rojo de la marca) solo para LA idea más importante del texto, una o dos veces como máximo; y listas con guion («- » al principio de la línea) cuando enumeres tres o más cosas. No uses nada más: ni cursivas, ni títulos, ni tablas, ni HTML.
Porcentajes: siempre que digas que algo «pasa de X a Y», «sube de X a Y», «baja de X a Y», «crece de X a Y» o similar, añade enseguida entre paréntesis el porcentaje de subida o bajada, por ejemplo «pasa de 1.200 a 1.500 clics (+25 %)». Usa el campo cambioPorcentual (o parecido) de los datos: ya está calculado, no lo recalcules de cabeza. Si un dato no lo trae, calcúlalo con cuidado y redondea a un decimal. Escribe los números en formato español (1.234,5).`;

// ------------------------------------------------------------- writing

const WRITE_SYSTEM = `Eres Carlos Ortega, consultor SEO con muchos años de experiencia. Redactas los textos de análisis de un informe que se entrega a un cliente. ${STYLE}
Tu trabajo es ARGUMENTAR, no describir: el cliente ya ve las tablas y las gráficas, lo que necesita de ti es entender qué ha pasado, por qué y qué hacer. En cada texto:
1. Di qué ha ocurrido con las cifras exactas de los datos (nunca redondees ni inventes).
2. Explica la causa cruzando fuentes: por ejemplo, una página que cae porque las búsquedas que la sostienen han perdido posiciones, un dispositivo que arrastra el total, el efecto de una actualización de Google en las fechas en que coincidió, una marca que crece mientras el resto se estanca. Si los datos no permiten afirmar una causa, dilo y propón cómo comprobarla.
3. Cierra con lo que implica para el negocio o con la acción concreta que recomiendas.
Los totales y las tablas INCLUYEN las búsquedas de marca (los temas no). Para distinguir cuánto viene de la marca usa los datos de la clave «marca» y di cuánto pesa en cada análisis donde importe. Cada sección debe aportar información NUEVA: no repitas en una sección las cifras ya dadas en el resumen o en otra sección, salvo que sean imprescindibles para el razonamiento. Nombra páginas y búsquedas concretas de los datos. Nada de frases hechas ("es importante", "conviene seguir trabajando") ni consejos genéricos. Párrafos cortos y claros.
Responde SOLO con un objeto JSON válido con esta forma exacta (dentro de los textos escribe los saltos de párrafo como \\n\\n, nunca con saltos de línea reales):
{"message": "RESUMEN EJECUTIVO: dos párrafos separados por una línea en blanco, de 120 a 180 palabras en total. El primero responde a «¿cómo ha ido el periodo y por qué?» con las dos o tres cifras y causas que de verdad lo explican; el segundo, a «¿qué hay que hacer ahora?» con las prioridades. Puede usar la primera persona del plural.",
 "sectionNotes": {
   "evolucion": "Análisis de la evolución del tráfico y de las actualizaciones de Google: 70 a 120 palabras.",
   "reparto": "Análisis de dónde vienen los clics (tipo de página, dispositivo, marca frente al resto, intención): 60 a 100 palabras. Si no aporta nada nuevo, cadena vacía.",
   "posiciones": "Análisis de cómo se distribuyen las búsquedas por tramo de posición y qué cambia entre periodos: 60 a 100 palabras.",
   "consultas": "Análisis de las búsquedas que más mueven el tráfico: cuáles sostienen el sitio, cuáles caen y por qué: 70 a 120 palabras.",
   "origen": "Análisis de las páginas: qué explica las que suben y las que bajan, y qué hacer con ellas: 70 a 120 palabras.",
   "temas": "Análisis de los temas con más tráfico y dónde hay margen: 50 a 90 palabras.",
   "oportunidades": "Análisis de qué oportunidades merecen priorizarse y por qué: 60 a 100 palabras.",
   "tecnico": "Análisis del estado técnico (sitemap, indexación y, si hay, la auditoría de las páginas tipo): 50 a 100 palabras."
 },
 "nextSteps": "HOJA DE RUTA: 4 o 5 acciones ESTRATÉGICAS, ordenadas de más a menos impacto frente a esfuerzo. Cada acción es un bloque; los bloques se separan con una línea en blanco (\\n\\n) y cada bloque tiene exactamente estas cuatro líneas, separadas por \\n: la primera es la acción concreta (empieza por un verbo, sin punto final); las otras empiezan por «Por qué: » (argumenta en 2 o 3 frases con las cifras de los datos y la causa), «Cómo: » (de 2 a 4 pasos concretos, separados por punto y coma) e «Impacto: » (qué resultado se espera y en qué plazo, con una cifra si es posible). Cada acción debe ser una palanca que mueva los resultados (reorientar o crear un grupo de páginas, corregir un fallo de plantilla que afecta a muchas páginas, recuperar un tema que cae, aprovechar un tramo 4-20 con mucho volumen), no un detalle menor como cambiar un título suelto, salvo que sea la palanca principal. Sin vaguedades como «seguir trabajando» o «mejorar el contenido»."}
Si una sección no tiene datos suficientes, déjala como cadena vacía.`;

/** The change in percent between two figures (one decimal), or null when
 *  there is nothing to compare with. The model is given these ready made so
 *  it never has to do the arithmetic. */
function pct(now: number, before: number | null): number | null {
  if (before === null || before <= 0) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

function brief(report: ReportFull, business: string) {
  const { snapshot } = report;
  const lines = (
    items: {
      label: string;
      clicks: number;
      prevClicks: number;
      share: number;
    }[],
  ) =>
    items.slice(0, 6).map((item) => ({
      grupo: item.label,
      clics: item.clicks,
      clicsAntes: item.prevClicks,
      cambioPorcentual: pct(item.clicks, item.prevClicks),
      porcentajeDelTotal: Math.round(item.share * 1000) / 10,
    }));
  const move = (row: {
    key: string;
    clicks: number;
    prevClicks: number;
    position: number | null;
    prevPosition: number | null;
    queries?: { query: string; clicksDelta: number }[];
  }) => ({
    clave: row.key,
    clics: row.clicks,
    clicsAntes: row.prevClicks,
    cambioPorcentual: pct(row.clicks, row.prevClicks),
    posicion: row.position,
    posicionAntes: row.prevPosition,
    busquedasQueExplican: row.queries?.slice(0, 3),
  });
  const { brand } = snapshot;
  return {
    cliente: report.clientName,
    contexto_del_negocio: business || undefined,
    web: snapshot.siteUrl,
    periodo: snapshot.range,
    comparadoCon: snapshot.period.comparable
      ? snapshot.period.compare === "year"
        ? "mismo periodo del año anterior"
        : "periodo anterior"
      : "sin comparación",
    aviso:
      "Los totales y las tablas INCLUYEN las búsquedas de marca (los temas no); la clave «marca» desglosa lo que aportan.",
    totales: snapshot.totals,
    totalesAnteriores: snapshot.prevTotals,
    cambioPorcentualTotales: {
      clics: pct(snapshot.totals.clicks, snapshot.prevTotals.clicks),
      impresiones: pct(
        snapshot.totals.impressions,
        snapshot.prevTotals.impressions,
      ),
      ctr: pct(snapshot.totals.ctr, snapshot.prevTotals.ctr),
    },
    veredicto: buildVerdict(snapshot),
    datos_favorables: silverLining(snapshot),
    reparto_de_clics: {
      tipoDePagina: lines(snapshot.segments.pageType),
      dispositivo: lines(snapshot.segments.device),
      intencion: lines(snapshot.segments.intent),
    },
    marca: brand.hasBrand
      ? {
          clics: brand.clicks,
          clicsAntes: brand.prevClicks,
          cambioPorcentualClics: pct(brand.clicks, brand.prevClicks),
          impresiones: brand.impressions,
          impresionesAntes: brand.prevImpressions,
          cambioPorcentualImpresiones: pct(
            brand.impressions,
            brand.prevImpressions,
          ),
          posicionMedia: brand.position,
          posicionMediaAntes: brand.prevPosition,
          busquedasDistintas: brand.queries,
          clicsDelResto: brand.otherClicks,
          clicsDelRestoAntes: brand.prevOtherClicks,
        }
      : undefined,
    tramos_de_posicion: snapshot.bands.map((band) => ({
      tramo: band.label,
      busquedas: band.queries,
      busquedasAntes: band.prevQueries,
      cambioPorcentualBusquedas: pct(band.queries, band.prevQueries),
      clics: band.clicks,
      clicsAntes: band.prevClicks,
      cambioPorcentualClics: pct(band.clicks, band.prevClicks),
      entranEnElTramo: band.enteredCount,
      salenDelTramo: band.leftCount,
    })),
    busquedas_principales: (snapshot.queryRows ?? [])
      .slice(0, 15)
      .map((row) => ({
        busqueda: row.query,
        esMarca: row.brand,
        clics: row.clicks,
        clicsAntes: row.prevClicks,
        cambioPorcentual: pct(row.clicks, row.prevClicks),
        impresiones: row.impressions,
        posicion: row.position,
        posicionAntes: row.prevPosition,
      })),
    busquedas_que_suben: snapshot.queryWinners.slice(0, 5).map(move),
    busquedas_que_bajan: snapshot.queryLosers.slice(0, 5).map(move),
    busquedas_nuevas: snapshot.newQueries,
    busquedas_perdidas: snapshot.lostQueries,
    paginas_principales: (snapshot.pages ?? []).slice(0, 10).map((row) => ({
      pagina: pathOf(row.url),
      clics: row.clicks,
      clicsAntes: row.prevClicks,
      cambioPorcentual: pct(row.clicks, row.prevClicks),
      posicion: row.position,
      posicionAntes: row.prevPosition,
    })),
    paginas_que_suben: snapshot.pageWinners.slice(0, 5).map(move),
    paginas_que_bajan: snapshot.pageLosers.slice(0, 5).map(move),
    actualizaciones_de_google: updateImpacts(snapshot).map((item) => ({
      nombre: item.update.label,
      lectura: item.verdict,
    })),
    dias_de_la_semana: weekdayStats(snapshot.daily).map((item) => ({
      dia: item.label,
      clicsMedios: Math.round(item.average),
    })),
    temas: snapshot.topics.slice(0, 6).map((topic) => ({
      tema: topic.label,
      clics: topic.clicks,
      clicsAntes: topic.prevClicks,
      cambioPorcentual: pct(topic.clicks, topic.prevClicks),
      posicionMedia: topic.position,
      impresionesPorPosicion: {
        top3: topic.bands?.[0] ?? 0,
        de4a10: topic.bands?.[1] ?? 0,
        de11a20: topic.bands?.[2] ?? 0,
        masDe20: topic.bands?.[3] ?? 0,
      },
    })),
    oportunidades: snapshot.opportunities.slice(0, 6).map((item) => ({
      busqueda: item.query,
      tipo: item.kind,
      posicion: item.position,
      impresiones: item.impressions,
      clicsPosibles: item.potentialClicks,
    })),
    sitemap_y_cobertura: snapshot.health ?? undefined,
    auditoria_tecnica: snapshot.audits?.length
      ? snapshot.audits.map((audit) => ({
          tipologia: audit.type,
          pagina: pathOf(audit.url),
          notaSobre100: audit.score,
          categorias: audit.categories.map((category) => ({
            nombre: category.name,
            notaSobre100: category.score,
          })),
          problemas: audit.issues.slice(0, 10).map((issue) => ({
            tipo: issue.kind === "fail" ? "a corregir" : "a mejorar",
            titulo: issue.title,
            categoria: issue.category,
            detalle: issue.detail.slice(0, 220),
          })),
        }))
      : undefined,
    discover: snapshot.discover
      ? {
          clics: snapshot.discover.clicks,
          antes: snapshot.discover.prevClicks,
          cambioPorcentual: pct(
            snapshot.discover.clicks,
            snapshot.discover.prevClicks,
          ),
        }
      : undefined,
    hallazgos_calculados: buildInsights(snapshot)
      .slice(0, 9)
      .map((item) => ({ titulo: item.title, detalle: item.body })),
  };
}

export async function draftWithAi(
  report: ReportFull,
  who: AiWho,
): Promise<
  | { ok: true; draft: AiDraft; costEur: number }
  | { ok: false; reason: "no_key" | "failed"; detail?: string }
> {
  const business = await businessContext(report.projectId);
  const answer = await callClaude({
    deep: true,
    system: WRITE_SYSTEM,
    user: `Datos del informe:\n${JSON.stringify(brief(report, business))}`,
    maxTokens: 10000,
    report,
    who,
    kind: "draft",
  });
  if (!answer.ok) return answer;
  const raw = parseJson<Partial<AiDraft>>(answer.text, "draft");
  if (!raw) {
    return {
      ok: false,
      reason: "failed",
      detail: answer.truncated
        ? "la respuesta de la IA se cortó por longitud"
        : "la respuesta de la IA no tenía el formato esperado",
    };
  }
  const sectionNotes: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.sectionNotes ?? {})) {
    if (typeof value === "string" && value.trim()) {
      sectionNotes[key] = clip(value, 1800);
    }
  }
  return {
    ok: true,
    costEur: answer.costEur,
    draft: {
      message: clip(raw.message, 3500),
      sectionNotes,
      nextSteps: clip(raw.nextSteps, 3500),
    },
  };
}

// ------------------------------------------------------------ analysis

const ANALYSIS_SYSTEM = `Eres un consultor SEO senior que revisa un sitio web para un cliente. ${STYLE}
Recibes: (1) páginas que han perdido tráfico, con lo que hay en cada una (título, descripción, H1, encabezados, número de palabras) y las búsquedas que más han caído con su posición antes y ahora; (2) oportunidades de crecimiento: búsquedas donde el sitio ya aparece, con su posición, impresiones, clics, clics potenciales, tipo ("push": está cerca del top 3; "snippet": se ve mucho y se clica poco) y la página que posiciona con su título y encabezados; (3) los temas con más tráfico y las búsquedas que más aportan.
Tu trabajo es dar ideas que de verdad aporten, no generalidades:
- Diagnóstico de cada página que cae: causa más probable y arreglos concretos (qué cambiar en título, H1, encabezados o contenido respecto a la búsqueda que cae).
- Para cada oportunidad: interpreta qué intención de búsqueda hay detrás, qué le falta a la página actual (apóyate en su título y encabezados) y 2 o 3 acciones concretas y distintas entre sí (por ejemplo ampliar una sección concreta, responder una pregunta, enlazar desde páginas relacionadas, separar la intención en una página nueva, mejorar el título). Evita consejos vacíos como "mejorar el contenido".
- Ideas de contenido nuevo (3 a 5) basadas en los temas y las búsquedas dadas, cada una con el motivo por el que tendría recorrido. No inventes volúmenes de búsqueda.
- Títulos nuevos: máximo 60 caracteres el título y 155 la descripción, naturales, con la búsqueda o su intención al principio, sin clickbait ni promesas falsas.
Responde SOLO con un objeto JSON con esta forma exacta:
{"diagnoses": [{"url": "...", "text": "2 a 4 frases", "fixes": ["...", "...", "..."]}],
 "opportunityIdeas": [{"query": "...", "analysis": "2 o 3 frases", "actions": ["...", "..."]}],
 "contentIdeas": [{"title": "...", "reason": "1 o 2 frases"}],
 "titleIdeas": [{"query": "...", "url": "...", "options": [{"title": "...", "description": "..."}, {"title": "...", "description": "..."}]}]}`;

const MAX_LOSERS = 3;
const MAX_TITLES = 4;
const MAX_OPPORTUNITIES = 6;

export type AiAnalysis = {
  diagnoses: Diagnosis[];
  titleIdeas: TitleIdea[];
  opportunityIdeas: OpportunityIdea[];
  contentIdeas: ContentIdea[];
};

export async function analyzeWithAi(
  report: ReportFull,
  siteUrl: string,
  who: AiWho,
): Promise<
  | ({ ok: true; costEur: number } & AiAnalysis)
  | { ok: false; reason: "no_key" | "failed" | "nothing"; detail?: string }
> {
  const { snapshot } = report;
  const losers = snapshot.pageLosers
    .filter((row) => row.clicksDelta <= -10)
    .slice(0, MAX_LOSERS);
  const opportunities = [...snapshot.opportunities]
    .sort((a, b) => b.potentialClicks - a.potentialClicks)
    .slice(0, MAX_OPPORTUNITIES);
  if (
    losers.length === 0 &&
    opportunities.length === 0 &&
    snapshot.topics.length === 0
  ) {
    return { ok: false, reason: "nothing" };
  }

  const urls = [
    ...new Set([
      ...losers.map((row) => row.key),
      ...opportunities.flatMap((item) => (item.page ? [item.page] : [])),
    ]),
  ];
  const signals = new Map(
    await Promise.all(
      urls.map(async (url) => {
        const page = await fetchPageSignals(url, siteUrl);
        return [url, page] as const;
      }),
    ),
  );
  const pageInfo = (url: string) => {
    const page = signals.get(url);
    return page?.ok
      ? {
          titulo: page.title,
          descripcion: page.metaDescription,
          h1: page.h1,
          encabezados: page.headings.slice(0, 25),
          palabras: page.wordCount,
          noindex: page.noindex,
        }
      : { no_se_pudo_leer: true };
  };

  const business = await businessContext(report.projectId);
  const payload = {
    contexto_del_negocio: business || undefined,
    paginas_que_caen: losers.map((row) => ({
      url: row.key,
      ruta: pathOf(row.key),
      clics: { antes: row.prevClicks, ahora: row.clicks },
      posicion: { antes: row.prevPosition, ahora: row.position },
      causa_detectada: row.cause,
      busquedas_que_mas_caen: row.queries,
      pagina: pageInfo(row.key),
    })),
    oportunidades: opportunities.map((item) => ({
      busqueda: item.query,
      tipo: item.kind,
      url: item.page,
      posicion: item.position,
      impresiones: item.impressions,
      clics: item.clicks,
      clics_potenciales: item.potentialClicks,
      pagina: item.page ? pageInfo(item.page) : undefined,
    })),
    temas: snapshot.topics.slice(0, 8).map((topic) => ({
      tema: topic.label,
      clics: topic.clicks,
      clics_antes: topic.prevClicks,
      posicion_media: topic.position,
      busquedas_principales: topic.topQueries.map((item) => item.query),
    })),
    busquedas_que_mas_aportan: snapshot.topQueries.slice(0, 10).map((item) => ({
      busqueda: item.query,
      clics: item.clicks,
      posicion: item.position,
    })),
  };

  const answer = await callClaude({
    deep: true,
    system: ANALYSIS_SYSTEM,
    user: `Datos:\n${JSON.stringify(payload)}`,
    maxTokens: 10000,
    report,
    who,
    kind: "analyze",
  });
  if (!answer.ok) return answer;
  const raw = parseJson<{
    diagnoses?: Partial<Diagnosis>[];
    opportunityIdeas?: Partial<OpportunityIdea>[];
    contentIdeas?: Partial<ContentIdea>[];
    titleIdeas?: {
      query?: string;
      url?: string | null;
      options?: { title?: string; description?: string }[];
    }[];
  }>(answer.text, "analysis");
  if (!raw) {
    return {
      ok: false,
      reason: "failed",
      detail: answer.truncated
        ? "la respuesta de la IA se cortó por longitud"
        : "la respuesta de la IA no tenía el formato esperado",
    };
  }

  const knownUrls = new Set(urls);
  const knownQueries = new Set(opportunities.map((item) => item.query));
  const diagnoses: Diagnosis[] = (raw.diagnoses ?? [])
    .filter((item) => item.url && knownUrls.has(item.url))
    .slice(0, MAX_LOSERS)
    .map((item) => ({
      url: String(item.url),
      text: clip(item.text, 900),
      fixes: (item.fixes ?? []).slice(0, 4).map((fix) => clip(fix, 300)),
    }));
  const opportunityIdeas: OpportunityIdea[] = (raw.opportunityIdeas ?? [])
    .filter((item) => item.query && knownQueries.has(item.query))
    .slice(0, MAX_OPPORTUNITIES)
    .map((item) => ({
      query: clip(item.query, 200),
      analysis: clip(item.analysis, 900),
      actions: (item.actions ?? []).slice(0, 4).map((a) => clip(a, 300)),
    }));
  const contentIdeas: ContentIdea[] = (raw.contentIdeas ?? [])
    .filter((item) => item.title)
    .slice(0, 5)
    .map((item) => ({
      title: clip(item.title, 160),
      reason: clip(item.reason, 400),
    }));
  const titleIdeas: TitleIdea[] = (raw.titleIdeas ?? [])
    .filter((item) => item.query)
    .slice(0, MAX_TITLES)
    .map((item) => ({
      query: clip(item.query, 200),
      url: item.url && knownUrls.has(item.url) ? item.url : null,
      current: item.url ? (signals.get(item.url)?.title ?? null) : null,
      options: (item.options ?? []).slice(0, 3).map((option) => ({
        title: clip(option.title, 90),
        description: clip(option.description, 200),
      })),
    }));
  return {
    ok: true,
    costEur: answer.costEur,
    diagnoses,
    titleIdeas,
    opportunityIdeas,
    contentIdeas,
  };
}
