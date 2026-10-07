import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/client/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  buildActions,
  signalUrls,
  type Action,
  type RadarReport,
} from "@/custom/radar/actions";
import {
  missingLinkSources,
  pushFindings,
  queryWords,
  snippetFindings,
  type Finding,
} from "@/custom/radar/diagnostics";
import { integer, pathOf } from "@/custom/radar/format";
import type { PageSignals } from "@/custom/radar/pageSignals";
import {
  GoogleLink,
  PageLink,
} from "@/custom/radar/client/RadarLinks";
import { getRadarPageSignals } from "@/serverFunctions/radar";

const GROUPS = [
  {
    key: "losses",
    title: "Primero: lo que se está perdiendo",
    help: "Páginas que han perdido clics. Averigua el motivo antes de tocar nada.",
    badge: "Pérdida",
  },
  {
    key: "snippets",
    title: "Victorias rápidas: reescribe títulos y metas",
    help: "Consultas de primera página que reciben menos clics de los que tu sitio suele conseguir en esa posición. Es lo más rápido de arreglar.",
    badge: "Reescribir",
  },
  {
    key: "pushes",
    title: "Empuja estas consultas al top 3",
    help: "Ya estás cerca: con un contenido mejor y más enlaces internos pueden subir.",
    badge: "Subir",
  },
  {
    key: "cannibals",
    title: "Ordena las páginas que compiten entre sí",
    help: "Cuando dos páginas se reparten una consulta, Google duda y ninguna rinde lo que podría.",
    badge: "Ordenar",
  },
] as const;

export function ActionPlan({
  projectId,
  report,
}: {
  projectId: string;
  report: RadarReport;
}) {
  const plan = useMemo(() => buildActions(report), [report]);
  const urls = useMemo(() => signalUrls(plan), [plan]);
  const signalsQuery = useQuery({
    queryKey: ["radar-signals", projectId, urls],
    queryFn: () => getRadarPageSignals({ data: { projectId, urls } }),
    enabled: urls.length > 0,
    staleTime: 10 * 60_000,
  });
  const signals = useMemo(
    () =>
      new Map<string, PageSignals>(
        (signalsQuery.data?.signals ?? []).map((item) => [item.url, item]),
      ),
    [signalsQuery.data],
  );

  const total = GROUPS.reduce((sum, group) => sum + plan[group.key].length, 0);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Plan de acción</h2>
        <p className="text-sm text-muted-foreground">
          Tareas concretas, con la página y la consulta implicadas. Leo el
          título, la meta descripción y el H1 reales de tu web para decirte qué
          cambiar.
        </p>
      </div>
      {total === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No hay tareas claras en este periodo: no se detectan pérdidas
            relevantes ni consultas con potencial suficiente.
          </CardContent>
        </Card>
      ) : null}
      {GROUPS.map((group) =>
        plan[group.key].length > 0 ? (
          <div key={group.key} className="space-y-3">
            <div>
              <h3 className="font-medium">{group.title}</h3>
              <p className="text-xs text-muted-foreground">{group.help}</p>
            </div>
            {plan[group.key].map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                badge={group.badge}
                signals={signals}
                loadingSignals={signalsQuery.isPending && urls.length > 0}
              />
            ))}
          </div>
        ) : null,
      )}
    </section>
  );
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
  if (action.kind === "snippet" && action.page && action.query) {
    const page = signals.get(action.page);
    return page
      ? { findings: snippetFindings(page, action.query), extra: null }
      : null;
  }
  if (action.kind === "push" && action.page && action.query) {
    const page = signals.get(action.page);
    if (!page) return null;
    const sources = action.linkSources.flatMap((url) => {
      const source = signals.get(url);
      return source ? [source] : [];
    });
    const missing = missingLinkSources(action.page, sources);
    return {
      findings: pushFindings(page, action.query),
      extra:
        sources.length === 0 ? null : (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Enlaces internos</p>
            {missing.length > 0 ? (
              <>
                <p>
                  Estas páginas fuertes de tu web aún no enlazan a{" "}
                  {pathOf(action.page)}. Añade un enlace con el texto «
                  {action.query}»:
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
    const words = action.query ? queryWords(action.query) : [];
    for (const page of action.pages.slice(0, 2)) {
      const info = signals.get(page.page);
      if (!info?.ok) continue;
      const title = info.title ?? "(sin título)";
      findings.push({
        level: "warn",
        text: `${pathOf(page.page)} — título «${title}»${info.h1[0] ? `, H1 «${info.h1[0]}»` : ""}.`,
      });
    }
    if (findings.length === 2 && words.length > 0) {
      findings.push({
        level: "warn",
        text: "Si los dos títulos y H1 apuntan a la misma consulta, diferencia claramente la intención de cada página o fusiónalas.",
      });
    }
    return findings.length > 0 ? { findings, extra: null } : null;
  }
  return null;
}

function ActionCard({
  action,
  badge,
  signals,
  loadingSignals,
}: {
  action: Action;
  badge: string;
  signals: Map<string, PageSignals>;
  loadingSignals: boolean;
}) {
  const needsPage = action.kind !== "loss";
  const diagnosis = needsPage ? findingsFor(action, signals) : null;

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{badge}</Badge>
          {action.gain !== null ? (
            <Badge variant="outline">
              {action.kind === "loss" ? "−" : "≈ +"}
              {integer.format(action.gain)} clics
            </Badge>
          ) : null}
          <Badge variant="outline">Esfuerzo {action.effort}</Badge>
        </div>
        <CardTitle className="text-base leading-snug">
          {action.headline}
        </CardTitle>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {action.kind === "cannibal" ? (
            action.pages.map((page) => (
              <PageLink key={page.page} url={page.page} />
            ))
          ) : action.page ? (
            <PageLink url={action.page} />
          ) : null}
          {action.query ? <GoogleLink query={action.query} /> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {action.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        {needsPage ? (
          <div className="space-y-2 rounded-md bg-muted/50 p-3">
            <p className="text-sm font-medium">Qué cambiar en la página</p>
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
          <div className="space-y-1">
            <p className="text-sm font-medium">Pasos</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {action.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
