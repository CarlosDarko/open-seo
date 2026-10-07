import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Skeleton } from "@/client/components/ui/skeleton";
import { buildActions, type ActionKind } from "@/custom/radar/actions";
import {
  ActionCard,
  KIND_META,
  KIND_ORDER,
  usePlanSignals,
} from "@/custom/radar/client/ActionPlan";
import { RadarControls } from "@/custom/radar/client/RadarControls";
import { useRadarReport } from "@/custom/radar/client/useRadarReport";
import { integer } from "@/custom/radar/format";

const TILE_TONE: Record<string, string> = {
  destructive: "text-destructive bg-destructive/10",
  primary: "text-primary bg-primary/10",
  success: "text-success bg-success/10",
  info: "text-info bg-info/10",
  warning: "text-warning bg-warning/10",
};

export function ActionPlanPage({ projectId }: { projectId: string }) {
  const { filters, update, query, report } = useRadarReport(projectId);
  const [filter, setFilter] = useState<ActionKind | "all">("all");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const plan = useMemo(() => (report ? buildActions(report) : null), [report]);
  const empty = {
    losses: [],
    snippets: [],
    pushes: [],
    questions: [],
    cannibals: [],
    traction: [],
    emerging: [],
  };
  const { signals, loading } = usePlanSignals(projectId, plan ?? empty);

  const counts = KIND_ORDER.map((kind) => ({
    kind,
    count: plan ? plan[KIND_META[kind].planKey].length : 0,
  }));
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  const quickGain = plan
    ? [...plan.snippets, ...plan.pushes, ...plan.questions].reduce(
        (sum, action) => sum + (action.gain ?? 0),
        0,
      )
    : 0;
  const visibleIds = plan
    ? KIND_ORDER.filter((kind) => filter === "all" || filter === kind).flatMap(
        (kind) => plan[KIND_META[kind].planKey].map((action) => action.id),
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
        description="Tareas concretas para mejorar el SEO, agrupadas por tipo. Cada una dice qué hacer y, al desplegarla, por qué y cómo. Datos de Search Console y lectura de tu web: sin gasto en DataForSEO."
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
                No hay tareas claras en este periodo: no se detectan pérdidas
                relevantes ni consultas con potencial suficiente. Prueba con un
                periodo más largo.
              </CardContent>
            </Card>
          ) : null}

          {KIND_ORDER.filter((kind) => filter === "all" || filter === kind).map(
            (kind) => {
              const meta = KIND_META[kind];
              const actions = plan[meta.planKey];
              if (actions.length === 0) return null;
              return (
                <section key={kind} className="space-y-3">
                  <div>
                    <h2 className="text-lg font-semibold">{meta.title}</h2>
                    <p className="text-sm text-muted-foreground">{meta.help}</p>
                  </div>
                  {actions.map((action) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      signals={signals}
                      loadingSignals={loading}
                      open={openIds.has(action.id)}
                      onToggle={() => toggle(action.id)}
                    />
                  ))}
                </section>
              );
            },
          )}
        </div>
      ) : null}
    </div>
  );
}
