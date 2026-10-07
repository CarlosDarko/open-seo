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

export function ActionPlanPage({ projectId }: { projectId: string }) {
  const { filters, update, query, report } = useRadarReport(projectId);
  const [filter, setFilter] = useState<ActionKind | "all">("all");

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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        title="Plan de acción"
        description="Tareas concretas para mejorar el SEO, ordenadas por tipo, con la página y la consulta implicadas y los cambios exactos. Datos de Search Console y lectura de tu web: sin gasto en DataForSEO."
        actions={
          <RadarControls
            filters={filters}
            onChange={update}
            showBrand={report?.brand.hasBrand}
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={filter === "all" ? "default" : "outline"}
              onClick={() => setFilter("all")}
            >
              Todas ({total})
            </Button>
            {counts.map(({ kind, count }) =>
              count > 0 ? (
                <Button
                  key={kind}
                  size="sm"
                  variant={filter === kind ? "default" : "outline"}
                  onClick={() => setFilter(kind)}
                >
                  {KIND_META[kind].badge} ({count})
                </Button>
              ) : null,
            )}
            {quickGain > 0 ? (
              <span className="ml-auto text-sm text-muted-foreground">
                Reescribir, subir y responder suman unos{" "}
                <strong className="text-foreground">
                  +{integer.format(quickGain)} clics
                </strong>{" "}
                al periodo (estimación, no promesa).
              </span>
            ) : null}
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
