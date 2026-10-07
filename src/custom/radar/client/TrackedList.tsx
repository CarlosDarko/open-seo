import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { KIND_META } from "@/custom/radar/client/ActionPlan";
import { GoogleLink } from "@/custom/radar/client/RadarLinks";
import { decimal, integer, pathOf, percent } from "@/custom/radar/format";
import type { Impact, Verdict } from "@/custom/radar/trackingImpact";
import {
  undoAction,
  type TrackedAction,
} from "@/serverFunctions/radarTracking";

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

const VERDICT: Record<
  Verdict,
  { label: string; className: string; text: string }
> = {
  mejora: {
    label: "Ha mejorado",
    className: "bg-success/10 text-success",
    text: "Los números han mejorado más que los del conjunto del sitio.",
  },
  empeora: {
    label: "Ha empeorado",
    className: "bg-destructive/10 text-destructive",
    text: "Los números han empeorado más que los del conjunto del sitio.",
  },
  sin_cambio: {
    label: "Sin cambio notable",
    className: "bg-muted text-muted-foreground",
    text: "No hay una diferencia clara frente al resto del sitio: puede que haga falta más tiempo o más cambio.",
  },
  pocos_datos: {
    label: "Pocos datos",
    className: "bg-warning/10 text-warning",
    text: "La página tenía muy pocas impresiones antes del cambio: no se puede juzgar con fiabilidad.",
  },
};

function pct(value: number | null): string {
  if (value === null) return "nuevo";
  return `${value > 0 ? "+" : ""}${percent.format(value)}`;
}

function Metric({
  label,
  before,
  after,
  change,
  good,
}: {
  label: string;
  before: string;
  after: string;
  change: string;
  good: boolean | null;
}) {
  return (
    <div className="rounded-md bg-muted px-3 py-2 text-xs">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">
        {before} → {after}
      </p>
      <p
        className={`tabular-nums ${good === null ? "text-muted-foreground" : good ? "text-success" : "text-destructive"}`}
      >
        {change}
      </p>
    </div>
  );
}

function ImpactDetail({ impact }: { impact: Impact }) {
  const clicksGood =
    impact.clicks.changePct === null
      ? null
      : impact.clicks.changePct > 0.02
        ? true
        : impact.clicks.changePct < -0.02
          ? false
          : null;
  const positionGood =
    Math.abs(impact.position.delta) < 0.3 ? null : impact.position.delta < 0;
  const ctrGood =
    impact.ctr.changePct === null
      ? null
      : impact.ctr.changePct > 0.05
        ? true
        : impact.ctr.changePct < -0.05
          ? false
          : null;
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Clics por día"
          before={decimal.format(impact.clicks.before)}
          after={decimal.format(impact.clicks.after)}
          change={pct(impact.clicks.changePct)}
          good={clicksGood}
        />
        <Metric
          label="Impresiones por día"
          before={integer.format(impact.impressions.before)}
          after={integer.format(impact.impressions.after)}
          change={pct(impact.impressions.changePct)}
          good={
            impact.impressions.changePct === null
              ? null
              : impact.impressions.changePct > 0.05
                ? true
                : impact.impressions.changePct < -0.05
                  ? false
                  : null
          }
        />
        <Metric
          label="CTR"
          before={percent.format(impact.ctr.before)}
          after={percent.format(impact.ctr.after)}
          change={pct(impact.ctr.changePct)}
          good={ctrGood}
        />
        <Metric
          label="Posición"
          before={decimal.format(impact.position.before)}
          after={decimal.format(impact.position.after)}
          change={`${impact.position.delta > 0 ? "+" : ""}${decimal.format(impact.position.delta)} puestos`}
          good={positionGood}
        />
      </div>
      {impact.siteClicksChangePct !== null ? (
        <p className="text-xs text-muted-foreground">
          En el mismo tiempo, los clics de todo el sitio han cambiado{" "}
          {pct(impact.siteClicksChangePct)}
          {impact.effectVsSite !== null && impact.primary !== "position"
            ? `; la métrica clave de esta tarea (${impact.primary === "ctr" ? "CTR" : "clics"}) se ha movido ${impact.effectVsSite > 0 ? "+" : ""}${(impact.effectVsSite * 100).toFixed(0)} puntos respecto a eso`
            : ""}
          .
        </p>
      ) : null}
    </div>
  );
}

/** The actions marked as done, with what happened after them. */
export function TrackedList({
  projectId,
  items,
  loading,
}: {
  projectId: string;
  items: TrackedAction[];
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const undo = useMutation({
    mutationFn: (id: string) => undoAction({ data: { projectId, id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["radar-tracked", projectId] }),
  });

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Midiendo el impacto…</p>
    );
  }
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Todavía no has marcado ninguna tarea como hecha. Cuando lo hagas, aquí
          verás qué pasó con esa página después del cambio: pasadas dos semanas
          se compara con lo que había antes y con el conjunto del sitio.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        El impacto se mide cuando hay al menos 14 días de datos después del
        cambio, comparando por día con los 28 días anteriores y con lo que ha
        pasado en todo el sitio, para no atribuirte una subida general.
      </p>
      {items.map((item) => {
        const meta = KIND_META[item.kind];
        const Icon = meta.icon;
        const done = new Date(item.doneAt);
        const verdict = item.impact ? VERDICT[item.impact.verdict] : null;
        const title =
          item.title ??
          (item.page
            ? pathOf(item.page)
            : item.query
              ? `«${item.query}»`
              : meta.label);
        return (
          <Card key={item.id}>
            <CardContent className="space-y-3 py-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    <Icon className="size-3.5" aria-hidden />
                    {meta.label} · hecha el {dateFormat.format(done)}
                    {item.doneBy ? ` por ${item.doneBy}` : ""}
                  </p>
                  {item.page ? (
                    <a
                      href={item.page}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-start gap-1.5 leading-snug font-semibold hover:text-primary"
                    >
                      <span className="break-words">{title}</span>
                      <ExternalLink
                        className="mt-1 size-3.5 shrink-0 text-muted-foreground group-hover:text-primary"
                        aria-hidden
                      />
                    </a>
                  ) : (
                    <p className="leading-snug font-semibold">{title}</p>
                  )}
                  {item.query ? (
                    <p className="text-sm">
                      <GoogleLink
                        query={item.query}
                        label={`«${item.query}»`}
                      />
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {verdict ? (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${verdict.className}`}
                    >
                      {verdict.label}
                    </span>
                  ) : null}
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Quitar del seguimiento"
                    title="Quitar del seguimiento (vuelve a la lista de tareas)"
                    onClick={() => undo.mutate(item.id)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </div>

              {item.impact && verdict ? (
                <>
                  <p className="text-sm">{verdict.text}</p>
                  <ImpactDetail impact={item.impact} />
                </>
              ) : item.error ? (
                <p className="text-sm text-muted-foreground">
                  No se pudo medir ahora: {item.error}
                </p>
              ) : item.waitingDays > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Midiendo: faltan unos {item.waitingDays} días de datos de
                  Search Console para poder comparar.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Es de las más antiguas: solo se mide el impacto de las 20
                  tareas más recientes.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
