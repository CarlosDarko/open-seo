import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart } from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import {
  ChartGrid,
  ChartXAxis,
  ChartYAxis,
} from "@/client/components/ChartAxes";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/client/components/ui/chart";
import { Skeleton } from "@/client/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { buildActions, type RadarReport } from "@/custom/radar/actions";
import { AlertsBanner } from "@/custom/radar/client/AlertsBanner";
import { RadarControls } from "@/custom/radar/client/RadarControls";
import { tileHeadline } from "@/custom/radar/client/ActionPlan";
import { RadarTables } from "@/custom/radar/client/RadarTables";
import { DailyChart } from "@/custom/radar/client/DailyChart";
import { GainLoss } from "@/custom/radar/client/GainLoss";
import { Segments, type SegmentSet } from "@/custom/radar/client/Segments";
import { useRadarReport } from "@/custom/radar/client/useRadarReport";
import {
  decimal,
  integer,
  percent,
  relativeChange,
  signed,
} from "@/custom/radar/format";

const shortDate = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const trendConfig = {
  clicks: { label: "Este periodo", color: "var(--primary)" },
  prevClicks: { label: "Periodo anterior", color: "var(--muted-foreground)" },
  impressions: { label: "Este periodo", color: "var(--primary)" },
  prevImpressions: {
    label: "Periodo anterior",
    color: "var(--muted-foreground)",
  },
} satisfies ChartConfig;

const bandsConfig = {
  prevQueries: { label: "Periodo anterior", color: "var(--muted-foreground)" },
  queries: { label: "Este periodo", color: "var(--primary)" },
} satisfies ChartConfig;

export function RadarPage({ projectId }: { projectId: string }) {
  const { filters, update, query, report } = useRadarReport(projectId);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        title="Radar SEO"
        description="El pulso de tu web en Search Console: qué ha cambiado y dónde se mueve el tráfico. Para saber qué hacer, mira el Plan de acción."
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
        <LoadingSkeleton />
      ) : query.data && !query.data.connected ? (
        <NotConnected projectId={projectId} reason={query.data.reason} />
      ) : report ? (
        <div
          className={`space-y-6 ${query.isPlaceholderData ? "opacity-60 transition-opacity" : ""}`}
        >
          <AlertsBanner projectId={projectId} />
          <Kpis report={report} />
          <Insights projectId={projectId} report={report} />
          <div className="grid gap-4 lg:grid-cols-2">
            <TrendCard report={report} />
            <BandsCard report={report} />
          </div>
          <Segments
            sets={segmentSets(report)}
            comparable={report.period.comparable}
          />
          {report.period.comparable ? <GainLoss report={report} /> : null}
          <Card>
            <CardHeader>
              <CardTitle>Más datos</CardTitle>
              <p className="text-xs text-muted-foreground">
                Oportunidades, páginas que compiten entre sí y consultas nuevas
                o perdidas.
              </p>
            </CardHeader>
            <CardContent>
              <RadarTables report={report} />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function segmentSets(report: RadarReport): SegmentSet[] {
  const sets: SegmentSet[] = [
    {
      key: "pageType",
      tab: "Tipo de página",
      title: "Tipo de página",
      help: "Las secciones de tu web (blog, servicios…), detectadas solas a partir de las URL.",
      segments: report.segments.pageType,
      merges: report.segments.pageTypeMerges,
    },
    {
      key: "intent",
      tab: "Intención",
      title: "Intención de búsqueda",
      help: "Qué busca la gente, deducido de las palabras de la consulta (preguntas, «precio», «mejor»…) y, si no tiene ninguna, de la sección de tu web a la que llega (blog = informarse, servicios o productos = contratar o comprar). «Sin intención clara» son consultas temáticas sin ninguna de esas señales. Es una clasificación automática: orientativa.",
      segments: report.segments.intent,
    },
    {
      key: "device",
      tab: "Dispositivo",
      title: "Dispositivo",
      help: "Desde qué dispositivo llegan tus clics.",
      segments: report.segments.device,
    },
  ];
  if (report.segments.language.length > 1) {
    sets.splice(1, 0, {
      key: "language",
      tab: "Idioma",
      title: "Idioma / mercado",
      help: "La carpeta de idioma de la URL (/es/, /fr/…). Muestra qué mercados crecen o caen. En «Tipo de página» se ignora el idioma para no mezclarlo con las secciones.",
      segments: report.segments.language,
    });
  }
  if (report.brand.hasBrand) {
    sets.push({
      key: "brand",
      tab: "Marca / sin marca",
      title: "Tipo de consulta",
      help: "Las consultas de marca (quien ya te conoce) frente a las demás (quien te descubre).",
      segments: report.segments.brand,
    });
  }
  return sets;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function NotConnected({
  projectId,
  reason,
}: {
  projectId: string;
  reason: "none" | "reconnect";
}) {
  const reconnect = reason === "reconnect";
  return (
    <Card>
      <CardContent className="space-y-3 py-8 text-center">
        <p className="font-medium">
          {reconnect
            ? "La conexión con Google ha caducado"
            : "Este proyecto no tiene Search Console conectado"}
        </p>
        <p className="mx-auto max-w-xl text-sm text-muted-foreground">
          {reconnect
            ? "Google ya no acepta el permiso guardado (suele pasar a los 7 días si la aplicación de Google está en modo pruebas). Vuelve a conectar tu cuenta con «Cambiar propiedad o cuenta»."
            : "Conéctalo desde el Panel para ver aquí los cambios y las oportunidades."}
        </p>
        <Button
          render={
            reconnect ? (
              <Link
                to="/p/$projectId/search-performance"
                params={{ projectId }}
              />
            ) : (
              <Link to="/p/$projectId" params={{ projectId }} />
            )
          }
          variant="outline"
        >
          {reconnect ? "Reconectar Search Console" : "Ir al Panel"}
        </Button>
      </CardContent>
    </Card>
  );
}

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
  const label = asPoints
    ? `${diff > 0 ? "+" : ""}${decimal.format(diff)}`
    : (() => {
        const change = relativeChange(now, before);
        return change === null
          ? "nuevo"
          : `${change > 0 ? "+" : ""}${percent.format(change)}`;
      })();
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

function Kpis({ report }: { report: RadarReport }) {
  const { totals, prevTotals } = report;
  const comparable = report.period.comparable;
  const cards = [
    {
      label: "Clics",
      value: integer.format(totals.clicks),
      delta: comparable ? (
        <Delta now={totals.clicks} before={prevTotals.clicks} />
      ) : null,
    },
    {
      label: "Impresiones",
      value: integer.format(totals.impressions),
      delta: comparable ? (
        <Delta now={totals.impressions} before={prevTotals.impressions} />
      ) : null,
    },
    {
      label: "CTR",
      value: percent.format(totals.ctr),
      delta: comparable ? (
        <Delta now={totals.ctr} before={prevTotals.ctr} />
      ) : null,
    },
    {
      label: "Posición media",
      value: decimal.format(totals.position),
      delta: comparable ? (
        <Delta
          now={totals.position}
          before={prevTotals.position}
          lowerIsBetter
          asPoints
        />
      ) : null,
    },
  ];
  return (
    <section className="space-y-2">
      <p className="text-xs text-muted-foreground">
        <strong className="text-foreground">
          {report.totalsScope === "sin marca"
            ? "Cifras sin marca (estimadas: total menos las consultas de marca detectadas)"
            : report.brand.hasBrand
              ? "Cifras de todo el tráfico, marca incluida"
              : "Cifras de todo el tráfico"}
        </strong>
        {" · "}
        {shortDate.format(
          new Date(`${report.range.startDate}T00:00:00Z`),
        )} – {shortDate.format(new Date(`${report.range.endDate}T00:00:00Z`))}{" "}
        {comparable ? (
          <>
            {" "}
            frente a{" "}
            {shortDate.format(
              new Date(`${report.period.prevStartDate}T00:00:00Z`),
            )}{" "}
            –{" "}
            {shortDate.format(
              new Date(`${report.period.prevEndDate}T00:00:00Z`),
            )}
          </>
        ) : null}
      </p>
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
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

/** The period in three columns, each with its own job and nothing repeated
 *  from the figures above or from "what rises and what falls": how much the
 *  clicks changed, which kinds of page explain it, and what to do first. */
function Insights({
  projectId,
  report,
}: {
  projectId: string;
  report: RadarReport;
}) {
  const comparable = report.period.comparable;
  const { totals, prevTotals, brand } = report;
  const diff = totals.clicks - prevTotals.clicks;
  const change = comparable
    ? relativeChange(totals.clicks, prevTotals.clicks)
    : null;
  const otherChange = comparable
    ? relativeChange(brand.otherClicks, brand.prevOtherClicks)
    : null;

  const plan = useMemo(() => buildActions(report), [report]);
  const tasks = useMemo(() => {
    const quick = [...plan.snippets, ...plan.pushes, ...plan.questions]
      .sort((x, y) => (y.gain ?? 0) - (x.gain ?? 0))
      .slice(0, 2);
    return [...plan.losses.slice(0, 1), ...quick].slice(0, 3);
  }, [plan]);
  const totalTasks =
    plan.losses.length +
    plan.snippets.length +
    plan.pushes.length +
    plan.questions.length +
    plan.cannibals.length +
    plan.traction.length +
    plan.emerging.length;

  // Which kinds of page explain the change (or, without comparison, where the
  // clicks arrive).
  const sections = [...report.segments.pageType]
    .map((segment) => ({
      label: segment.label,
      value: comparable ? segment.clicks - segment.prevClicks : segment.clicks,
    }))
    .filter((row) => row.value !== 0)
    .sort((x, y) => Math.abs(y.value) - Math.abs(x.value))
    .slice(0, 6);
  const biggest = Math.max(1, ...sections.map((row) => Math.abs(row.value)));

  const up = diff >= 0;
  const Trend = up ? TrendingUp : TrendingDown;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen del periodo</CardTitle>
        <p className="text-xs text-muted-foreground">
          Qué ha pasado, de dónde viene y qué hacer primero.
        </p>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-3 lg:divide-x lg:divide-border">
        <section className="space-y-3">
          <ColumnTitle>
            {comparable ? "Los clics" : "Clics del periodo"}
          </ColumnTitle>
          {comparable && change !== null ? (
            <>
              <p className="flex items-center gap-2">
                <span
                  className={`flex size-9 items-center justify-center rounded-full ${up ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}
                >
                  <Trend className="size-5" aria-hidden />
                </span>
                <span
                  className={`text-4xl leading-none font-bold tabular-nums ${up ? "text-success" : "text-destructive"}`}
                >
                  {up ? "+" : "−"}
                  {percent.format(Math.abs(change))}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {integer.format(prevTotals.clicks)} →{" "}
                <strong className="text-foreground">
                  {integer.format(totals.clicks)}
                </strong>{" "}
                clics ({signed(diff)})
              </p>
            </>
          ) : (
            <>
              <p className="text-4xl leading-none font-bold tabular-nums">
                {integer.format(totals.clicks)}
              </p>
              <p className="text-sm text-muted-foreground">
                {integer.format(totals.impressions)} impresiones
              </p>
            </>
          )}
          {brand.hasBrand ? (
            <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">Sin marca</dt>
                <dd className="tabular-nums">
                  <strong>{integer.format(brand.otherClicks)}</strong>
                  {otherChange !== null ? (
                    <span
                      className={`ml-1.5 text-xs font-semibold ${otherChange < 0 ? "text-destructive" : "text-success"}`}
                    >
                      {otherChange > 0 ? "+" : ""}
                      {percent.format(otherChange)}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted-foreground">Con marca</dt>
                <dd className="tabular-nums">
                  <strong>{integer.format(brand.clicks)}</strong>
                </dd>
              </div>
            </dl>
          ) : null}
        </section>

        <section className="space-y-3 lg:pl-6">
          <ColumnTitle>
            {comparable ? "Dónde se mueve" : "Dónde llega el tráfico"}
          </ColumnTitle>
          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay datos suficientes en este periodo.
            </p>
          ) : (
            <ul className="space-y-2">
              {sections.map((row) => (
                <li key={row.label} className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate" title={row.label}>
                      {row.label}
                    </span>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${!comparable ? "" : row.value < 0 ? "text-destructive" : "text-success"}`}
                    >
                      {comparable
                        ? signed(row.value)
                        : integer.format(row.value)}
                    </span>
                  </div>
                  {comparable ? (
                    <div className="flex h-1.5">
                      <div className="flex w-1/2 justify-end rounded-l-full bg-muted">
                        {row.value < 0 ? (
                          <div
                            className="h-full rounded-l-full bg-destructive"
                            style={{
                              width: `${(Math.abs(row.value) / biggest) * 100}%`,
                            }}
                          />
                        ) : null}
                      </div>
                      <div className="flex w-1/2 rounded-r-full bg-muted">
                        {row.value > 0 ? (
                          <div
                            className="h-full rounded-r-full bg-success"
                            style={{
                              width: `${(row.value / biggest) * 100}%`,
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(row.value / biggest) * 100}%` }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3 lg:pl-6">
          <ColumnTitle>Qué hacer primero</ColumnTitle>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay tareas claras en este periodo.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {tasks.map((task) => {
                const isLoss = task.kind === "loss";
                return (
                  <li key={task.id}>
                    <a
                      href={`/p/${projectId}/action-plan?task=${encodeURIComponent(task.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start justify-between gap-3"
                    >
                      <span className="line-clamp-2 min-w-0 text-sm leading-snug font-medium group-hover:underline">
                        {tileHeadline(task)}
                      </span>
                      {task.gain !== null ? (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${isLoss ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}
                        >
                          {isLoss ? "−" : "+"}
                          {integer.format(task.gain)}
                        </span>
                      ) : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          {totalTasks > 0 ? (
            <Link
              to="/p/$projectId/action-plan"
              params={{ projectId }}
              className="inline-block text-sm font-semibold text-primary underline-offset-2 hover:underline"
            >
              Ver las {totalTasks} tareas →
            </Link>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}

function ColumnTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

function TrendCard({ report }: { report: RadarReport }) {
  return (
    <DailyChart
      daily={report.daily}
      comparable={report.period.comparable}
      note={
        report.brand.hasBrand && !report.brand.included
          ? "Incluye también la marca: Search Console no permite separarla día a día."
          : undefined
      }
    />
  );
}

function BandsCard({ report }: { report: RadarReport }) {
  // The chart takes the height of the card, which follows its neighbour (the
  // daily chart and its list of Google updates).
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Consultas por posición</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cuántas consultas tienes en cada franja. Que crezca «1-3» es lo que
          buscas.
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <ChartContainer
          config={bandsConfig}
          className="aspect-auto min-h-60 w-full flex-1"
        >
          <BarChart
            data={report.bands}
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          >
            <ChartGrid />
            <ChartXAxis dataKey="label" minTickGap={4} />
            <ChartYAxis
              tickFormatter={(value: number) => integer.format(value)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  valueFormatter={(value) =>
                    `${integer.format(Number(value))} consultas`
                  }
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {report.period.comparable ? (
              <Bar
                dataKey="prevQueries"
                fill="var(--color-prevQueries)"
                radius={[2, 2, 0, 0]}
              />
            ) : null}
            <Bar
              dataKey="queries"
              fill="var(--color-queries)"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
