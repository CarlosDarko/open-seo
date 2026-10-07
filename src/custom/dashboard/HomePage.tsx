import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Line, LineChart } from "recharts";
import { ArrowRight, RefreshCw } from "lucide-react";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/client/components/ui/chart";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  AuditHealthCard,
  BacklinkPulseCard,
  GscCard,
} from "@/client/features/dashboard/DashboardCards";
import { DashboardOnboarding } from "@/client/features/dashboard/DashboardOnboarding";
import { Ga4Card } from "@/client/features/dashboard/Ga4Card";
import { WorkspaceMergeBanner } from "@/client/features/dashboard/WorkspaceMergeBanner";
import { buildActions } from "@/custom/radar/actions";
import { KIND_META } from "@/custom/radar/client/ActionPlan";
import { AlertsBanner } from "@/custom/radar/client/AlertsBanner";
import { RadarControls } from "@/custom/radar/client/RadarControls";
import { PageLink } from "@/custom/radar/client/RadarLinks";
import { periodInput } from "@/custom/radar/client/useRadarFilters";
import { useRadarReport } from "@/custom/radar/client/useRadarReport";
import {
  decimal,
  integer,
  percent,
  relativeChange,
  signed,
} from "@/custom/radar/format";
import type { DailyPoint } from "@/custom/radar/radarAnalysis";
import type { Verdict } from "@/custom/radar/trackingImpact";
import {
  getDashboardActivation,
  getDashboardOverview,
  refreshDashboardBacklinkSnapshot,
} from "@/serverFunctions/dashboard";
import { listTrackedActions } from "@/serverFunctions/radarTracking";
import { getTopicsReport } from "@/serverFunctions/radarTopics";

const OTHERS = "Otros temas";

const VERDICT_LABEL: Record<Verdict, { text: string; className: string }> = {
  mejora: { text: "Ha mejorado", className: "bg-success/10 text-success" },
  empeora: { text: "Ha empeorado", className: "bg-destructive/10 text-destructive" },
  sin_cambio: { text: "Sin cambio notable", className: "bg-muted text-muted-foreground" },
  pocos_datos: { text: "Pocos datos", className: "bg-warning/10 text-warning" },
};

/**
 * The project's home: what is happening (figures, changes, alerts), what to do
 * about it (the best tasks of the action plan), how earlier improvements
 * worked, and the technical health from OpenSEO's own audit and backlinks.
 * It replaces OpenSEO's dashboard route at build time (custom/i18n/patches.mjs)
 * and reuses its onboarding and cards.
 */
export function HomePage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { filters, update, query, report } = useRadarReport(projectId);

  const activation = useQuery({
    queryKey: ["dashboardActivation", projectId],
    queryFn: () => getDashboardActivation({ data: { projectId } }),
  });
  const overview = useQuery({
    queryKey: ["dashboardOverview", projectId],
    queryFn: () => getDashboardOverview({ data: { projectId } }),
    refetchInterval: (q) => (q.state.data?.audit?.status === "running" ? 3000 : false),
  });
  const topics = useQuery({
    queryKey: ["radar-topics", projectId, { ...periodInput(filters), includeBrand: filters.includeBrand }],
    queryFn: () =>
      getTopicsReport({
        data: { projectId, ...periodInput(filters), includeBrand: filters.includeBrand },
      }),
    enabled: report !== null,
    staleTime: 5 * 60_000,
  });
  const tracked = useQuery({
    queryKey: ["radar-tracked-home", projectId],
    queryFn: () => listTrackedActions({ data: { projectId, limit: 3 } }),
    staleTime: 5 * 60_000,
  });

  // OpenSEO refreshed the backlink summary by itself on every visit, which
  // costs a little each day. Here it only happens when asked.
  const refreshBacklinks = useMutation({
    mutationFn: () => refreshDashboardBacklinkSnapshot({ data: { projectId } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["dashboardOverview", projectId] }),
  });

  const plan = useMemo(() => (report ? buildActions(report) : null), [report]);
  const nextActions = useMemo(() => {
    if (!plan) return [];
    const quick = [...plan.snippets, ...plan.pushes, ...plan.questions]
      .sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0))
      .slice(0, 3);
    return [...plan.losses.slice(0, 2), ...quick];
  }, [plan]);
  const totalTasks = plan
    ? plan.losses.length +
      plan.snippets.length +
      plan.pushes.length +
      plan.questions.length +
      plan.cannibals.length +
      plan.traction.length +
      plan.emerging.length
    : 0;

  if (activation.isError && !activation.data) {
    return (
      <div className="px-4 py-4 md:px-6 md:py-6">
        <QueryError
          error={activation.error}
          fallback="No se pudo cargar el panel"
          onRetry={() => void activation.refetch()}
          isRetrying={activation.isFetching}
        />
      </div>
    );
  }
  if (!activation.data) {
    return (
      <div className="px-4 py-4 md:px-6 md:py-6" aria-busy>
        <div className="mx-auto flex max-w-7xl flex-col gap-5">
          <Skeleton className="h-8 w-52" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const gscConnected = activation.data.gsc.connected;
  const ga4 = activation.data.ga4;
  const showGa4 = ga4.connected || !ga4.cardDismissedAt;

  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <PageHeader
          title="Panel"
          description={
            activation.data.domain
              ? `Qué está pasando en ${activation.data.domain} y qué hacer con ello.`
              : "Qué está pasando en tu web y qué hacer con ello."
          }
          actions={
            gscConnected ? (
              <RadarControls
                projectId={projectId}
                filters={filters}
                onChange={update}
                brand={report?.brand}
                fellBack={report?.period.fellBack}
              />
            ) : null
          }
        />

        <WorkspaceMergeBanner />
        <AlertsBanner projectId={projectId} />
        <DashboardOnboarding
          key={projectId}
          projectId={projectId}
          activation={activation.data}
        />

        {!gscConnected ? (
          <GscCard projectId={projectId} connected={false} />
        ) : query.isError ? (
          <QueryError
            variant="card"
            error={query.error}
            fallback="No se pudieron cargar los datos de Search Console."
            onRetry={() => void query.refetch()}
            isRetrying={query.isFetching}
          />
        ) : query.isPending ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-28" />
              ))}
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : query.data && !query.data.connected ? (
          <Card>
            <CardContent className="space-y-3 py-6 text-center">
              <p className="font-medium">
                {query.data.reason === "reconnect"
                  ? "La conexión con Google ha caducado"
                  : "Este proyecto no tiene Search Console conectado"}
              </p>
              <Button
                variant="outline"
                render={
                  <Link to="/p/$projectId/search-performance" params={{ projectId }} />
                }
              >
                Ir a Search Console
              </Button>
            </CardContent>
          </Card>
        ) : report ? (
          <div
            className={`flex flex-col gap-5 ${query.isPlaceholderData ? "opacity-60 transition-opacity" : ""}`}
          >
            <KpiRow report={report} />

            <div className="grid gap-5 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <div>
                    <CardTitle>Qué hacer ahora</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {totalTasks === 0
                        ? "No hay tareas claras en este periodo."
                        : `Las mejores de las ${totalTasks} tareas del plan: lo que se pierde primero y lo más rápido de ganar.`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    render={<Link to="/p/$projectId/action-plan" params={{ projectId }} />}
                  >
                    Abrir el plan
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Button>
                </CardHeader>
                <CardContent>
                  {nextActions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Prueba con un periodo más largo para ver oportunidades.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {nextActions.map((action) => {
                        const meta = KIND_META[action.kind];
                        const Icon = meta.icon;
                        return (
                          <li key={action.id}>
                            <Link
                              to="/p/$projectId/action-plan"
                              params={{ projectId }}
                              className="flex items-start gap-3 py-3 first:pt-0 last:pb-0 hover:bg-muted/40"
                            >
                              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                                <Icon className="size-4" aria-hidden />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                                  {meta.label}
                                </span>
                                <span className="block text-sm leading-snug font-medium">
                                  {action.headline}
                                </span>
                              </span>
                              {action.gain !== null ? (
                                <span
                                  className={`shrink-0 text-sm font-semibold tabular-nums ${action.kind === "loss" ? "text-destructive" : "text-success"}`}
                                >
                                  {action.kind === "loss" ? "−" : "+"}
                                  {integer.format(action.gain)}
                                </span>
                              ) : null}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Mayores cambios</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Páginas que más suben y más bajan en clics.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ChangeList
                    title="Suben"
                    tone="text-success"
                    rows={report.pageChanges.winners.slice(0, 3)}
                  />
                  <ChangeList
                    title="Bajan"
                    tone="text-destructive"
                    rows={report.pageChanges.losers.slice(0, 3)}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <TrendCard projectId={projectId} daily={report.daily} />
              <TopicsCard projectId={projectId} topics={topics.data} loading={topics.isPending} />
            </div>

            {(tracked.data ?? []).length > 0 ? (
              <TrackedCard projectId={projectId} items={tracked.data ?? []} />
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          {overview.data ? (
            <AuditHealthCard projectId={projectId} audit={overview.data.audit} />
          ) : overview.isError ? (
            <QueryError
              error={overview.error}
              fallback="No se pudo cargar la auditoría"
              onRetry={() => void overview.refetch()}
              isRetrying={overview.isFetching}
            />
          ) : (
            <Skeleton className="h-44" />
          )}
          {overview.data && activation.data.domain !== null ? (
            <div className="flex flex-col gap-2">
              <BacklinkPulseCard
                projectId={projectId}
                backlinks={overview.data.backlinks}
                refreshing={refreshBacklinks.isPending}
              />
              <div className="flex items-center justify-between gap-2 px-1">
                <p className="text-xs text-muted-foreground">
                  Se actualiza solo cuando lo pides (cuesta unos 0,02 €).
                </p>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={refreshBacklinks.isPending}
                  onClick={() => refreshBacklinks.mutate()}
                >
                  <RefreshCw
                    className={`size-3 ${refreshBacklinks.isPending ? "animate-spin" : ""}`}
                    aria-hidden
                  />
                  Actualizar backlinks
                </Button>
              </div>
            </div>
          ) : null}
          {showGa4 ? (
            <Ga4Card projectId={projectId} connected={ga4.connected} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

type Report = NonNullable<ReturnType<typeof useRadarReport>["report"]>;

function Delta({
  now,
  before,
  lowerIsBetter,
  asPoints,
}: {
  now: number;
  before: number;
  lowerIsBetter?: boolean;
  asPoints?: boolean;
}) {
  if (before === 0 && now === 0) return null;
  const diff = now - before;
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  const change = relativeChange(now, before);
  const label = asPoints
    ? `${diff > 0 ? "+" : ""}${decimal.format(diff)}`
    : change === null
      ? "nuevo"
      : `${change > 0 ? "+" : ""}${percent.format(change)}`;
  return (
    <span
      className={`text-xs tabular-nums ${
        diff === 0
          ? "text-muted-foreground"
          : better
            ? "text-success"
            : "text-destructive"
      }`}
    >
      {label} vs. periodo anterior
    </span>
  );
}

const sparkConfig = {
  clicks: { label: "Clics", color: "var(--primary)" },
  impressions: { label: "Impresiones", color: "var(--primary)" },
} satisfies ChartConfig;

function Spark({
  data,
  dataKey,
}: {
  data: DailyPoint[];
  dataKey: "clicks" | "impressions";
}) {
  return (
    <ChartContainer config={sparkConfig} className="mt-1 h-10 w-full">
      <LineChart data={data} margin={{ top: 3, right: 0, bottom: 3, left: 0 }}>
        <Line
          dataKey={dataKey}
          stroke={`var(--color-${dataKey})`}
          strokeWidth={1.75}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

function KpiRow({ report }: { report: Report }) {
  const { totals, prevTotals, daily } = report;
  const cards: { label: string; value: string; delta: ReactNode; spark?: ReactNode }[] = [
    {
      label: "Clics",
      value: integer.format(totals.clicks),
      delta: <Delta now={totals.clicks} before={prevTotals.clicks} />,
      spark: <Spark data={daily} dataKey="clicks" />,
    },
    {
      label: "Impresiones",
      value: integer.format(totals.impressions),
      delta: <Delta now={totals.impressions} before={prevTotals.impressions} />,
      spark: <Spark data={daily} dataKey="impressions" />,
    },
    {
      label: "CTR",
      value: percent.format(totals.ctr),
      delta: <Delta now={totals.ctr} before={prevTotals.ctr} />,
    },
    {
      label: "Posición media",
      value: decimal.format(totals.position),
      delta: (
        <Delta now={totals.position} before={prevTotals.position} lowerIsBetter asPoints />
      ),
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="space-y-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {card.label}
            </p>
            <p className="text-2xl leading-tight font-semibold tabular-nums">
              {card.value}
            </p>
            {card.delta}
            {card.spark}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ChangeList({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: string;
  rows: Report["pageChanges"]["winners"];
}) {
  return (
    <div className="space-y-1.5">
      <p className={`text-xs font-semibold tracking-wide uppercase ${tone}`}>{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin cambios relevantes.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {rows.map((row) => (
            <li key={row.key} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0">
                <PageLink url={row.key} />
              </span>
              <span className={`shrink-0 font-medium tabular-nums ${tone}`}>
                {signed(row.clicksDelta)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const trendConfig = {
  clicks: { label: "Este periodo", color: "var(--primary)" },
  prevClicks: { label: "Periodo anterior", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

function TrendCard({
  projectId,
  daily,
}: {
  projectId: string;
  daily: DailyPoint[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolución de clics</CardTitle>
        <p className="text-xs text-muted-foreground">
          Día a día, con el periodo anterior en línea discontinua.
        </p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={trendConfig} className="h-48 w-full">
          <LineChart data={daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <Line
              dataKey="prevClicks"
              stroke="var(--color-prevClicks)"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              dataKey="clicks"
              stroke="var(--color-clicks)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>
        <div className="mt-2 flex justify-end">
          <Button
            size="xs"
            variant="ghost"
            render={<Link to="/p/$projectId/radar" params={{ projectId }} />}
          >
            Ver el Radar SEO
            <ArrowRight className="size-3" aria-hidden />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TopicsCard({
  projectId,
  topics,
  loading,
}: {
  projectId: string;
  topics: Awaited<ReturnType<typeof getTopicsReport>> | undefined;
  loading: boolean;
}) {
  const rows =
    topics && topics.connected
      ? topics.topics.filter((topic) => topic.label !== OTHERS).slice(0, 6)
      : [];
  const max = Math.max(1, ...rows.map((topic) => topic.clicks));
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Temas que más tráfico traen</CardTitle>
          <p className="text-xs text-muted-foreground">
            Tus consultas agrupadas por tema, con su variación.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          render={<Link to="/p/$projectId/topics" params={{ projectId }} />}
        >
          Ver temas
          <ArrowRight className="size-3.5" aria-hidden />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay datos suficientes para agrupar por temas.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((topic) => {
              const delta = topic.clicks - topic.prev.clicks;
              return (
                <li key={topic.id} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{topic.label}</span>
                    <span className="shrink-0 tabular-nums">
                      {integer.format(topic.clicks)}
                      <span
                        className={`ml-2 text-xs ${delta === 0 ? "text-muted-foreground" : delta > 0 ? "text-success" : "text-destructive"}`}
                      >
                        {signed(delta)}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(2, (topic.clicks / max) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TrackedCard({
  projectId,
  items,
}: {
  projectId: string;
  items: Awaited<ReturnType<typeof listTrackedActions>>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>Resultado de tus últimas mejoras</CardTitle>
          <p className="text-xs text-muted-foreground">
            Lo que pasó con las tareas que marcaste como hechas.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          render={<Link to="/p/$projectId/action-plan" params={{ projectId }} />}
        >
          Ver todas
          <ArrowRight className="size-3.5" aria-hidden />
        </Button>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const verdict = item.impact ? VERDICT_LABEL[item.impact.verdict] : null;
            const clicks = item.impact?.clicks;
            return (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="min-w-0 text-sm">
                  <span className="block truncate font-medium">
                    {item.title ?? item.query ?? item.page ?? KIND_META[item.kind].label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {KIND_META[item.kind].label} ·{" "}
                    {verdict
                      ? clicks && clicks.changePct !== null
                        ? `clics por día ${clicks.changePct > 0 ? "+" : ""}${percent.format(clicks.changePct)}`
                        : "medido"
                      : item.waitingDays > 0
                        ? `midiendo, faltan ~${item.waitingDays} días`
                        : "sin medir"}
                  </span>
                </span>
                {verdict ? (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${verdict.className}`}
                  >
                    {verdict.text}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {items.filter((item) => item.impact).length} de {items.length} ya
          medidas.
        </p>
      </CardContent>
    </Card>
  );
}
