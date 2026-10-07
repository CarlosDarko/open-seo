import { useMemo, type ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
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
import { Button } from "@/client/components/ui/button";
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
  {
    border: string;
    soft: string;
    text: string;
    dot: string;
    top: string;
    wash: string;
    solid: string;
    softBorder: string;
  }
> = {
  destructive: {
    border: "border-l-destructive",
    soft: "bg-destructive/10",
    text: "text-destructive",
    dot: "bg-destructive",
    top: "border-t-destructive",
    wash: "bg-destructive/5",
    solid: "bg-destructive text-white",
    softBorder: "border-destructive/30",
  },
  primary: {
    border: "border-l-primary",
    soft: "bg-primary/10",
    text: "text-primary",
    dot: "bg-primary",
    top: "border-t-primary",
    wash: "bg-primary/5",
    solid: "bg-primary text-white",
    softBorder: "border-primary/30",
  },
  success: {
    border: "border-l-success",
    soft: "bg-success/10",
    text: "text-success",
    dot: "bg-success",
    top: "border-t-success",
    wash: "bg-success/5",
    solid: "bg-success text-white",
    softBorder: "border-success/30",
  },
  info: {
    border: "border-l-info",
    soft: "bg-info/10",
    text: "text-info",
    dot: "bg-info",
    top: "border-t-info",
    wash: "bg-info/5",
    solid: "bg-info text-white",
    softBorder: "border-info/30",
  },
  warning: {
    border: "border-l-warning",
    soft: "bg-warning/10",
    text: "text-warning",
    dot: "bg-warning",
    top: "border-t-warning",
    wash: "bg-warning/5",
    solid: "bg-warning text-white",
    softBorder: "border-warning/30",
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
  // Read in small groups so the cards fill in as each group arrives, instead
  // of waiting for the slowest page of all.
  const chunks = useMemo(() => {
    const groups: string[][] = [];
    for (let i = 0; i < urls.length; i += 6) groups.push(urls.slice(i, i + 6));
    return groups;
  }, [urls]);
  const results = useQueries({
    queries: chunks.map((group) => ({
      queryKey: ["radar-signals", projectId, group],
      queryFn: () => getRadarPageSignals({ data: { projectId, urls: group } }),
      staleTime: 10 * 60_000,
    })),
  });
  const signals = useMemo(
    () =>
      new Map<string, PageSignals>(
        results.flatMap((result) =>
          (result.data?.signals ?? []).map((item): [string, PageSignals] => [
            item.url,
            item,
          ]),
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results.map((result) => result.dataUpdatedAt).join(",")],
  );
  return { signals, loading: results.some((result) => result.isPending) };
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
    <span className="flex gap-0.5" aria-hidden>
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={`h-1.5 w-3 rounded-full ${bar <= level ? "bg-current" : "bg-current opacity-25"}`}
        />
      ))}
    </span>
  );
}

export function ActionCard({
  action,
  signals,
  loadingSignals,
  open,
  onToggle,
  onMarkDone,
  marking,
  hideToggle,
}: {
  action: Action;
  signals: Map<string, PageSignals>;
  loadingSignals: boolean;
  open: boolean;
  onToggle: () => void;
  /** Marks the task as done so its impact can be measured later. */
  onMarkDone?: (title: string | null) => void;
  marking?: boolean;
  /** Inside the pop-up the detail is always shown and the card is not folded. */
  hideToggle?: boolean;
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
    <Card
      data-task-id={action.id}
      className={`gap-0 overflow-hidden border-t-4 py-0 shadow-sm ${tone.top}`}
    >
      <CardContent className="p-0">
        {/* Head: what it is, which page, and what it is worth. */}
        <div
          className={`flex ${hideToggle ? "" : "cursor-pointer"} flex-col gap-4 p-4 sm:flex-row sm:items-start ${tone.wash}`}
          onClick={(event) => {
            if (hideToggle) return;
            if ((event.target as HTMLElement).closest("a, button")) return;
            onToggle();
          }}
        >
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tone.solid}`}
          >
            <Icon className="size-5" aria-hidden />
          </span>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${tone.soft} ${tone.text}`}
              >
                {meta.label}
              </span>
              <EffortPill effort={action.effort} />
            </div>
            {linkedPage ? (
              <a
                href={linkedPage}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-start gap-1.5 text-lg leading-snug font-semibold text-foreground hover:text-primary"
              >
                <span className="break-words">{mainTitle}</span>
                <ExternalLink
                  className="mt-1.5 size-4 shrink-0 text-muted-foreground group-hover:text-primary"
                  aria-hidden
                />
              </a>
            ) : (
              <p className="text-lg leading-snug font-semibold">{mainTitle}</p>
            )}
            {path ? (
              <p className="truncate font-mono text-xs text-muted-foreground">
                {path}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">{action.subtitle}</p>
          </div>

          <div
            className={`shrink-0 rounded-xl border px-4 py-2.5 text-center sm:min-w-28 ${tone.softBorder} bg-card`}
          >
            {action.gain !== null ? (
              <>
                <p
                  className={`text-3xl leading-none font-bold tabular-nums ${isLoss ? "text-destructive" : "text-success"}`}
                >
                  {isLoss ? "−" : "+"}
                  {integer.format(action.gain)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isLoss ? "clics perdidos" : "clics posibles"}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Impacto por medir</p>
            )}
          </div>
        </div>

        <div className="space-y-3 p-4">
          {/* Key figures as small tiles. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {action.stats.map((stat) => {
              const [before, after] = stat.value.split("→").map((x) => x.trim());
              return (
                <div
                  key={stat.label}
                  className="rounded-lg border border-border bg-muted/40 px-3 py-2"
                >
                  <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    {stat.label}
                  </p>
                  <p className="mt-0.5 flex items-baseline gap-1.5 tabular-nums">
                    {after !== undefined ? (
                      <>
                        <span className="text-sm text-muted-foreground">
                          {before}
                        </span>
                        <span className="text-xs text-muted-foreground">→</span>
                        <span className="text-base font-semibold">{after}</span>
                      </>
                    ) : (
                      <span className="text-base font-semibold">{before}</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>

          {/* The recommendation, the most visible thing after the title. */}
          <div
            className={`flex gap-3 rounded-xl border-2 px-4 py-3 ${tone.softBorder} ${tone.soft}`}
          >
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-full ${tone.solid}`}
            >
              <Lightbulb className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p
                className={`text-[11px] font-bold tracking-wider uppercase ${tone.text}`}
              >
                Qué hacer
              </p>
              <p className="text-sm leading-relaxed font-medium">{verdict}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {onMarkDone ? (
              <Button
                size="sm"
                variant="outline"
                disabled={marking}
                onClick={() => onMarkDone(pageTitle)}
                title="Guarda cómo está ahora y mide el efecto en las semanas siguientes"
              >
                <CircleCheck className="size-4" aria-hidden />
                {marking ? "Guardando…" : "Marcar como hecha"}
              </Button>
            ) : (
              <span />
            )}
            {hideToggle ? null : (
            <Button
              size="sm"
              variant={open ? "secondary" : "ghost"}
              aria-expanded={open}
              onClick={onToggle}
            >
              {open ? "Ocultar detalle" : "Ver el porqué y los pasos"}
              <ChevronDown
                className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden
              />
            </Button>
            )}
          </div>
        </div>

        {open ? (
          <div className="grid gap-3 border-t border-border bg-muted/30 p-4 lg:grid-cols-2">
            {action.query ? (
              <div className="lg:col-span-2">
                <GoogleLink query={action.query} />
              </div>
            ) : null}

            {action.kind === "cannibal" ? (
              <Panel title="Páginas que compiten" className="lg:col-span-2">
                <ul className="space-y-2">
                  {action.pages.map((item, index) => {
                    const pageInfo = signals.get(item.page);
                    return (
                      <li
                        key={item.page}
                        className="rounded-lg border border-border bg-muted/40 p-2.5 text-sm"
                      >
                        <PageLink
                          url={item.page}
                          label={
                            pageInfo?.ok && pageInfo.title
                              ? pageInfo.title
                              : undefined
                          }
                        />
                        <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                          {index === 0 ? (
                            <Pill className="bg-success/10 text-success">
                              propuesta como principal
                            </Pill>
                          ) : null}
                          <Pill>posición {decimal.format(item.position)}</Pill>
                          <Pill>{clicksText(item.clicks)}</Pill>
                          <Pill>
                            {integer.format(item.impressions)} impresiones
                          </Pill>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            ) : null}

            <Panel title="Qué dicen los datos">
              <ul className="space-y-2">
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
            </Panel>

            {needsPage ? (
              <Panel title="Qué hay en la página ahora">
                {diagnosis ? (
                  <ul className="space-y-2">
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
                {diagnosis?.extra ? (
                  <div className="mt-3 border-t border-border pt-3">
                    {diagnosis.extra}
                  </div>
                ) : null}
              </Panel>
            ) : null}

            {action.steps.length > 0 ? (
              <Panel title="Pasos a seguir" className="lg:col-span-2">
                <ol className="grid gap-2 md:grid-cols-2">
                  {action.steps.map((step, index) => (
                    <li
                      key={step}
                      className="flex gap-3 rounded-lg border border-border bg-muted/40 p-2.5 text-sm"
                    >
                      <span
                        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${tone.solid}`}
                      >
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </Panel>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Panel({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`space-y-2.5 rounded-xl border border-border bg-card p-3.5 shadow-xs ${className}`}
    >
      <SectionLabel>{title}</SectionLabel>
      {children}
    </section>
  );
}

function Pill({
  className = "bg-muted text-muted-foreground",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`rounded-full px-2 py-0.5 font-medium ${className}`}>
      {children}
    </span>
  );
}

const EFFORT_STYLE: Record<Effort, string> = {
  bajo: "bg-success/10 text-success",
  medio: "bg-warning/10 text-warning",
  alto: "bg-destructive/10 text-destructive",
};

function EffortPill({ effort }: { effort: Effort }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${EFFORT_STYLE[effort]}`}
    >
      <EffortMeter effort={effort} />
      Esfuerzo {effort}
    </span>
  );
}

/** The small card of the board: enough to choose, the rest is in the pop-up. */
export function TaskTile({
  action,
  title,
  onOpen,
}: {
  action: Action;
  title: string;
  onOpen: () => void;
}) {
  const meta = KIND_META[action.kind];
  const tone = TONES[meta.tone];
  const Icon = meta.icon;
  const isLoss = action.kind === "loss";
  return (
    <button
      type="button"
      data-task-id={action.id}
      onClick={onOpen}
      className={`group w-full space-y-2 rounded-lg border border-border border-l-4 bg-card p-3 text-left shadow-xs transition hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 ${tone.border}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.soft} ${tone.text}`}
        >
          <Icon className="size-3" aria-hidden />
          {meta.label}
        </span>
        {action.gain !== null ? (
          <span
            className={`text-sm font-bold tabular-nums ${isLoss ? "text-destructive" : "text-success"}`}
          >
            {isLoss ? "−" : "+"}
            {integer.format(action.gain)}
          </span>
        ) : null}
      </span>
      <span className="line-clamp-2 block text-sm leading-snug font-semibold">
        {tileHeadline(action)}
      </span>
      <span className="line-clamp-2 block text-xs leading-snug text-muted-foreground">
        {title}
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="line-clamp-1 text-xs text-muted-foreground">
          {action.stats
            .slice(0, 2)
            .map((stat) => `${stat.label} ${stat.value}`)
            .join(" · ")}
        </span>
        <EffortMeter effort={action.effort} />
      </span>
    </button>
  );
}

/** The title shown for a task: the page title when read, else its path. */
export function taskTitle(
  action: Action,
  signals: Map<string, PageSignals>,
): string {
  if (action.kind === "cannibal") return `${action.pages.length} páginas tuyas compiten`;
  const info = action.page ? signals.get(action.page) : undefined;
  if (info?.ok && info.title) return info.title;
  const path = action.page ? pathOf(action.page) : null;
  return path === "/" ? "Página de inicio" : (path ?? `«${action.query ?? ""}»`);
}

/** What the task is, in one sentence and without the page address. */
export function tileHeadline(action: Action): string {
  const query = action.query ? `«${action.query}»` : "";
  switch (action.kind) {
    case "loss":
      return action.gain !== null
        ? `Recupera los ${integer.format(action.gain)} clics que ha perdido esta página`
        : "Averigua por qué esta página pierde clics";
    case "snippet":
      return `Reescribe título y meta para ${query}`;
    case "push":
      return `Sube ${query} al top 3`;
    case "question":
      return `Responde la pregunta ${query}`;
    case "cannibal":
      return `Ordena las páginas que compiten por ${query}`;
    case "traction":
      return "Refuerza esta página: se ve mucho pero está muy abajo";
    case "emerging":
      return `Aprovecha la consulta nueva ${query}`;
  }
}
