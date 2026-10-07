import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  GitMerge,
  Layers,
  PenLine,
  Sparkles,
  TriangleAlert,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/client/components/ui/badge";
import { Card, CardContent } from "@/client/components/ui/card";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  signalUrls,
  type Action,
  type ActionKind,
  type ActionPlan as Plan,
} from "@/custom/radar/actions";
import {
  missingLinkSources,
  pushFindings,
  queryWords,
  questionFindings,
  snippetFindings,
  type Finding,
} from "@/custom/radar/diagnostics";
import { integer, pathOf } from "@/custom/radar/format";
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
    badge: string;
    title: string;
    help: string;
  }
> = {
  loss: {
    planKey: "losses",
    icon: TrendingDown,
    tone: "destructive",
    badge: "Pérdida",
    title: "Lo que se está perdiendo",
    help: "Páginas que han perdido clics. Averigua el motivo antes de tocar nada.",
  },
  snippet: {
    planKey: "snippets",
    icon: PenLine,
    tone: "primary",
    badge: "Reescribir",
    title: "Reescribe títulos y metas",
    help: "Consultas de primera página con menos clics de los que tu sitio suele conseguir en esa posición. Es lo más rápido de arreglar.",
  },
  push: {
    planKey: "pushes",
    icon: ArrowUpRight,
    tone: "success",
    badge: "Subir",
    title: "Empuja al top 3",
    help: "Ya estás cerca: con mejor contenido y más enlaces internos pueden subir.",
  },
  question: {
    planKey: "questions",
    icon: CircleHelp,
    tone: "info",
    badge: "Responder",
    title: "Responde preguntas",
    help: "Preguntas que la gente hace y para las que ya apareces: conviértelas en la respuesta que Google destaca.",
  },
  cannibal: {
    planKey: "cannibals",
    icon: GitMerge,
    tone: "warning",
    badge: "Ordenar",
    title: "Ordena páginas que compiten",
    help: "Cuando dos páginas se reparten una consulta, Google duda y ninguna rinde lo que podría.",
  },
  traction: {
    planKey: "traction",
    icon: Layers,
    tone: "info",
    badge: "Reforzar",
    title: "Refuerza páginas sin tracción",
    help: "Google las muestra mucho pero muy abajo: el tema está bien y falta calidad, profundidad o enlaces.",
  },
  emerging: {
    planKey: "emerging",
    icon: Sparkles,
    tone: "success",
    badge: "Aprovechar",
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

function findingsFor(
  action: Action,
  signals: Map<string, PageSignals>,
): { findings: Finding[]; extra: ReactNode } | null {
  const page = action.page ? signals.get(action.page) : undefined;
  if (action.kind === "snippet" && page && action.query) {
    return { findings: snippetFindings(page, action.query), extra: null };
  }
  if (action.kind === "question" && page && action.query) {
    return { findings: questionFindings(page, action.query), extra: null };
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
                      <PageLink url={url} />
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
    return findings.length > 0 ? { findings, extra: null } : null;
  }
  return null;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

export function ActionCard({
  action,
  signals,
  loadingSignals,
}: {
  action: Action;
  signals: Map<string, PageSignals>;
  loadingSignals: boolean;
}) {
  const meta = KIND_META[action.kind];
  const tone = TONES[meta.tone];
  const Icon = meta.icon;
  const needsPage = action.kind !== "loss" && action.kind !== "emerging";
  const diagnosis = needsPage ? findingsFor(action, signals) : null;

  return (
    <Card className={`border-l-4 ${tone.border}`}>
      <CardContent className="space-y-4 py-1">
        <div className="flex items-start gap-3">
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-full ${tone.soft} ${tone.text}`}
          >
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={`${tone.soft} ${tone.text} border-0`}>
                {meta.badge}
              </Badge>
              {action.gain !== null ? (
                <Badge
                  variant="outline"
                  className={
                    action.kind === "loss"
                      ? "border-destructive/40 text-destructive"
                      : "border-success/40 text-success"
                  }
                >
                  {action.kind === "loss" ? "−" : "≈ +"}
                  {integer.format(action.gain)} clics
                </Badge>
              ) : null}
              <Badge variant="outline" className="text-muted-foreground">
                Esfuerzo {action.effort}
              </Badge>
            </div>
            <h4 className="leading-snug font-semibold">{action.headline}</h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {action.kind === "cannibal" ? (
                action.pages.map((item) => (
                  <PageLink key={item.page} url={item.page} />
                ))
              ) : action.page ? (
                <PageLink url={action.page} />
              ) : null}
              {action.query ? <GoogleLink query={action.query} /> : null}
            </div>
          </div>
        </div>

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
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
            <SectionLabel>Qué cambiar en la página</SectionLabel>
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
                No he podido leer la página. Ábrela con el enlace y revisa su
                título, su meta descripción y su H1.
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
      </CardContent>
    </Card>
  );
}
