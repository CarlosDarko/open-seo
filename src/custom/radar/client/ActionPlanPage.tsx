import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/client/components/ui/dialog";
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
  TaskTile,
  taskTitle,
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

const COLUMNS: {
  effort: Effort;
  title: string;
  hint: string;
  badge: string;
}[] = [
  {
    effort: "bajo",
    title: "Rápidas de ganar",
    hint: "Unos minutos de trabajo",
    badge: "bg-success/15 text-success",
  },
  {
    effort: "medio",
    title: "Una tarde",
    hint: "Esfuerzo medio",
    badge: "bg-warning/15 text-warning",
  },
  {
    effort: "alto",
    title: "Más trabajo",
    hint: "Varias horas, normalmente contenido",
    badge: "bg-destructive/15 text-destructive",
  },
];

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
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  // Tasks already marked as done leave the board and move to "Hechas".
  const matches = (action: Action) => !doneKeys.has(actionKey(action));

  const counts = KIND_ORDER.map((kind) => ({
    kind,
    count: plan ? plan[KIND_META[kind].planKey].filter(matches).length : 0,
  }));
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  const quickGain = plan
    ? [...plan.snippets, ...plan.pushes, ...plan.questions]
        .filter(matches)
        .reduce((sum, action) => sum + (action.gain ?? 0), 0)
    : 0;
  const visible = plan
    ? KIND_ORDER.filter((kind) => filter === "all" || filter === kind).flatMap(
        (kind) => plan[KIND_META[kind].planKey].filter(matches),
      )
    : [];
  const allActions = plan
    ? KIND_ORDER.flatMap((kind) => plan[KIND_META[kind].planKey])
    : [];
  const selected =
    allActions.find((action) => action.id === selectedId) ?? null;
  const columns = COLUMNS.map((column) => ({
    ...column,
    items: visible
      .filter((action) => action.effort === column.effort)
      .sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0)),
  }));

  // A link from the Panel (?task=<id>) opens that task's card and scrolls to it.
  useEffect(() => {
    if (!plan) return;
    const id = new URLSearchParams(window.location.search).get("task");
    if (!id) return;
    setView("todo");
    setFilter("all");
    setSelectedId(id);
  }, [plan]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 md:px-6">
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
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={filter === "all" ? "default" : "outline"}
                  onClick={() => setFilter("all")}
                >
                  Todas ({total})
                </Button>
                {counts.map(({ kind, count }) => {
                  const meta = KIND_META[kind];
                  const Icon = meta.icon;
                  return (
                    <Button
                      key={kind}
                      size="sm"
                      variant={filter === kind ? "default" : "outline"}
                      disabled={count === 0}
                      onClick={() => setFilter(kind)}
                      title={meta.summary}
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {meta.label} ({count})
                    </Button>
                  );
                })}
                {quickGain > 0 ? (
                  <span className="ml-auto text-sm text-muted-foreground">
                    Las rápidas suman unos{" "}
                    <strong className="text-foreground">
                      +{integer.format(quickGain)} clics
                    </strong>{" "}
                    cada {report.period.days} días (estimación)
                  </span>
                ) : null}
              </div>

              {total === 0 ? (
                <Card>
                  <CardContent className="py-6 text-sm text-muted-foreground">
                    No hay tareas pendientes con estos filtros: o no se detectan
                    pérdidas ni consultas con potencial, o ya las has marcado
                    como hechas. Prueba con un periodo más largo.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid items-start gap-4 lg:grid-cols-3">
                  {columns.map((column) => (
                    <section
                      key={column.effort}
                      className="rounded-xl border border-border bg-muted/30"
                    >
                      <header className="flex items-center justify-between gap-2 border-b border-border p-3">
                        <div>
                          <h2 className="text-sm font-semibold">
                            {column.title}
                          </h2>
                          <p className="text-xs text-muted-foreground">
                            {column.hint}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${column.badge}`}
                        >
                          {column.items.length}
                        </span>
                      </header>
                      <div className="max-h-[70vh] space-y-2 overflow-y-auto p-2.5">
                        {column.items.length === 0 ? (
                          <p className="px-1 py-4 text-center text-xs text-muted-foreground">
                            Nada aquí con este filtro.
                          </p>
                        ) : (
                          column.items.map((action) => (
                            <TaskTile
                              key={action.id}
                              action={action}
                              title={taskTitle(action, signals)}
                              onOpen={() => setSelectedId(action.id)}
                              periodDays={report.period.days}
                            />
                          ))
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              <Dialog
                open={selected !== null}
                onOpenChange={(open) => {
                  if (!open) setSelectedId(null);
                }}
              >
                <DialogContent className="max-h-[90vh] gap-0 p-0 sm:max-w-4xl">
                  <DialogTitle className="sr-only">
                    {selected ? taskTitle(selected, signals) : "Tarea"}
                  </DialogTitle>
                  {selected ? (
                    <ActionCard
                      action={selected}
                      signals={signals}
                      loadingSignals={loading}
                      open
                      hideToggle
                      periodDays={report.period.days}
                      onToggle={() => undefined}
                      onMarkDone={(title) =>
                        markDone.mutate(
                          { action: selected, title },
                          { onSuccess: () => setSelectedId(null) },
                        )
                      }
                      marking={markDone.isPending}
                    />
                  ) : null}
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
