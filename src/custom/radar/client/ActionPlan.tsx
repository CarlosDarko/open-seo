import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  ExternalLink,
  GitMerge,
  Layers,
  Lightbulb,
  PenLine,
  Sparkles,
  TriangleAlert,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/client/components/ui/card";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  signalUrls,
  type Action,
  type ActionKind,
  type ActionPlan as Plan,
  type Effort,
} from "@/custom/radar/actions";
import {
  missingLinkSources,
  pushFindings,
  queryWords,
  questionFindings,
  snippetFindings,
  type Finding,
} from "@/custom/radar/diagnostics";
import { clicksText, decimal, integer, pathOf } from "@/custom/radar/format";
import type { PageSignals } from "@/custom/radar/pageSignals";
import { GoogleLink, PageLink } from "@/custom/radar/client/RadarLinks";
import { getRadarPageSignals } from "@/serverFunctions/radar";

type Tone = "destructive" | "primary" | "success" | "info" | "warning";

// Full class names on purpose: Tailwind only keeps classes it can read.
const TONES: Record<
  Tone,
  { border: string; soft: string; text: string; dot: string }
> = {
  destructive: {
    border: "border-l-destructive",
    soft: "bg-destructive/10",
    text: "text-destructive",
    dot: "bg-destructive",
  },
  primary: {
    border: "border-l-primary",
    soft: "bg-primary/10",
    text: "text-primary",
    dot: "bg-primary",
  },
  success: {
    border: "border-l-success",
    soft: "bg-success/10",
    text: "text-success",
    dot: "bg-success",
  },
  info: {
    border: "border-l-info",
    soft: "bg-info/10",
    text: "text-info",
    dot: "bg-info",
  },
  warning: {
    border: "border-l-warning",
    soft: "bg-warning/10",
    text: "text-warning",
    dot: "bg-warning",
  },
};

export const KIND_META: Record<
  ActionKind,
  {
    planKey: keyof Plan;
    icon: LucideIcon;
    tone: Tone;
    /** Short name for the tile and the card badge. */
    label: string;
    /** What the tile says you will find. */
    summary: string;
    title: string;
    help: string;
  }
> = {
  loss: {
    planKey: "losses",
    icon: TrendingDown,
    tone: "destructive",
    label: "Pérdidas",
    summary: "Páginas que han perdido clics y por qué",
    title: "Lo que se está perdiendo",
    help: "Páginas que han perdido clics. Averigua el motivo antes de tocar nada.",
  },
  snippet: {
    planKey: "snippets",
    icon: PenLine,
    tone: "primary",
    label: "Títulos y metas",
    summary: "Consultas que reciben pocos clics para su posición",
    title: "Reescribe títulos y metas",
    help: "Consultas de primera página con menos clics de los que tu sitio suele conseguir en esa posición. Es lo más rápido de arreglar.",
  },
  push: {
    planKey: "pushes",
    icon: ArrowUpRight,
    tone: "success",
    label: "Subir al top 3",
    summary: "Consultas cerca del top 3 que pueden subir",
    title: "Empuja al top 3",
    help: "Ya estás cerca: con mejor contenido y más enlaces internos pueden subir.",
  },
  question: {
    planKey: "questions",
    icon: CircleHelp,
    tone: "info",
    label: "Preguntas",
    summary: "Preguntas de la gente que puedes responder mejor",
    title: "Responde preguntas",
    help: "Preguntas que la gente hace y para las que ya apareces: conviértelas en la respuesta que Google destaca.",
  },
  cannibal: {
    planKey: "cannibals",
    icon: GitMerge,
    tone: "warning",
    label: "Canibalización",
    summary: "Páginas tuyas que compiten por la misma consulta",
    title: "Ordena páginas que compiten",
    help: "Cuando dos páginas se reparten una consulta, Google duda y ninguna rinde lo que podría.",
  },
  traction: {
    planKey: "traction",
    icon: Layers,
    tone: "info",
    label: "Sin tracción",
    summary: "Páginas muy vistas en Google pero muy abajo",
    title: "Refuerza páginas sin tracción",
    help: "Google las muestra mucho pero muy abajo: el tema está bien y falta calidad, profundidad o enlaces.",
  },
  emerging: {
    planKey: "emerging",
    icon: Sparkles,
    tone: "success",
    label: "Emergentes",
    summary: "Consultas nuevas que empiezan a traerte impresiones",
    title: "Aprovecha temas emergentes",
    help: "Consultas nuevas que empiezan a traerte impresiones: refuérzalas antes de que otros lo hagan.",
  },
};

export const KIND_ORDER: ActionKind[] = [
  "loss",
  "snippet",
  "push",
  "question",
  "cannibal",
  "traction",
  "emerging",
];

/** Reads the on-page signals of every page the plan mentions, once. */
export function usePlanSignals(projectId: string, plan: Plan) {
  const urls = useMemo(() => signalUrls(plan), [plan]);
  const query = useQuery({
    queryKey: ["radar-signals", projectId, urls],
    queryFn: () => getRadarPageSignals({ data: { projectId, urls } }),
    enabled: urls.length > 0,
    staleTime: 10 * 60_000,
  });
  const signals = useMemo(
    () =>
      new Map<string, PageSignals>(
        (query.data?.signals ?? []).map((item) => [item.url, item]),
      ),
    [query.data],
  );
  return { signals, loading: query.isPending && urls.length > 0 };
}

function FindingRow({ finding }: { finding: Finding }) {
  const Icon =
    finding.level === "ok"
      ? CircleCheck
      : finding.level === "bad"
        ? CircleAlert
        : TriangleAlert;
  const color =
    finding.level === "ok"
      ? "text-success"
      : finding.level === "bad"
        ? "text-destructive"
        : "text-warning";
  return (
    <li className="flex gap-2 text-sm">
      <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} aria-hidden />
      <span>{finding.text}</span>
    </li>
  );
}

type Diagnosis = {
  findings: Finding[];
  extra: ReactNode;
  /** Strong pages that do not link to the target yet. */
  missingLinks: number;
};

function diagnose(
  action: Action,
  signals: Map<string, PageSignals>,
): Diagnosis | null {
  const page = action.page ? signals.get(action.page) : undefined;
  if (action.kind === "snippet" && page && action.query) {
    return {
      findings: snippetFindings(page, action.query),
      extra: null,
      missingLinks: 0,
    };
  }
  if (action.kind === "question" && page && action.query) {
    return {
      findings: questionFindings(page, action.query),
      extra: null,
      missingLinks: 0,
    };
  }
  if ((action.kind === "push" || action.kind === "traction") && page) {
    const sources = action.linkSources.flatMap((url) => {
      const source = signals.get(url);
      return source ? [source] : [];
    });
    const missing = action.page ? missingLinkSources(action.page, sources) : [];
    const anchor = action.query ? ` con el texto «${action.query}»` : "";
    return {
      findings: action.query
        ? pushFindings(page, action.query)
        : [
            {
              level: "ok",
              text: `Contenido de ${integer.format(page.wordCount)} palabras.`,
            },
          ],
      missingLinks: missing.length,
      extra:
        sources.length === 0 ? null : (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Enlaces internos</p>
            {missing.length > 0 ? (
              <>
                <p>
                  Estas páginas fuertes de tu web aún no enlazan a{" "}
                  {pathOf(action.page ?? "")}. Añade un enlace{anchor}:
                </p>
                <ul className="space-y-0.5 pl-4">
                  {missing.map((url) => (
                    <li key={url} className="list-disc">
                      <PageLink
                        url={url}
                        label={signals.get(url)?.title ?? undefined}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-muted-foreground">
                Tus páginas con más tráfico ya enlazan a esta. Consigue enlaces
                desde otras páginas relacionadas.
              </p>
            )}
          </div>
        ),
    };
  }
  if (action.kind === "cannibal") {
    const findings: Finding[] = [];
    for (const item of action.pages.slice(0, 2)) {
      const info = signals.get(item.page);
      if (!info?.ok) continue;
      findings.push({
        level: "warn",
        text: `${pathOf(item.page)}: título «${info.title ?? "(sin título)"}»${info.h1[0] ? `, H1 «${info.h1[0]}»` : ""}.`,
      });
    }
    if (findings.length === 2 && action.query) {
      const words = queryWords(action.query);
      if (words.length > 0) {
        findings.push({
          level: "warn",
          text: "Si los dos títulos y H1 apuntan a la misma consulta, diferencia la intención de cada página o fusiónalas.",
        });
      }
    }
    return findings.length > 0
      ? { findings, extra: null, missingLinks: 0 }
      : null;
  }
  return null;
}

const LOSS_VERDICT = {
  posicion:
    "Recupera la posición: actualiza el contenido y compáralo con las tres primeras páginas de Google.",
  demanda:
    "Probablemente es estacionalidad: compara con el año pasado antes de tocar nada.",
  ctr: "Tu posición aguanta pero atraes menos clics: reescribe el título y la meta descripción.",
  perdida:
    "Comprueba que la URL sigue activa e indexada y que no tiene «noindex».",
  mixto:
    "Cambian varias cosas a la vez: revisa posición y contenido frente a las tres primeras.",
  nueva: "Página nueva: déjala madurar y revisa su evolución.",
} as const;

/** The one-sentence recommendation: what to do first, given what was found. */
export function verdictFor(action: Action, diagnosis: Diagnosis | null): string {
  const problems = diagnosis?.findings.some((f) => f.level !== "ok") ?? false;
  switch (action.kind) {
    case "loss":
      return LOSS_VERDICT[action.cause ?? "mixto"];
    case "snippet":
      if (action.anomaly) {
        return "Antes de reescribir nada, abre la búsqueda en Google: con un CTR tan bajo suele haber algo (respuesta de IA, anuncios, vídeos) que se lleva los clics, o la consulta no es realmente para tu página.";
      }
      if (!diagnosis) return "Reescribe el título y la meta descripción de la página.";
      return problems
        ? "Reescribe el título y la meta descripción: abajo ves qué falla exactamente."
        : "El título y la meta están bien: prueba otro gancho (dato, año, beneficio) y compáralos con los de las tres primeras páginas.";
    case "push":
      if (!diagnosis) {
        return "Mejora el contenido y refuerza los enlaces internos hacia la página.";
      }
      if (problems) {
        return "Corrige primero lo marcado abajo: es lo más barato de mejorar.";
      }
      return diagnosis.missingLinks > 0
        ? `Añade enlaces internos desde ${diagnosis.missingLinks} ${diagnosis.missingLinks === 1 ? "página fuerte" : "páginas fuertes"} (abajo cuáles) y compara tu contenido con el de las tres primeras.`
        : "La página cumple lo básico y está enlazada: para subir necesita mejor contenido que las tres primeras, o enlaces desde otras webs. Compáralas.";
    case "question":
      return diagnosis && !problems
        ? "Ya tienes un encabezado con la pregunta: mejora la respuesta (40-60 palabras justo debajo)."
        : "Añade la pregunta como encabezado y respóndela en 40-60 palabras justo debajo.";
    case "cannibal":
      return "Elige una página para esta consulta y redirige o diferencia la otra.";
    case "traction":
      return "Amplía y enlaza la página, o fusiónala con otra más fuerte.";
    case "emerging":
      return "Comprueba que la página responde a la consulta; si no, crea o amplía contenido.";
  }
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function EffortMeter({ effort }: { effort: Effort }) {
  const level = effort === "bajo" ? 1 : effort === "medio" ? 2 : 3;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={`Esfuerzo ${effort}`}
    >
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={`h-1.5 w-4 rounded-full ${bar <= level ? "bg-foreground/70" : "bg-border"}`}
          />
        ))}
      </span>
      Esfuerzo {effort}
    </span>
  );
}

export function ActionCard({
  action,
  signals,
  loadingSignals,
  open,
  onToggle,
}: {
  action: Action;
  signals: Map<string, PageSignals>;
  loadingSignals: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const meta = KIND_META[action.kind];
  const tone = TONES[meta.tone];
  const Icon = meta.icon;
  const needsPage = action.kind !== "loss" && action.kind !== "emerging";
  const diagnosis = needsPage ? diagnose(action, signals) : null;
  const verdict = verdictFor(action, diagnosis);
  const isLoss = action.kind === "loss";

  const linkedPage = action.kind === "cannibal" ? null : action.page;
  const info = linkedPage ? signals.get(linkedPage) : undefined;
  const pageTitle = info?.ok && info.title ? info.title : null;
  const path = linkedPage ? pathOf(linkedPage) : null;
  const mainTitle =
    action.kind === "cannibal"
      ? `«${action.query ?? ""}»`
      : (pageTitle ??
        (path === "/" ? "Página de inicio" : path) ??
        `«${action.query ?? ""}»`);

  return (
    <Card className={`overflow-hidden border-l-4 ${tone.border}`}>
      <CardContent className="p-0">
        <div
          className="flex cursor-pointer gap-4 p-4"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a, button")) return;
            onToggle();
          }}
        >
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${tone.soft} ${tone.text}`}
          >
            <Icon className="size-5" aria-hidden />
          </span>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p
                  className={`text-[11px] font-semibold tracking-wider uppercase ${tone.text}`}
                >
                  {meta.label}
                </p>
                {linkedPage ? (
                  <a
                    href={linkedPage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-start gap-1.5 leading-snug font-semibold text-foreground hover:text-primary"
                  >
                    <span className="break-words">{mainTitle}</span>
                    <ExternalLink
                      className="mt-1 size-3.5 shrink-0 text-muted-foreground group-hover:text-primary"
                      aria-hidden
                    />
                  </a>
                ) : (
                  <p className="leading-snug font-semibold">{mainTitle}</p>
                )}
                {path ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {path === "/" ? "Página de inicio (/)" : path}
                  </p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {action.subtitle}
                </p>
              </div>

              <div className="shrink-0 sm:text-right">
                {action.gain !== null ? (
                  <>
                    <p
                      className={`text-2xl leading-none font-semibold tabular-nums ${isLoss ? "text-destructive" : "text-success"}`}
                    >
                      {isLoss ? "−" : "+"}
                      {integer.format(action.gain)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {isLoss ? "clics perdidos" : "clics posibles"}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Impacto por medir
                  </p>
                )}
                <div className="mt-2 sm:flex sm:justify-end">
                  <EffortMeter effort={action.effort} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {action.stats.map((stat) => (
                <span
                  key={stat.label}
                  className="inline-flex items-baseline gap-1.5 rounded-md bg-muted px-2 py-1 text-xs"
                >
                  <span className="text-muted-foreground">{stat.label}</span>
                  <span className="font-medium tabular-nums">{stat.value}</span>
                </span>
              ))}
            </div>

            <div className={`flex gap-2.5 rounded-lg px-3 py-2.5 text-sm ${tone.soft}`}>
              <Lightbulb
                className={`mt-0.5 size-4 shrink-0 ${tone.text}`}
                aria-hidden
              />
              <p>
                <strong className={tone.text}>Qué hacer: </strong>
                {verdict}
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                aria-expanded={open}
                onClick={onToggle}
                className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {open ? "Ocultar detalle" : "Ver detalle"}
                <ChevronDown
                  className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
            </div>
          </div>
        </div>

        {open ? (
          <div className="space-y-4 border-t border-border bg-muted/20 p-4 pl-18">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {action.query ? <GoogleLink query={action.query} /> : null}
            </div>

            {action.kind === "cannibal" ? (
              <div className="space-y-1.5">
                <SectionLabel>Páginas que compiten</SectionLabel>
                <ul className="space-y-1.5 text-sm">
                  {action.pages.map((item, index) => {
                    const pageInfo = signals.get(item.page);
                    return (
                      <li key={item.page} className="space-y-0.5">
                        <PageLink
                          url={item.page}
                          label={
                            pageInfo?.ok && pageInfo.title
                              ? pageInfo.title
                              : undefined
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          {pathOf(item.page)} ·{" "}
                          {index === 0 ? "propuesta como principal · " : ""}
                          posición {decimal.format(item.position)} ·{" "}
                          {clicksText(item.clicks)} ·{" "}
                          {integer.format(item.impressions)} impresiones
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <SectionLabel>Qué dicen los datos</SectionLabel>
              <ul className="space-y-1.5">
                {action.lines.map((line) => (
                  <li key={line} className="flex gap-2 text-sm">
                    <span
                      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${tone.dot}`}
                      aria-hidden
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            {needsPage ? (
              <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                <SectionLabel>Qué hay en la página ahora</SectionLabel>
                {diagnosis ? (
                  <ul className="space-y-1.5">
                    {diagnosis.findings.map((finding) => (
                      <FindingRow key={finding.text} finding={finding} />
                    ))}
                  </ul>
                ) : loadingSignals ? (
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No he podido leer la página. Ábrela con el enlace y revisa
                    su título, su meta descripción y su H1.
                  </p>
                )}
                {diagnosis?.extra}
              </div>
            ) : null}

            {action.steps.length > 0 ? (
              <div className="space-y-2">
                <SectionLabel>Pasos</SectionLabel>
                <ol className="space-y-2">
                  {action.steps.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm">
                      <span
                        className={`flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone.soft} ${tone.text}`}
                      >
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
