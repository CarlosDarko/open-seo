import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Skeleton } from "@/client/components/ui/skeleton";
import { actionKey } from "@/custom/radar/actionKey";
import {
  buildActions,
  type Action,
  type ActionKind,
  type Effort,
} from "@/custom/radar/actions";
import {
  ActionCard,
  KIND_META,
  KIND_ORDER,
  usePlanSignals,
} from "@/custom/radar/client/ActionPlan";
import { AlertsBanner } from "@/custom/radar/client/AlertsBanner";
import { RadarControls } from "@/custom/radar/client/RadarControls";
import { TrackedList } from "@/custom/radar/client/TrackedList";
import { useRadarReport } from "@/custom/radar/client/useRadarReport";
import { integer } from "@/custom/radar/format";
import {
  listTrackedActions,
  markActionDone,
} from "@/serverFunctions/radarTracking";

const TILE_TONE: Record<string, string> = {
  destructive: "text-destructive bg-destructive/10",
  primary: "text-primary bg-primary/10",
  success: "text-success bg-success/10",
  info: "text-info bg-info/10",
  warning: "text-warning bg-warning/10",
};

const EMPTY_PLAN = {
  losses: [],
  snippets: [],
  pushes: [],
  questions: [],
  cannibals: [],
  traction: [],
  emerging: [],
};

export function ActionPlanPage({ projectId }: { projectId: string }) {
  const { filters, update, query, report } = useRadarReport(projectId);
  const queryClient = useQueryClient();
  const [view, setView] = useState<"todo" | "done">("todo");
  const [filter, setFilter] = useState<ActionKind | "all">("all");
  const [effort, setEffort] = useState<Effort | "all">("all");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const tracked = useQuery({
    queryKey: ["radar-tracked", projectId],
    queryFn: () => listTrackedActions({ data: { projectId } }),
    staleTime: 5 * 60_000,
  });
  const doneKeys = useMemo(
    () => new Set((tracked.data ?? []).map((item) => item.key)),
    [tracked.data],
  );
  const markDone = useMutation({
    mutationFn: (input: { action: Action; title: string | null }) =>
      markActionDone({
        data: {
          projectId,
          kind: input.action.kind,
          page: input.action.page,
          query: input.action.query,
          title: input.title,
        },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["radar-tracked", projectId] }),
  });

  const plan = useMemo(() => (report ? buildActions(report) : null), [report]);
  const { signals, loading } = usePlanSignals(projectId, plan ?? EMPTY_PLAN);

  // Tasks already marked as done leave the list and move to "Hechas".
  const matches = (action: Action) =>
    !doneKeys.has(actionKey(action)) &&
    (effort === "all" || action.effort === effort);

  const counts = KIND_ORDER.map((kind) => ({
    kind,
    count: plan ? plan[KIND_META[kind].planKey].filter(matches).length : 0,
  }));
  const effortCounts = (["bajo", "medio", "alto"] as const).map((level) => ({
    level,
    count: plan
      ? KIND_ORDER.reduce(
          (sum, kind) =>
            sum +
            plan[KIND_META[kind].planKey].filter(
              (a) => !doneKeys.has(actionKey(a)) && a.effort === level,
            ).length,
          0,
        )
      : 0,
  }));
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  const quickGain = plan
    ? [...plan.snippets, ...plan.pushes, ...plan.questions]
        .filter(matches)
        .reduce((sum, action) => sum + (action.gain ?? 0), 0)
    : 0;
  const visibleIds = plan
    ? KIND_ORDER.filter((kind) => filter === "all" || filter === kind).flatMap(
        (kind) =>
          plan[KIND_META[kind].planKey].filter(matches).map((action) => action.id),
      )
    : [];
  const allOpen =
    visibleIds.length > 0 && visibleIds.every((id) => openIds.has(id));

  const toggle = (id: string) =>
    setOpenIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        title="Plan de acción"
        description="Tareas concretas para mejorar el SEO, agrupadas por tipo. Cada una dice qué hacer y, al desplegarla, por qué y cómo. Márcalas como hechas para medir su efecto semanas después. Datos de Search Console y lectura de tu web: sin gasto en DataForSEO."
        actions={
          <RadarControls
            projectId={projectId}
            filters={filters}
            onChange={update}
            brand={report?.brand}
            fellBack={report?.period.fellBack}
          />
        }
      />

      {query.isError ? (
        <QueryError
          variant="card"
          error={query.error}
          fallback="No se pudieron cargar los datos de Search Console."
          onRetry={() => void query.refetch()}
          isRetrying={query.isFetching}
        />
      ) : query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.data && !query.data.connected ? (
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
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
      ) : report && plan ? (
        <div
          className={`space-y-6 ${query.isPlaceholderData ? "opacity-60 transition-opacity" : ""}`}
        >
          <AlertsBanner projectId={projectId} />

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={view === "todo" ? "default" : "outline"}
              onClick={() => setView("todo")}
            >
              Por hacer ({total})
            </Button>
            <Button
              size="sm"
              variant={view === "done" ? "default" : "outline"}
              onClick={() => setView("done")}
            >
              Hechas y su impacto ({tracked.data?.length ?? 0})
            </Button>
          </div>

          {view === "done" ? (
            <TrackedList
              projectId={projectId}
              items={tracked.data ?? []}
              loading={tracked.isPending}
            />
          ) : (
            <>
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    aria-pressed={filter === "all"}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      filter === "all"
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:bg-muted/50"
                    }`}
                  >
                    <p className="text-sm font-semibold">Todas ({total})</p>
                    <p className="text-xs text-muted-foreground">
                      Todas las tareas del plan
                    </p>
                  </button>
                  {counts.map(({ kind, count }) => {
                    const meta = KIND_META[kind];
                    const Icon = meta.icon;
                    return (
                      <button
                        key={kind}
                        type="button"
                        disabled={count === 0}
                        onClick={() => setFilter(kind)}
                        aria-pressed={filter === kind}
                        className={`flex gap-2 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          filter === kind
                            ? "border-primary bg-primary/5"
                            : "border-border bg-card hover:bg-muted/50"
                        }`}
                      >
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-full ${TILE_TONE[meta.tone]}`}
                        >
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">
                            {meta.label} ({count})
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {meta.summary}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Esfuerzo:</span>
                  {(
                    [
                      { value: "all", label: "Todos" },
                      ...effortCounts.map((item) => ({
                        value: item.level,
                        label: `${item.level.charAt(0).toUpperCase()}${item.level.slice(1)} (${item.count})`,
                      })),
                    ] as { value: Effort | "all"; label: string }[]
                  ).map((item) => (
                    <Button
                      key={item.value}
                      size="sm"
                      variant={effort === item.value ? "default" : "outline"}
                      onClick={() => setEffort(item.value)}
                    >
                      {item.label}
                    </Button>
                  ))}
                  <span className="text-xs text-muted-foreground">
                    Bajo: unos minutos · Medio: una tarde · Alto: varias horas
                    de trabajo en contenido
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {quickGain > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Títulos y metas, subir y preguntas suman unos{" "}
                      <strong className="text-foreground">
                        +{integer.format(quickGain)} clics
                      </strong>{" "}
                      al periodo (estimación, no promesa).
                    </p>
                  ) : (
                    <span />
                  )}
                  {visibleIds.length > 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setOpenIds(allOpen ? new Set() : new Set(visibleIds))
                      }
                    >
                      {allOpen ? "Plegar todo" : "Desplegar todo"}
                    </Button>
                  ) : null}
                </div>
              </div>

              {total === 0 ? (
                <Card>
                  <CardContent className="py-6 text-sm text-muted-foreground">
                    No hay tareas pendientes con estos filtros: o no se
                    detectan pérdidas ni consultas con potencial, o ya las has
                    marcado como hechas. Prueba con un periodo más largo.
                  </CardContent>
                </Card>
              ) : null}

              {KIND_ORDER.filter(
                (kind) => filter === "all" || filter === kind,
              ).map((kind) => {
                const meta = KIND_META[kind];
                const actions = plan[meta.planKey].filter(matches);
                if (actions.length === 0) return null;
                return (
                  <section key={kind} className="space-y-3">
                    <div>
                      <h2 className="text-lg font-semibold">{meta.title}</h2>
                      <p className="text-sm text-muted-foreground">
                        {meta.help}
                      </p>
                    </div>
                    {actions.map((action) => (
                      <ActionCard
                        key={action.id}
                        action={action}
                        signals={signals}
                        loadingSignals={loading}
                        open={openIds.has(action.id)}
                        onToggle={() => toggle(action.id)}
                        onMarkDone={(title) =>
                          markDone.mutate({ action, title })
                        }
                        marking={
                          markDone.isPending &&
                          markDone.variables?.action.id === action.id
                        }
                      />
                    ))}
                  </section>
                );
              })}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
