// Optional AI writing for client reports. The numbers and findings are always
// computed by the app; the model only turns them into the consultant's voice
// (personal message, a short note per section, next steps). It runs only when
// the ANTHROPIC_API_KEY secret is set, on a small model, so one report costs
// a fraction of a cent. The text comes back to the editor as a draft: nothing
// is saved or sent until the consultant reviews it.
import { buildInsights, silverLining } from "@/custom/reporting/insights";
import { buildVerdict } from "@/custom/reporting/narrative";
import type { ReportFull } from "@/custom/reporting/types";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

const DEFAULT_MODEL = "claude-haiku-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";

export type AiDraft = {
  message: string;
  sectionNotes: Record<string, string>;
  nextSteps: string;
};

export async function aiStatus(): Promise<{
  available: boolean;
  model: string;
}> {
  const key = await getOptionalEnvValue("ANTHROPIC_API_KEY");
  const model = (await getOptionalEnvValue("REPORT_AI_MODEL")) || DEFAULT_MODEL;
  return { available: Boolean(key), model };
}

const SYSTEM = `Eres Carlos Ortega, consultor SEO español. Escribes a un cliente que NO es técnico, en castellano claro, cercano y profesional, sin jerga (si usas un término técnico, lo explicas en pocas palabras). Eres siempre honesto con los datos, pero tu enfoque es constructivo y optimista: cuando algo va mal lo dices con claridad y a continuación explicas por qué es recuperable y qué se hará. Nunca inventes cifras ni causas: usa solo los datos y hallazgos que te doy, y no prometas resultados concretos. Responde SOLO con un objeto JSON con esta forma exacta:
{"message": "mensaje personal para el cliente, 3 a 5 frases, en primera persona",
 "sectionNotes": {"hallazgos": "...", "evolucion": "...", "origen": "...", "posiciones": "...", "temas": "...", "oportunidades": "..."},
 "nextSteps": "3 a 4 próximos pasos concretos, uno por línea, sin numerar"}
Cada nota de sección tiene 1 o 2 frases que ayudan a interpretar esa sección; si no tienes nada útil que añadir en una sección, déjala como cadena vacía.`;

function brief(report: ReportFull) {
  const { snapshot } = report;
  return {
    cliente: report.clientName,
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

function parseDraft(text: string): AiDraft | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Partial<AiDraft>;
    const sectionNotes: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw.sectionNotes ?? {})) {
      if (typeof value === "string" && value.trim()) {
        sectionNotes[key] = value.trim().slice(0, 1500);
      }
    }
    return {
      message: String(raw.message ?? "")
        .trim()
        .slice(0, 3500),
      sectionNotes,
      nextSteps: String(raw.nextSteps ?? "")
        .trim()
        .slice(0, 3500),
    };
  } catch {
    return null;
  }
}

export async function draftWithAi(
  report: ReportFull,
): Promise<
  | { ok: true; draft: AiDraft; model: string }
  | { ok: false; reason: "no_key" | "failed" }
> {
  const key = await getOptionalEnvValue("ANTHROPIC_API_KEY");
  if (!key) return { ok: false, reason: "no_key" };
  const model = (await getOptionalEnvValue("REPORT_AI_MODEL")) || DEFAULT_MODEL;
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      signal: AbortSignal.timeout(45_000),
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1800,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Datos del informe:\n${JSON.stringify(brief(report))}`,
          },
        ],
      }),
    });
    if (!response.ok) {
      console.error("[report-ai] API answered", response.status);
      return { ok: false, reason: "failed" };
    }
    const body = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = (body.content ?? [])
      .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
      .join("");
    const draft = parseDraft(text);
    return draft ? { ok: true, draft, model } : { ok: false, reason: "failed" };
  } catch (error) {
    console.error("[report-ai] failed", error);
    return { ok: false, reason: "failed" };
  }
}
