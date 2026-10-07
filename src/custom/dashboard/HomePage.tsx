import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Line, LineChart, YAxis } from "recharts";
import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  ExternalLink,
  FileSearch,
  Link2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { GscCard } from "@/client/features/dashboard/DashboardCards";
import { DashboardOnboarding } from "@/client/features/dashboard/DashboardOnboarding";
import { WorkspaceMergeBanner } from "@/client/features/dashboard/WorkspaceMergeBanner";
import { buildActions } from "@/custom/radar/actions";
import {
  KIND_META,
  taskTitle,
  tileHeadline,
} from "@/custom/radar/client/ActionPlan";
import { AlertsBanner } from "@/custom/radar/client/AlertsBanner";
import { RadarControls } from "@/custom/radar/client/RadarControls";
import { periodInput } from "@/custom/radar/client/useRadarFilters";
import { useRadarReport } from "@/custom/radar/client/useRadarReport";
import {
  decimal,
  integer,
  pathOf,
  percent,
  relativeChange,
  signed,
} from "@/custom/radar/format";
import type { BandMove, DailyPoint } from "@/custom/radar/radarAnalysis";
import type { Verdict } from "@/custom/radar/trackingImpact";
import {
  getDashboardActivation,
  getDashboardOverview,
  refreshDashboardBacklinkSnapshot,
} from "@/serverFunctions/dashboard";
import { getRadarPageSignals } from "@/serverFunctions/radar";
import { listTrackedActions } from "@/serverFunctions/radarTracking";
import { getTopicsReport } from "@/serverFunctions/radarTopics";

const OTHERS = "Otros temas";

const VERDICT_LABEL: Record<Verdict, { text: string; className: string }> = {
  mejora: { text: "Ha mejorado", className: "bg-success/10 text-success" },
  empeora: {
    text: "Ha empeorado",
    className: "bg-destructive/10 text-destructive",
  },
  sin_cambio: {
    text: "Sin cambio notable",
    className: "bg-muted text-muted-foreground",
  },
  pocos_datos: { text: "Pocos datos", className: "bg-warning/10 text-warning" },
};

/** A task of the action plan, opened on its own card in a new tab. */
function taskHref(projectId: string, id: string): string {
  return `/p/${projectId}/action-plan?task=${encodeURIComponent(id)}`;
}

/**
 * The project's home: what is happening (figures, changes, alerts), what to do
 * about it (the best tasks of the action plan), how earlier improvements
 * worked, where the queries stand and the technical health. It replaces
 * OpenSEO's dashboard route at build time (custom/i18n/patches.mjs) and reuses
 * its onboarding and Search Console connection card. Kept compact on purpose:
 * everything fits in about one screen.
 */
export function HomePage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const { filters, update, query, report } = useRadarReport(projectId);
  const [tasksTab, setTasksTab] = useState<"todo" | "done">("todo");

  const activation = useQuery({
    queryKey: ["dashboardActivation", projectId],
    queryFn: () => getDashboardActivation({ data: { projectId } }),
  });
  const overview = useQuery({
    queryKey: ["dashboardOverview", projectId],
    queryFn: () => getDashboardOverview({ data: { projectId } }),
  });
  const topicInput = {
    ...periodInput(filters),
    includeBrand: filters.includeBrand,
  };
  const topics = useQuery({
    queryKey: ["radar-topics", projectId, topicInput],
    queryFn: () => getTopicsReport({ data: { projectId, ...topicInput } }),
    enabled: report !== null,
    staleTime: 5 * 60_000,
  });
  const tracked = useQuery({
    queryKey: ["radar-tracked-home", projectId],
    queryFn: () => listTrackedActions({ data: { projectId, limit: 4 } }),
    staleTime: 5 * 60_000,
  });

  // OpenSEO refreshed the backlink summary by itself on every visit, which
  // costs a little each day. Here it only happens when asked.
  const refreshBacklinks = useMutation({
    mutationFn: () => refreshDashboardBacklinkSnapshot({ data: { projectId } }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["dashboardOverview", projectId],
      }),
  });

  const plan = useMemo(() => (report ? buildActions(report) : null), [report]);
  const nextActions = useMemo(() => {
    if (!plan) return [];
    const quick = [...plan.snippets, ...plan.pushes, ...plan.questions]
      .sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0))
      .slice(0, 4);
    return [...plan.losses.slice(0, 3), ...quick];
  }, [plan]);
  // The titles of the pages the Panel mentions, so rows say what the page is
  // about and not only its address (a handful of live reads, cached).
  const titleUrls = useMemo(() => {
    const urls = new Set<string>();
    for (const action of nextActions) {
      if (action.kind !== "cannibal" && action.page) urls.add(action.page);
    }
    for (const row of [
      ...(report?.pageChanges.winners.slice(0, 3) ?? []),
      ...(report?.pageChanges.losers.slice(0, 3) ?? []),
    ]) {
      urls.add(row.key);
    }
    return [...urls];
  }, [nextActions, report]);
  const titles = useQuery({
    queryKey: ["radar-signals", projectId, titleUrls],
    queryFn: () =>
      getRadarPageSignals({ data: { projectId, urls: titleUrls } }),
    enabled: titleUrls.length > 0,
    staleTime: 10 * 60_000,
  });
  const signals = useMemo(
    () => new Map((titles.data?.signals ?? []).map((item) => [item.url, item])),
    [titles.data],
  );
  const totalTasks = plan
    ? plan.losses.length +
      plan.snippets.length +
      plan.pushes.length +
      plan.questions.length +
      plan.cannibals.length +
      plan.traction.length +
      plan.emerging.length
    : 0;
  const doneItems = tracked.data ?? [];

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
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <Skeleton className="h-8 w-52" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const gscConnected = activation.data.gsc.connected;

  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-5 md:pb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
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
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-24" />
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
                  <Link
                    to="/p/$projectId/search-performance"
                    params={{ projectId }}
                  />
                }
              >
                Ir a Search Console
              </Button>
            </CardContent>
          </Card>
        ) : report ? (
          <div
            className={`flex flex-col gap-4 ${query.isPlaceholderData ? "opacity-60 transition-opacity" : ""}`}
          >
            <KpiRow report={report} />

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <CardTitle>Qué hacer ahora</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {tasksTab === "todo"
                        ? totalTasks === 0
                          ? "No hay tareas claras en este periodo."
                          : `Las tareas con más impacto de tu plan (${totalTasks} en total): primero lo que se pierde, luego lo más rápido de ganar. Cada una se abre en una pestaña nueva.`
                        : "Qué pasó con las tareas que marcaste como hechas."}
                    </p>
                  </div>
                  {doneItems.length > 0 ? (
                    <Tabs
                      value={tasksTab}
                      onValueChange={(value) =>
                        setTasksTab(value as typeof tasksTab)
                      }
                    >
                      <TabsList>
                        <TabsTrigger value="todo">Por hacer</TabsTrigger>
                        <TabsTrigger value="done">Hechas</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {tasksTab === "done" ? (
                    <DoneList items={doneItems} />
                  ) : nextActions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Prueba con un periodo más largo para ver oportunidades.
                    </p>
                  ) : (
                    <>
                      <ul className="space-y-1">
                        {nextActions.map((action) => {
                          const meta = KIND_META[action.kind];
                          const Icon = meta.icon;
                          const isLoss = action.kind === "loss";
                          return (
                            <li key={action.id}>
                              <a
                                href={taskHref(projectId, action.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                              >
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                                  <Icon className="size-4" aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="line-clamp-2 block text-sm leading-snug font-semibold">
                                    {tileHeadline(action)}
                                  </span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {taskTitle(action, signals)}
                                  </span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {meta.label} ·{" "}
                                    {action.stats
                                      .slice(0, 3)
                                      .map(
                                        (stat) => `${stat.label} ${stat.value}`,
                                      )
                                      .join(" · ")}
                                  </span>
                                </span>
                                {action.gain !== null ? (
                                  <span className="shrink-0 text-right">
                                    <span
                                      className={`block text-base leading-tight font-semibold tabular-nums ${isLoss ? "text-destructive" : "text-success"}`}
                                    >
                                      {isLoss ? "−" : "+"}
                                      {integer.format(action.gain)}
                                    </span>
                                    <span className="block text-[11px] text-muted-foreground">
                                      {isLoss
                                        ? "clics perdidos"
                                        : "clics posibles"}{" "}
                                      en {report.period.days} días
                                    </span>
                                  </span>
                                ) : null}
                                <ExternalLink
                                  className="size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground"
                                  aria-hidden
                                />
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="mt-2 flex justify-end">
                        <Button
                          size="xs"
                          variant="ghost"
                          render={
                            <a
                              href={`/p/${projectId}/action-plan`}
                              target="_blank"
                              rel="noopener noreferrer"
                            />
                          }
                        >
                          Ver las {totalTasks} tareas
                          <ExternalLink className="size-3" aria-hidden />
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <ChangesCard
                winners={report.pageChanges.winners.slice(0, 3)}
                losers={report.pageChanges.losers.slice(0, 3)}
                signals={signals}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <BandsCard projectId={projectId} report={report} />
              <TopicsCard
                projectId={projectId}
                topics={topics.data}
                loading={topics.isPending}
              />
              <HealthCard
                projectId={projectId}
                backlinks={overview.data?.backlinks ?? null}
                showBacklinks={activation.data.domain !== null}
                ga4Connected={activation.data.ga4.connected}
                loading={overview.isPending}
                refreshing={refreshBacklinks.isPending}
                onRefresh={() => refreshBacklinks.mutate()}
              />
            </div>
          </div>
        ) : null}

        <DashboardOnboarding
          key={projectId}
          projectId={projectId}
          activation={activation.data}
        />
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
      {label}
    </span>
  );
}

const sparkConfig = {
  clicks: { label: "Clics", color: "var(--primary)" },
  impressions: { label: "Impresiones", color: "var(--primary)" },
  ctr: { label: "CTR", color: "var(--primary)" },
  position: { label: "Posición", color: "var(--primary)" },
} satisfies ChartConfig;

type SparkKey = keyof typeof sparkConfig;

/** A tiny line of the daily figure. A lower position is better, so that
 *  line is drawn upside down: up always means better. */
function Spark({
  data,
  dataKey,
}: {
  data: Record<string, unknown>[];
  dataKey: SparkKey;
}) {
  return (
    <ChartContainer config={sparkConfig} className="h-7 w-full">
      <LineChart data={data} margin={{ top: 3, right: 0, bottom: 3, left: 0 }}>
        <YAxis
          hide
          reversed={dataKey === "position"}
          domain={["dataMin", "dataMax"]}
        />
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
  const { totals, prevTotals } = report;
  const daily = report.daily.map((point) => ({
    ...point,
    ctr: point.impressions > 0 ? point.clicks / point.impressions : 0,
  }));
  const cards: {
    label: string;
    value: string;
    delta: ReactNode;
    spark?: ReactNode;
  }[] = [
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
      spark: <Spark data={daily} dataKey="ctr" />,
    },
    {
      label: "Posición media",
      value: decimal.format(totals.position),
      delta: (
        <Delta
          now={totals.position}
          before={prevTotals.position}
          lowerIsBetter
          asPoints
        />
      ),
      spark: <Spark data={daily} dataKey="position" />,
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="space-y-0.5 py-0.5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {card.label}
            </p>
            <p className="flex items-baseline gap-2">
              <span className="text-2xl leading-tight font-semibold tabular-nums">
                {card.value}
              </span>
              {card.delta}
            </p>
            {card.spark}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

type ChangeRows = Report["pageChanges"]["winners"];
type PageSignalsLite = Map<string, { title: string | null; ok: boolean }>;

/** The pages that gained and lost the most clicks, side by side in colour:
 *  who they are, how much they moved and how it compares to the others. */
function ChangesCard({
  winners,
  losers,
  signals,
}: {
  winners: ChangeRows;
  losers: ChangeRows;
  signals: PageSignalsLite;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Mayores cambios</CardTitle>
        <p className="text-xs text-muted-foreground">
          Las páginas que más suben y más bajan en clics frente al periodo
          anterior.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ChangeGroup up rows={winners} signals={signals} />
        <ChangeGroup rows={losers} signals={signals} />
      </CardContent>
    </Card>
  );
}

function ChangeGroup({
  up,
  rows,
  signals,
}: {
  up?: boolean;
  rows: ChangeRows;
  signals: PageSignalsLite;
}) {
  const Icon = up ? TrendingUp : TrendingDown;
  const total = rows.reduce((sum, row) => sum + row.clicksDelta, 0);
  const biggest = Math.max(1, ...rows.map((row) => Math.abs(row.clicksDelta)));
  const tone = up
    ? {
        wash: "bg-success/5 border-success/20",
        chip: "bg-success/15 text-success",
        bar: "bg-success",
        text: "text-success",
      }
    : {
        wash: "bg-destructive/5 border-destructive/20",
        chip: "bg-destructive/15 text-destructive",
        bar: "bg-destructive",
        text: "text-destructive",
      };
  return (
    <section className={`rounded-xl border ${tone.wash}`}>
      <header className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tracking-wide uppercase ${tone.chip}`}
        >
          <Icon className="size-3.5" aria-hidden />
          {up ? "Suben" : "Bajan"}
        </span>
        {rows.length > 0 ? (
          <span className={`text-sm font-bold tabular-nums ${tone.text}`}>
            {signed(total)} clics
          </span>
        ) : null}
      </header>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          Sin cambios relevantes.
        </p>
      ) : (
        <ol className="space-y-0.5 p-1.5">
          {rows.map((row, index) => {
            const info = signals.get(row.key);
            const title = info?.ok && info.title ? info.title : pathOf(row.key);
            return (
              <li key={row.key}>
                <a
                  href={row.key}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-lg px-2 py-1.5 hover:bg-card"
                >
                  <span className="flex items-start gap-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background tabular-nums">
                      {index + 1}
                    </span>
                    <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug font-medium text-foreground group-hover:underline">
                      {title}
                    </span>
                    <span
                      className={`shrink-0 text-sm font-bold tabular-nums ${tone.text}`}
                    >
                      {signed(row.clicksDelta)}
                    </span>
                  </span>
                  <span className="mt-1.5 ml-7 block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className={`block h-full rounded-full ${tone.bar}`}
                      style={{
                        width: `${Math.max(6, (Math.abs(row.clicksDelta) / biggest) * 100)}%`,
                      }}
                    />
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function DoneList({
  items,
}: {
  items: Awaited<ReturnType<typeof listTrackedActions>>;
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const verdict = item.impact ? VERDICT_LABEL[item.impact.verdict] : null;
        const clicks = item.impact?.clicks;
        return (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
          >
            <span className="min-w-0 text-sm">
              <span className="block truncate font-medium">
                {item.title ??
                  item.query ??
                  item.page ??
                  KIND_META[item.kind].label}
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
  );
}

/** How many queries sit in each position band, now and before: the shape of
 *  the search presence, and how much of it is within reach. */
function BandsCard({
  projectId,
  report,
}: {
  projectId: string;
  report: Report;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const max = Math.max(1, ...report.bands.map((band) => band.queries));
  const reachGain = report.nearTop.reduce(
    (sum, item) => sum + item.potentialClicks,
    0,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dónde posicionan tus consultas</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cuántas consultas tienes en cada franja de posición y cuántas han
          entrado o salido. Pulsa una franja para ver cuáles.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5">
          {report.bands.map((band, index) => {
            const isOpen = open === index;
            const moved = band.enteredCount + band.leftCount > 0;
            return (
              <li key={band.label} className="rounded-lg border border-border">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  disabled={!moved}
                  onClick={() => setOpen(isOpen ? null : index)}
                  className="w-full space-y-1.5 px-3 py-2 text-left disabled:cursor-default"
                >
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{band.label}</span>
                    <span className="flex items-baseline gap-2 tabular-nums">
                      <strong>{integer.format(band.queries)}</strong>
                      <span className="text-xs font-semibold text-success">
                        +{integer.format(band.enteredCount)}
                      </span>
                      <span className="text-xs font-semibold text-destructive">
                        −{integer.format(band.leftCount)}
                      </span>
                      {moved ? (
                        <ChevronDown
                          className={`size-3.5 self-center text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                          aria-hidden
                        />
                      ) : null}
                    </span>
                  </span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.max(2, (band.queries / max) * 100)}%`,
                      }}
                    />
                  </span>
                </button>
                {isOpen ? (
                  <div className="space-y-3 border-t border-border bg-muted/30 px-3 py-2.5">
                    <MoveList
                      title="Han entrado"
                      total={band.enteredCount}
                      moves={band.entered}
                      up
                    />
                    <MoveList
                      title="Han salido"
                      total={band.leftCount}
                      moves={band.left}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {report.nearTop.length > 0 ? (
          <a
            href={`/p/${projectId}/action-plan`}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-md bg-muted/50 px-3 py-2 text-xs hover:bg-muted"
          >
            <strong>{report.nearTop.length} consultas</strong> están cerca del
            top 3: subirlas valdría hasta unos{" "}
            <strong>+{integer.format(reachGain)} clics</strong>.
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** The queries that moved into or out of a position band, biggest first. */
function MoveList({
  title,
  total,
  moves,
  up,
}: {
  title: string;
  total: number;
  moves: BandMove[];
  up?: boolean;
}) {
  if (total === 0) return null;
  return (
    <div className="space-y-1">
      <p
        className={`text-[11px] font-bold tracking-wide uppercase ${up ? "text-success" : "text-destructive"}`}
      >
        {title} ({integer.format(total)})
      </p>
      <ul className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {moves.map((move) => (
          <li
            key={move.query}
            className="flex items-baseline justify-between gap-2 text-xs"
          >
            <span className="min-w-0 truncate font-medium" title={move.query}>
              {move.query}
            </span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {move.prevPosition === null
                ? "nueva"
                : integer.format(move.prevPosition)}
              {" → "}
              {move.position === null ? "-" : integer.format(move.position)}
            </span>
          </li>
        ))}
      </ul>
      {total > moves.length ? (
        <p className="text-[11px] text-muted-foreground">
          Mostrando las {integer.format(moves.length)} con más impresiones de{" "}
          {integer.format(total)}
        </p>
      ) : null}
    </div>
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
      ? topics.topics.filter((topic) => topic.label !== OTHERS).slice(0, 5)
      : [];
  const max = Math.max(1, ...rows.map((topic) => topic.clicks));
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-0.5">
          <CardTitle>Temas que más tráfico traen</CardTitle>
          <p className="text-xs text-muted-foreground">
            Tus consultas agrupadas por tema, con su variación.
          </p>
        </div>
        <Button
          size="xs"
          variant="ghost"
          render={<Link to="/p/$projectId/topics" params={{ projectId }} />}
        >
          Ver
          <ArrowRight className="size-3" aria-hidden />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay datos suficientes para agrupar por temas.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((topic) => {
              const delta = topic.clicks - topic.prev.clicks;
              return (
                <li key={topic.id} className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{topic.label}</span>
                    <span className="shrink-0 tabular-nums">
                      {integer.format(topic.clicks)}
                      <span
                        className={`ml-1.5 text-xs ${delta === 0 ? "text-muted-foreground" : delta > 0 ? "text-success" : "text-destructive"}`}
                      >
                        {signed(delta)}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.max(2, (topic.clicks / max) * 100)}%`,
                      }}
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

type Overview = Awaited<ReturnType<typeof getDashboardOverview>>;

function HealthCard({
  projectId,
  backlinks,
  showBacklinks,
  ga4Connected,
  loading,
  refreshing,
  onRefresh,
}: {
  projectId: string;
  backlinks: Overview["backlinks"];
  showBacklinks: boolean;
  ga4Connected: boolean;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const number = (value: number | null) =>
    value === null ? "—" : integer.format(value);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Salud técnica</CardTitle>
        <p className="text-xs text-muted-foreground">
          Tus enlaces entrantes, las conexiones y qué ve Google de tu web.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            {showBacklinks ? (
              <HealthTile
                icon={Link2}
                tone="info"
                title="Backlinks"
                status={
                  backlinks
                    ? {
                        text: backlinks.stale ? "Desactualizado" : "Al día",
                        ok: !backlinks.stale,
                      }
                    : { text: "Sin datos", ok: false }
                }
                action={
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={refreshing}
                    onClick={onRefresh}
                    title="Cuesta unos 0,02 €"
                  >
                    <RefreshCw
                      className={`size-3 ${refreshing ? "animate-spin" : ""}`}
                      aria-hidden
                    />
                    Actualizar
                  </Button>
                }
              >
                {backlinks ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Figure
                      label="Dominios que te enlazan"
                      value={number(backlinks.referringDomains)}
                      gained={backlinks.newReferringDomains}
                      lost={backlinks.lostReferringDomains}
                    />
                    <Figure
                      label="Enlaces totales"
                      value={number(backlinks.backlinks)}
                      gained={backlinks.newBacklinks}
                      lost={backlinks.lostBacklinks}
                    />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Pulsa «Actualizar» para traer el resumen de enlaces.
                  </p>
                )}
              </HealthTile>
            ) : null}

            <HealthTile
              icon={BarChart3}
              tone="warning"
              title="Google Analytics"
              status={
                ga4Connected
                  ? { text: "Conectado", ok: true }
                  : { text: "Sin conectar", ok: false }
              }
              action={
                <Button
                  size="xs"
                  variant={ga4Connected ? "outline" : "default"}
                  render={
                    <Link to="/p/$projectId/settings" params={{ projectId }} />
                  }
                >
                  {ga4Connected ? "Ajustes" : "Conectar"}
                </Button>
              }
            >
              <p className="text-xs text-muted-foreground">
                {ga4Connected
                  ? "Cruzas visitas reales con lo que ves en Search Console."
                  : "Conéctalo para cruzar las visitas reales con Search Console."}
              </p>
            </HealthTile>

            <HealthTile
              icon={FileSearch}
              tone="success"
              title="Indexación y sitemap"
              action={
                <Button
                  size="xs"
                  variant="outline"
                  render={
                    <Link to="/p/$projectId/indexing" params={{ projectId }} />
                  }
                >
                  Revisar
                </Button>
              }
            >
              <p className="text-xs text-muted-foreground">
                Comprueba qué páginas de tu sitemap tiene Google indexadas.
              </p>
            </HealthTile>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const TILE_TONES = {
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
} as const;

/** One row of the technical health card: icon, name, status and action. */
function HealthTile({
  icon: Icon,
  tone,
  title,
  status,
  action,
  children,
}: {
  icon: LucideIcon;
  tone: keyof typeof TILE_TONES;
  title: string;
  status?: { text: string; ok: boolean };
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${TILE_TONES[tone]}`}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-tight font-semibold">{title}</p>
          {status ? (
            <span
              className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.ok ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
            >
              <span
                className={`size-1.5 rounded-full ${status.ok ? "bg-success" : "bg-warning"}`}
                aria-hidden
              />
              {status.text}
            </span>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** A headline number with what was gained and lost since the last summary. */
function Figure({
  label,
  value,
  gained,
  lost,
}: {
  label: string;
  value: string;
  gained: number | null;
  lost: number | null;
}) {
  return (
    <div className="rounded-lg bg-card px-3 py-2">
      <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
      <p className="text-xl leading-tight font-bold tabular-nums">{value}</p>
      {gained !== null || lost !== null ? (
        <p className="mt-0.5 flex gap-2 text-[11px] font-semibold tabular-nums">
          {gained !== null ? (
            <span className="text-success">+{integer.format(gained)}</span>
          ) : null}
          {lost !== null ? (
            <span className="text-destructive">−{integer.format(lost)}</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
