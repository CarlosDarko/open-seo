import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart } from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Layers,
  ListChecks,
  Tag,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
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
import { PageLink } from "@/custom/radar/client/RadarLinks";
import { RadarTables } from "@/custom/radar/client/RadarTables";
import { DailyChart } from "@/custom/radar/client/DailyChart";
import { Segments, type SegmentSet } from "@/custom/radar/client/Segments";
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
              {showData
                ? "Ocultar los datos completos"
                : "Ver los datos completos"}
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

function topShare(
  segments: Segment[],
): { label: string; share: number } | null {
  const total = segments.reduce((sum, segment) => sum + segment.clicks, 0);
  const top = segments[0];
  return top && total > 0
    ? { label: top.label, share: top.clicks / total }
    : null;
}

function Insights({
  projectId,
  report,
}: {
  projectId: string;
  report: RadarReport;
}) {
  const comparable = report.period.comparable;
  const clicksChange = comparable
    ? relativeChange(report.totals.clicks, report.prevTotals.clicks)
    : null;
  const clicksDiff = report.totals.clicks - report.prevTotals.clicks;
  const { brand } = report;
  const otherChange = comparable
    ? relativeChange(brand.otherClicks, brand.prevOtherClicks)
    : null;
  const loser = comparable ? report.pageChanges.losers[0] : undefined;
  const winner = comparable ? report.pageChanges.winners[0] : undefined;
  const page = topShare(report.segments.pageType);
  const intent = topShare(report.segments.intent);
  const plan = useMemo(() => buildActions(report), [report]);
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

  const tiles: ReactNode[] = [];
  if (!comparable) {
    tiles.push(
      <Tile
        key="clicks"
        tone="info"
        icon={TrendingUp}
        label="Clics del periodo"
        value={integer.format(report.totals.clicks)}
        detail={`${integer.format(report.totals.impressions)} impresiones`}
      />,
    );
  }
  if (clicksChange !== null) {
    tiles.push(
      <Tile
        key="clicks"
        tone={clicksDiff >= 0 ? "good" : "bad"}
        icon={clicksDiff >= 0 ? TrendingUp : TrendingDown}
        label={clicksDiff >= 0 ? "Clics al alza" : "Clics a la baja"}
        value={`${clicksDiff >= 0 ? "+" : "−"}${percent.format(Math.abs(clicksChange))}`}
        detail={`${signed(clicksDiff)} clics frente al periodo anterior`}
      />,
    );
  }
  if (brand.hasBrand) {
    tiles.push(
      <Tile
        key="brand"
        tone={otherChange !== null && otherChange < 0 ? "bad" : "info"}
        icon={Tag}
        label="Clics sin marca"
        value={integer.format(brand.otherClicks)}
        chip={
          otherChange !== null
            ? `${otherChange > 0 ? "+" : ""}${percent.format(otherChange)}`
            : undefined
        }
        detail={`Con marca: ${integer.format(brand.clicks)} clics`}
      />,
    );
  }
  if (loser && loser.clicksDelta < 0) {
    tiles.push(
      <Tile
        key="loser"
        tone="bad"
        icon={ArrowDownRight}
        label="Mayor caída"
        value={signed(loser.clicksDelta)}
        chip={CAUSE_SHORT[loser.cause]}
        detail={<PageRef url={loser.key} />}
      />,
    );
  }
  if (winner && winner.clicksDelta > 0) {
    tiles.push(
      <Tile
        key="winner"
        tone="good"
        icon={ArrowUpRight}
        label="Mayor subida"
        value={signed(winner.clicksDelta)}
        detail={<PageRef url={winner.key} />}
      />,
    );
  }
  if (page || intent) {
    tiles.push(
      <Tile
        key="share"
        tone="info"
        icon={Layers}
        label="Lo que más tráfico trae"
        detail={
          <span className="mt-1 block space-y-2">
            {page ? <ShareBar kind="Páginas" item={page} /> : null}
            {intent ? <ShareBar kind="Búsquedas" item={intent} /> : null}
          </span>
        }
      />,
    );
  }
  if (tasks > 0) {
    tiles.push(
      <Tile
        key="plan"
        tone="info"
        icon={ListChecks}
        label="Plan de acción"
        value={`${tasks} tareas`}
        detail={
          <>
            {gain > 0
              ? `Unos +${integer.format(gain)} clics estimados en ${report.period.days} días. `
              : ""}
            <Link
              to="/p/$projectId/action-plan"
              params={{ projectId }}
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Ver el plan →
            </Link>
          </>
        }
      />,
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lo importante</CardTitle>
        <p className="text-xs text-muted-foreground">
          Lo que más se ha movido en este periodo, de un vistazo.
        </p>
      </CardHeader>
      <CardContent>
        {tiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay datos suficientes en este periodo.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tiles}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TILE_TONES = {
  good: {
    icon: "bg-success/15 text-success",
    value: "text-success",
    wash: "border-success/25 bg-success/5",
  },
  bad: {
    icon: "bg-destructive/15 text-destructive",
    value: "text-destructive",
    wash: "border-destructive/25 bg-destructive/5",
  },
  info: {
    icon: "bg-primary/10 text-primary",
    value: "text-foreground",
    wash: "border-border bg-card",
  },
} as const;

/** One finding: icon, what it is, the figure and a line of detail. */
function Tile({
  tone,
  icon: Icon,
  label,
  value,
  chip,
  detail,
}: {
  tone: keyof typeof TILE_TONES;
  icon: LucideIcon;
  label: string;
  value?: string;
  chip?: string;
  detail: ReactNode;
}) {
  const style = TILE_TONES[tone];
  return (
    <div className={`h-full rounded-xl border p-3.5 ${style.wash}`}>
      <div className="flex items-center gap-2.5">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${style.icon}`}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
      </div>
      {value ? (
        <p className="mt-2 flex flex-wrap items-baseline gap-2">
          <span
            className={`text-3xl leading-none font-bold tabular-nums ${style.value}`}
          >
            {value}
          </span>
          {chip ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {chip}
            </span>
          ) : null}
        </p>
      ) : null}
      <div className="mt-1.5 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

/** A page of the site, as a link that opens in a new tab: its path alone, on
 *  one line (the query string with tracking parameters is left out). */
function PageRef({ url }: { url: string }) {
  let path = url;
  try {
    path = new URL(url).pathname || "/";
  } catch {
    // Not a full URL: show it as it is.
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block truncate font-mono text-xs text-foreground hover:underline"
      title={url}
    >
      {path}
    </a>
  );
}

function ShareBar({
  kind,
  item,
}: {
  kind: string;
  item: { label: string; share: number };
}) {
  return (
    <span className="block">
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="min-w-0 truncate text-foreground">
          {kind} «{item.label}»
        </span>
        <strong className="shrink-0 tabular-nums text-foreground">
          {percent.format(item.share)}
        </strong>
      </span>
      <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${Math.max(3, item.share * 100)}%` }}
        />
      </span>
    </span>
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
