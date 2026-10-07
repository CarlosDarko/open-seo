import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Area, AreaChart } from "recharts";
import { ArrowDownRight, ArrowUpRight, Bell, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/client/components/ui/chart";
import { Skeleton } from "@/client/components/ui/skeleton";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import type { ProjectSummary } from "@/client/features/projects/types";
import { setLastProjectId } from "@/client/lib/active-project";
import {
  decimal,
  integer,
  pathOf,
  percent,
  relativeChange,
  signed,
} from "@/custom/radar/format";
import { getHubSummary, type HubSummary } from "@/serverFunctions/hub";

const BAND_COLORS = [
  "bg-success",
  "bg-info",
  "bg-warning",
  "bg-muted-foreground/40",
];
const BAND_SHORT = ["1-3", "4-10", "11-20", "21+"];

const chartConfig = {
  clicks: { label: "Clics", color: "var(--primary)" },
  prevClicks: { label: "Periodo anterior", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

/**
 * The landing page: every project as a card with its trend, how its queries
 * spread over the search results, and what moved the most. Replaces
 * OpenSEO's "open the last project" redirect at build time
 * (custom/i18n/patches.mjs) and is where the logo leads.
 */
export function HubPage() {
  const projectsQuery = useQuery(projectsQueryOptions());
  const projects = useMemo(
    () =>
      [...(projectsQuery.data ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
      ),
    [projectsQuery.data],
  );
  const summaries = useQueries({
    queries: projects.map((project) => ({
      queryKey: ["hub-summary", project.id],
      queryFn: () => getHubSummary({ data: { projectId: project.id } }),
      staleTime: 10 * 60_000,
      retry: false,
    })),
  });

  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <PageHeader
          title="Tus proyectos"
          description="Cómo va cada web en los últimos 28 días (sin consultas de marca) frente a los 28 anteriores. Haz clic en una para abrirla."
        />

        {projectsQuery.isError ? (
          <QueryError
            variant="card"
            error={projectsQuery.error}
            fallback="No se pudieron cargar los proyectos"
            onRetry={() => void projectsQuery.refetch()}
            isRetrying={projectsQuery.isFetching}
          />
        ) : projectsQuery.isPending ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-80" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project, index) => (
              <ProjectCard
                key={project.id}
                project={project}
                summary={summaries[index]?.data}
                loading={summaries[index]?.isPending ?? true}
                failed={summaries[index]?.isError ?? false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  const change = relativeChange(now, before);
  if (change === null) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
        change === 0
          ? "bg-muted text-muted-foreground"
          : change > 0
            ? "bg-success/10 text-success"
            : "bg-destructive/10 text-destructive"
      }`}
    >
      {change > 0 ? "+" : ""}
      {percent.format(change)}
    </span>
  );
}

function ProjectCard({
  project,
  summary,
  loading,
  failed,
}: {
  project: ProjectSummary;
  summary: HubSummary | undefined;
  loading: boolean;
  failed: boolean;
}) {
  const ok = summary?.status === "ok" ? summary : null;
  return (
    <Card className="group relative overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              {/* The whole card is the link. */}
              <Link
                to="/p/$projectId"
                params={{ projectId: project.id }}
                onClick={() => setLastProjectId(project.id)}
                className="after:absolute after:inset-0 after:content-['']"
              >
                {project.name}
              </Link>
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {project.domain ?? "Sin dominio"}
            </p>
          </div>
          {ok && ok.unseenAlerts > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
              <Bell className="size-3" aria-hidden />
              {ok.unseenAlerts}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : ok ? (
          <SummaryBody summary={ok} />
        ) : (
          <NoData
            project={project}
            status={
              failed || summary?.status === "ok"
                ? "error"
                : (summary?.status ?? "none")
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

function SummaryBody({
  summary,
}: {
  summary: Extract<HubSummary, { status: "ok" }>;
}) {
  const totalQueries = summary.bands.reduce((sum, band) => sum + band.queries, 0);
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Clics (28 días)
          </p>
          <p className="flex items-baseline gap-2">
            <span className="text-3xl leading-tight font-bold tabular-nums">
              {integer.format(summary.clicks)}
            </span>
            <Delta now={summary.clicks} before={summary.prevClicks} />
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Posición
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {decimal.format(summary.position)}
          </p>
          <p
            className={`text-xs tabular-nums ${
              summary.position < summary.prevPosition
                ? "text-success"
                : summary.position > summary.prevPosition
                  ? "text-destructive"
                  : "text-muted-foreground"
            }`}
          >
            {summary.position < summary.prevPosition ? "▲" : summary.position > summary.prevPosition ? "▼" : "="}{" "}
            {decimal.format(Math.abs(summary.position - summary.prevPosition))}
          </p>
        </div>
      </div>

      <ChartContainer config={chartConfig} className="h-20 w-full">
        <AreaChart
          data={summary.daily}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        >
          <Area
            dataKey="prevClicks"
            stroke="var(--color-prevClicks)"
            strokeDasharray="3 3"
            strokeWidth={1}
            fill="none"
            dot={false}
            isAnimationActive={false}
          />
          <Area
            dataKey="clicks"
            stroke="var(--color-clicks)"
            strokeWidth={2}
            fill="var(--color-clicks)"
            fillOpacity={0.12}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>

      {totalQueries > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            Consultas por posición
          </p>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {summary.bands.map((band, index) => (
              <div
                key={band.label}
                className={BAND_COLORS[index]}
                style={{ width: `${(band.queries / totalQueries) * 100}%` }}
                title={`${band.label}: ${integer.format(band.queries)}`}
              />
            ))}
          </div>
          <div className="flex justify-between gap-1 text-[11px] text-muted-foreground tabular-nums">
            {summary.bands.map((band, index) => (
              <span key={band.label} className="inline-flex items-center gap-1">
                <span
                  className={`size-2 rounded-full ${BAND_COLORS[index]}`}
                  aria-hidden
                />
                {BAND_SHORT[index]}:{" "}
                <strong className="text-foreground">
                  {integer.format(band.queries)}
                </strong>
                {index === 0 && band.queries !== band.prevQueries ? (
                  <span
                    className={
                      band.queries > band.prevQueries
                        ? "text-success"
                        : "text-destructive"
                    }
                  >
                    ({signed(band.queries - band.prevQueries)})
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <ul className="space-y-1.5 border-t border-border pt-3 text-sm">
        {summary.riser ? (
          <Insight
            up
            url={summary.riser.url}
            delta={summary.riser.delta}
          />
        ) : null}
        {summary.faller ? (
          <Insight url={summary.faller.url} delta={summary.faller.delta} />
        ) : null}
        {!summary.riser && !summary.faller ? (
          <li className="text-xs text-muted-foreground">
            Sin cambios relevantes entre periodos.
          </li>
        ) : null}
      </ul>
    </>
  );
}

function Insight({
  up,
  url,
  delta,
}: {
  up?: boolean;
  url: string;
  delta: number;
}) {
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <li className="flex items-center gap-2">
      <span
        className={`flex size-5 shrink-0 items-center justify-center rounded-full ${up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs">
        {pathOf(url)}
      </span>
      <span
        className={`shrink-0 text-xs font-semibold tabular-nums ${up ? "text-success" : "text-destructive"}`}
      >
        {signed(delta)}
      </span>
    </li>
  );
}

function NoData({
  project,
  status,
}: {
  project: ProjectSummary;
  status: "none" | "reconnect" | "error";
}) {
  const text =
    status === "reconnect"
      ? "La conexión con Google ha caducado: vuelve a conectar Search Console."
      : status === "error"
        ? "No se pudieron cargar los datos de esta web ahora mismo."
        : "Conecta Search Console para ver aquí su evolución y sus avisos.";
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-4 text-center">
      <TriangleAlert
        className={`mx-auto size-5 ${status === "none" ? "text-muted-foreground" : "text-warning"}`}
        aria-hidden
      />
      <p className="text-sm text-muted-foreground">{text}</p>
      {status !== "error" ? (
        <Button
          size="sm"
          variant="outline"
          className="relative z-10"
          render={
            <Link
              to="/p/$projectId/search-performance"
              params={{ projectId: project.id }}
              onClick={() => setLastProjectId(project.id)}
            />
          }
        >
          {status === "reconnect" ? "Reconectar" : "Conectar"}
        </Button>
      ) : null}
    </div>
  );
}
