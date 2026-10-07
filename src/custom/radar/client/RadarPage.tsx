import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart, Line, LineChart } from "recharts";
import { ChevronDown, ChevronUp } from "lucide-react";
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
import { RadarControls } from "@/custom/radar/client/RadarControls";
import { PageLink } from "@/custom/radar/client/RadarLinks";
import { RadarTables } from "@/custom/radar/client/RadarTables";
import {
  Segments,
  type SegmentSet,
} from "@/custom/radar/client/Segments";
import { useRadarReport } from "@/custom/radar/client/useRadarReport";
import {
  decimal,
  integer,
  percent,
  relativeChange,
  signed,
} from "@/custom/radar/format";
import type { ChangeCause } from "@/custom/radar/radarAnalysis";
import type { Segment } from "@/custom/radar/radarSegments";

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

const CAUSE_SHORT: Record<ChangeCause, string> = {
  posicion: "por perder posición",
  demanda: "porque se busca menos",
  ctr: "por un CTR más bajo",
  mixto: "por varias causas",
  nueva: "página nueva",
  perdida: "sin tráfico ahora",
};

export function RadarPage({ projectId }: { projectId: string }) {
  const { filters, update, query, report } = useRadarReport(projectId);
  const [showData, setShowData] = useState(false);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        title="Radar SEO"
        description="El pulso de tu web en Search Console: qué ha cambiado y dónde se mueve el tráfico. Para saber qué hacer, mira el Plan de acción."
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
        <LoadingSkeleton />
      ) : query.data && !query.data.connected ? (
        <NotConnected projectId={projectId} reason={query.data.reason} />
      ) : report ? (
        <div
          className={`space-y-6 ${query.isPlaceholderData ? "opacity-60 transition-opacity" : ""}`}
        >
          <Kpis report={report} />
          <Insights projectId={projectId} report={report} />
          <div className="grid gap-4 lg:grid-cols-2">
            <TrendCard report={report} />
            <BandsCard report={report} />
          </div>
          <Segments sets={segmentSets(report)} />
          <section className="space-y-3">
            <Button
              variant="outline"
              onClick={() => setShowData((open) => !open)}
            >
              {showData ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
              {showData ? "Ocultar los datos completos" : "Ver los datos completos"}
            </Button>
            {showData ? <RadarTables report={report} /> : null}
          </section>
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
    },
    {
      key: "intent",
      tab: "Intención",
      title: "Intención de búsqueda",
      help: "Qué busca la gente, deducido de cómo escribe la consulta. Es una clasificación automática por palabras: orientativa.",
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
  const cards = [
    {
      label: "Clics",
      value: integer.format(totals.clicks),
      delta: <Delta now={totals.clicks} before={prevTotals.clicks} />,
    },
    {
      label: "Impresiones",
      value: integer.format(totals.impressions),
      delta: (
        <Delta now={totals.impressions} before={prevTotals.impressions} />
      ),
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
        <Delta
          now={totals.position}
          before={prevTotals.position}
          lowerIsBetter
          asPoints
        />
      ),
    },
  ];
  return (
    <section className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {shortDate.format(new Date(`${report.range.startDate}T00:00:00Z`))} –{" "}
        {shortDate.format(new Date(`${report.range.endDate}T00:00:00Z`))}{" "}
        frente a{" "}
        {shortDate.format(new Date(`${report.period.prevStartDate}T00:00:00Z`))}{" "}
        –{" "}
        {shortDate.format(new Date(`${report.period.prevEndDate}T00:00:00Z`))}
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

type Tone = "good" | "bad" | "info";

function topShare(segments: Segment[]): { label: string; share: number } | null {
  const total = segments.reduce((sum, segment) => sum + segment.clicks, 0);
  const top = segments[0];
  return top && total > 0 ? { label: top.label, share: top.clicks / total } : null;
}

function Insights({
  projectId,
  report,
}: {
  projectId: string;
  report: RadarReport;
}) {
  const lines = useMemo(() => {
    const out: { tone: Tone; node: ReactNode }[] = [];
    const clicksChange = relativeChange(
      report.totals.clicks,
      report.prevTotals.clicks,
    );
    if (clicksChange !== null) {
      const diff = report.totals.clicks - report.prevTotals.clicks;
      out.push({
        tone: diff >= 0 ? "good" : "bad",
        node: (
          <>
            Clics <strong>{diff >= 0 ? "al alza" : "a la baja"}</strong>:{" "}
            {percent.format(Math.abs(clicksChange))} ({signed(diff)}).
          </>
        ),
      });
    }
    const { brand } = report;
    if (brand.hasBrand) {
      const other = relativeChange(brand.otherClicks, brand.prevOtherClicks);
      out.push({
        tone: other !== null && other < 0 ? "bad" : "info",
        node: (
          <>
            Sin marca: <strong>{integer.format(brand.otherClicks)}</strong>{" "}
            clics
            {other !== null
              ? ` (${other > 0 ? "+" : ""}${percent.format(other)})`
              : ""}
            . Marca: {integer.format(brand.clicks)}.
          </>
        ),
      });
    }
    const loser = report.pageChanges.losers[0];
    if (loser && loser.clicksDelta < 0) {
      out.push({
        tone: "bad",
        node: (
          <>
            Mayor caída: <PageLink url={loser.key} />{" "}
            <strong>{signed(loser.clicksDelta)}</strong>{" "}
            {CAUSE_SHORT[loser.cause]}.
          </>
        ),
      });
    }
    const winner = report.pageChanges.winners[0];
    if (winner && winner.clicksDelta > 0) {
      out.push({
        tone: "good",
        node: (
          <>
            Mayor subida: <PageLink url={winner.key} />{" "}
            <strong>{signed(winner.clicksDelta)}</strong>.
          </>
        ),
      });
    }
    const page = topShare(report.segments.pageType);
    const intent = topShare(report.segments.intent);
    if (page || intent) {
      out.push({
        tone: "info",
        node: (
          <>
            Lo que más tráfico trae:{" "}
            {page ? (
              <>
                páginas «{page.label}» ({percent.format(page.share)})
              </>
            ) : null}
            {page && intent ? " y " : ""}
            {intent ? (
              <>
                búsquedas de «{intent.label}» ({percent.format(intent.share)})
              </>
            ) : null}
            .
          </>
        ),
      });
    }
    const plan = buildActions(report);
    const tasks =
      plan.losses.length +
      plan.snippets.length +
      plan.pushes.length +
      plan.questions.length +
      plan.cannibals.length +
      plan.traction.length +
      plan.emerging.length;
    const gain = [...plan.snippets, ...plan.pushes, ...plan.questions].reduce(
      (sum, action) => sum + (action.gain ?? 0),
      0,
    );
    if (tasks > 0) {
      out.push({
        tone: "info",
        node: (
          <>
            <strong>{tasks} tareas</strong> en el plan de acción
            {gain > 0 ? `, unos +${integer.format(gain)} clics estimados` : ""}.{" "}
            <Link
              to="/p/$projectId/action-plan"
              params={{ projectId }}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Ver el plan →
            </Link>
          </>
        ),
      });
    }
    return out;
  }, [projectId, report]);

  const dot: Record<Tone, string> = {
    good: "bg-success",
    bad: "bg-destructive",
    info: "bg-muted-foreground/60",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lo importante</CardTitle>
      </CardHeader>
      <CardContent>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay datos suficientes en este periodo.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {lines.map((line, index) => (
              <li key={index} className="flex gap-3 text-sm">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${dot[line.tone]}`}
                  aria-hidden
                />
                <span>{line.node}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TrendCard({ report }: { report: RadarReport }) {
  const [metric, setMetric] = useState<"clicks" | "impressions">("clicks");
  const prevKey = metric === "clicks" ? "prevClicks" : "prevImpressions";
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Evolución diaria</CardTitle>
        <Tabs
          value={metric}
          onValueChange={(value) => setMetric(value as typeof metric)}
        >
          <TabsList>
            <TabsTrigger value="clicks">Clics</TabsTrigger>
            <TabsTrigger value="impressions">Impresiones</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <ChartContainer config={trendConfig} className="h-60 w-full">
          <LineChart
            data={report.daily}
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          >
            <ChartGrid />
            <ChartXAxis
              dataKey="date"
              tickFormatter={(date: string) =>
                shortDate.format(new Date(`${date}T00:00:00Z`))
              }
            />
            <ChartYAxis
              tickFormatter={(value: number) => integer.format(value)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label: unknown) =>
                    typeof label === "string"
                      ? shortDate.format(new Date(`${label}T00:00:00Z`))
                      : ""
                  }
                  valueFormatter={(value) => integer.format(Number(value))}
                />
              }
            />
            <Line
              dataKey={prevKey}
              stroke={`var(--color-${prevKey})`}
              strokeDasharray="4 3"
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
            <Line
              dataKey={metric}
              stroke={`var(--color-${metric})`}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function BandsCard({ report }: { report: RadarReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Consultas por posición</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cuántas consultas tienes en cada franja. Que crezca «1-3» es lo que
          buscas.
        </p>
      </CardHeader>
      <CardContent>
        <ChartContainer config={bandsConfig} className="h-60 w-full">
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
            <Bar
              dataKey="prevQueries"
              fill="var(--color-prevQueries)"
              radius={[2, 2, 0, 0]}
            />
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
