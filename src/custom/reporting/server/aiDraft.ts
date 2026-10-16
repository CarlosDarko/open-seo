// Optional AI for client reports. The numbers and findings are always computed
// by the app; the model only interprets and writes. It runs only when the
// ANTHROPIC_API_KEY secret is set. Two models: a small, cheap one for writing
// in the consultant's voice (REPORT_AI_MODEL, default Haiku) and a stronger one
// for reading pages and reasoning about them (REPORT_AI_MODEL_DEEP, default
// Sonnet). Everything comes back as a draft: nothing is saved or sent until the
// consultant reviews it, and the model is told never to invent figures.
import { fetchPageSignals } from "@/custom/radar/server/fetchPageSignals";
import {
  buildInsights,
  pathOf,
  silverLining,
} from "@/custom/reporting/insights";
import { buildVerdict } from "@/custom/reporting/narrative";
import type {
  Diagnosis,
  ReportFull,
  TitleIdea,
} from "@/custom/reporting/types";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

const FAST_MODEL = "claude-haiku-5-5";
const DEEP_MODEL = "claude-sonnet-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";

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
    model: (await getOptionalEnvValue("REPORT_AI_MODEL")) || FAST_MODEL,
    deepModel:
      (await getOptionalEnvValue("REPORT_AI_MODEL_DEEP")) || DEEP_MODEL,
  };
}

async function callClaude(input: {
  deep: boolean;
  system: string;
  user: string;
  maxTokens: number;
}): Promise<
  { ok: true; text: string } | { ok: false; reason: "no_key" | "failed" }
> {
  const key = await getOptionalEnvValue("ANTHROPIC_API_KEY");
  if (!key) return { ok: false, reason: "no_key" };
  const status = await aiStatus();
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      signal: AbortSignal.timeout(90_000),
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: input.deep ? status.deepModel : status.model,
        max_tokens: input.maxTokens,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
      }),
    });
    if (!response.ok) {
      console.error("[report-ai] API answered", response.status);
      return { ok: false, reason: "failed" };
    }
    const body = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };
    return {
      ok: true,
      text: (body.content ?? [])
        .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
        .join(""),
    };
  } catch (error) {
    console.error("[report-ai] failed", error);
    return { ok: false, reason: "failed" };
  }
}

function parseJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
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

// ------------------------------------------------------------- writing

const WRITE_SYSTEM = `Eres Carlos Ortega, consultor SEO español. Escribes a un cliente que NO es técnico, en castellano claro, cercano y profesional, sin jerga (si usas un término técnico, lo explicas en pocas palabras). Eres siempre honesto con los datos, pero tu enfoque es constructivo y optimista: cuando algo va mal lo dices con claridad y a continuación explicas por qué es recuperable y qué se hará. Relaciona los datos con el negocio del cliente cuando tengas su contexto. Nunca inventes cifras ni causas: usa solo los datos y hallazgos que te doy, y no prometas resultados concretos. Responde SOLO con un objeto JSON con esta forma exacta:
{"message": "mensaje personal para el cliente, 3 a 5 frases, en primera persona",
 "sectionNotes": {"hallazgos": "...", "evolucion": "...", "origen": "...", "posiciones": "...", "temas": "...", "oportunidades": "..."},
 "nextSteps": "3 a 4 próximos pasos concretos, uno por línea, sin numerar"}
Cada nota de sección tiene 1 o 2 frases que ayudan a interpretar esa sección; si no tienes nada útil que añadir en una sección, déjala como cadena vacía.`;

function brief(report: ReportFull, business: string) {
  const { snapshot } = report;
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
    totales: snapshot.totals,
    totalesAnteriores: snapshot.prevTotals,
    veredicto: buildVerdict(snapshot),
    lo_mas_positivo: silverLining(snapshot),
    hallazgos: buildInsights(snapshot)
      .slice(0, 9)
      .map((item) => ({
        titulo: item.title,
        detalle: item.body,
        lectura_positiva: item.upside,
      })),
    temas: snapshot.topics.slice(0, 5).map((topic) => ({
      tema: topic.label,
      clics: topic.clicks,
      clicsAntes: topic.prevClicks,
    })),
    cambiosDeGoogle: snapshot.updates.map((update) => update.label),
  };
}

export async function draftWithAi(
  report: ReportFull,
): Promise<
  { ok: true; draft: AiDraft } | { ok: false; reason: "no_key" | "failed" }
> {
  const business = await businessContext(report.projectId);
  const answer = await callClaude({
    deep: false,
    system: WRITE_SYSTEM,
    user: `Datos del informe:\n${JSON.stringify(brief(report, business))}`,
    maxTokens: 1800,
  });
  if (!answer.ok) return answer;
  const raw = parseJson<Partial<AiDraft>>(answer.text);
  if (!raw) return { ok: false, reason: "failed" };
  const sectionNotes: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.sectionNotes ?? {})) {
    if (typeof value === "string" && value.trim()) {
      sectionNotes[key] = clip(value, 1500);
    }
  }
  return {
    ok: true,
    draft: {
      message: clip(raw.message, 3500),
      sectionNotes,
      nextSteps: clip(raw.nextSteps, 3500),
    },
  };
}

// ------------------------------------------------------------ analysis

const ANALYSIS_SYSTEM = `Eres un consultor SEO senior que revisa páginas web de un cliente. Recibes, para cada página que ha perdido tráfico, lo que hay en la página (título, descripción, H1, encabezados, número de palabras) y las búsquedas que más han caído con su posición antes y ahora; y, para cada oportunidad de CTR, la búsqueda, su posición actual, su CTR y el título y la descripción actuales. Escribes en castellano claro para un cliente no técnico.
Reglas estrictas: usa SOLO la información que te doy; no inventes datos, cifras ni contenido de la página que no hayas visto; si no hay suficiente información para afirmar algo, dilo con prudencia ("posiblemente", "conviene comprobar"). Sé concreto: señala qué falta o qué sobra en título, H1 y encabezados respecto a la búsqueda que cae. Tono constructivo: cada diagnóstico acaba en algo que se puede arreglar.
Para los títulos nuevos: máximo 60 caracteres el título y 155 la descripción, naturales, con la búsqueda o su intención al principio, sin clickbait ni promesas falsas.
Responde SOLO con un objeto JSON con esta forma exacta:
{"diagnoses": [{"url": "...", "text": "2 a 4 frases con el diagnóstico probable", "fixes": ["arreglo concreto 1", "arreglo concreto 2", "arreglo concreto 3"]}],
 "titleIdeas": [{"query": "...", "url": "...", "options": [{"title": "...", "description": "..."}, {"title": "...", "description": "..."}]}]}`;

const MAX_PAGES = 3;
const MAX_TITLES = 4;

export async function analyzeWithAi(
  report: ReportFull,
  siteUrl: string,
): Promise<
  | { ok: true; diagnoses: Diagnosis[]; titleIdeas: TitleIdea[] }
  | { ok: false; reason: "no_key" | "failed" | "nothing" }
> {
  const { snapshot } = report;
  const losers = snapshot.pageLosers
    .filter((row) => row.clicksDelta <= -10)
    .slice(0, MAX_PAGES);
  const snippets = snapshot.opportunities
    .filter((item) => item.kind === "snippet" && item.page)
    .sort((a, b) => b.potentialClicks - a.potentialClicks)
    .slice(0, MAX_TITLES);
  if (losers.length === 0 && snippets.length === 0) {
    return { ok: false, reason: "nothing" };
  }

  const urls = [
    ...new Set([
      ...losers.map((row) => row.key),
      ...snippets.flatMap((item) => (item.page ? [item.page] : [])),
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
    oportunidades_de_ctr: snippets.map((item) => ({
      busqueda: item.query,
      url: item.page,
      posicion: item.position,
      impresiones: item.impressions,
      clics: item.clicks,
      pagina: item.page ? pageInfo(item.page) : undefined,
    })),
  };

  const answer = await callClaude({
    deep: true,
    system: ANALYSIS_SYSTEM,
    user: `Datos:\n${JSON.stringify(payload)}`,
    maxTokens: 3500,
  });
  if (!answer.ok) return answer;
  const raw = parseJson<{
    diagnoses?: Partial<Diagnosis>[];
    titleIdeas?: {
      query?: string;
      url?: string | null;
      options?: { title?: string; description?: string }[];
    }[];
  }>(answer.text);
  if (!raw) return { ok: false, reason: "failed" };

  const knownUrls = new Set(urls);
  const diagnoses: Diagnosis[] = (raw.diagnoses ?? [])
    .filter((item) => item.url && knownUrls.has(item.url))
    .slice(0, MAX_PAGES)
    .map((item) => ({
      url: String(item.url),
      text: clip(item.text, 900),
      fixes: (item.fixes ?? []).slice(0, 4).map((fix) => clip(fix, 300)),
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
  return { ok: true, diagnoses, titleIdeas };
}
