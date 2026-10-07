import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Line, LineChart } from "recharts";
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
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/client/components/ui/chart";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { RadarControls } from "@/custom/radar/client/RadarControls";
import { PageLink } from "@/custom/radar/client/RadarLinks";
import { Segments } from "@/custom/radar/client/Segments";
import {
  periodInput,
  useRadarFilters,
} from "@/custom/radar/client/useRadarFilters";
import {
  integer,
  percent,
  relativeChange,
  signed,
} from "@/custom/radar/format";
import { getDiscoverReport } from "@/serverFunctions/discover";

type SurfaceType = "discover" | "googleNews" | "news" | "image" | "video";

const SURFACES: { value: SurfaceType; label: string; what: string }[] = [
  { value: "discover", label: "Discover", what: "Discover" },
  { value: "googleNews", label: "Google Noticias", what: "Google Noticias" },
  { value: "news", label: "Pestaña Noticias", what: "la pestaña Noticias" },
  { value: "image", label: "Imágenes", what: "Google Imágenes" },
  { value: "video", label: "Vídeo", what: "las búsquedas de vídeo" },
];

const shortDate = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const chartConfig = {
  clicks: { label: "Este periodo", color: "var(--primary)" },
  prevClicks: { label: "Periodo anterior", color: "var(--muted-foreground)" },
  impressions: { label: "Este periodo", color: "var(--primary)" },
  prevImpressions: {
    label: "Periodo anterior",
    color: "var(--muted-foreground)",
  },
} satisfies ChartConfig;

export function DiscoverPage({ projectId }: { projectId: string }) {
  const { filters, update, ready } = useRadarFilters();
  const [surface, setSurface] = useState<SurfaceType>("discover");
  const input = { ...periodInput(filters), type: surface };
  const hasDates =
    filters.range !== "custom" || Boolean(filters.startDate && filters.endDate);
  const query = useQuery({
    queryKey: ["discover", projectId, input],
    queryFn: () => getDiscoverReport({ data: { projectId, ...input } }),
    enabled: ready && hasDates,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const report = query.data?.connected ? query.data : null;
  const meta = SURFACES.find((item) => item.value === surface) ?? SURFACES[0];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        title="Discover y otras superficies"
        description="Tráfico que Google te da fuera de la búsqueda normal: Discover, Noticias, Imágenes y Vídeo. En Discover no hay consultas ni posición: se analizan páginas, países y fechas."
        actions={
          <RadarControls
            filters={filters}
            onChange={update}
            fellBack={report?.period.fellBack}
          />
        }
      />

      <Tabs
        value={surface}
        onValueChange={(value) => setSurface(value as SurfaceType)}
      >
        <TabsList>
          {SURFACES.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {query.isError ? (
        <QueryError
          variant="card"
          error={query.error}
          fallback="No se pudieron cargar los datos de Search Console."
          onRetry={() => void query.refetch()}
          isRetrying={query.isFetching}
        />
      ) : query.isPending ? (
        <Skeleton className="h-72 w-full" />
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
      ) : report ? (
        report.totals.impressions === 0 ? (
          <Card>
            <CardContent className="space-y-2 py-8 text-center">
              <p className="font-medium">
                Sin datos de {meta.what} en este periodo
              </p>
              <p className="mx-auto max-w-xl text-sm text-muted-foreground">
                Search Console solo muestra estos datos cuando Google ha
                enseñado tu contenido en esa superficie. En Discover suele
                necesitarse contenido reciente, atractivo (buenas imágenes
                grandes) y de calidad. Prueba con un periodo más largo.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div
            className={`space-y-6 ${query.isPlaceholderData ? "opacity-60 transition-opacity" : ""}`}
          >
            <Kpis report={report} what={meta.what} />
            <Highlights report={report} what={meta.what} />
            <TrendCard report={report} />
            <TopPages report={report} />
            <Segments
              sets={[
                {
                  key: "pageType",
                  tab: "Tipo de página",
                  title: "Tipo de página",
                  help: "Las secciones de tu web que más tráfico reciben aquí.",
                  segments: report.pageTypes,
                },
                {
                  key: "country",
                  tab: "País",
                  title: "País",
                  help: "Códigos de país de tres letras de Search Console.",
                  segments: report.countries,
                },
              ]}
            />
          </div>
        )
      ) : null}
    </div>
  );
}

type Report = Extract<
  Awaited<ReturnType<typeof getDiscoverReport>>,
  { connected: true }
>;

function Delta({ now, before }: { now: number; before: number }) {
  if (before === 0 && now === 0) return null;
  const change = relativeChange(now, before);
  const diff = now - before;
  return (
    <span
      className={`text-xs tabular-nums ${
        diff === 0
          ? "text-muted-foreground"
          : diff > 0
            ? "text-success"
            : "text-destructive"
      }`}
    >
      {change === null
        ? "nuevo"
        : `${change > 0 ? "+" : ""}${percent.format(change)}`}{" "}
      vs. periodo anterior
    </span>
  );
}

function Kpis({ report, what }: { report: Report; what: string }) {
  const { totals, prevTotals, webClicks } = report;
  const all = totals.clicks + webClicks;
  const cards: { label: string; value: string; extra: ReactNode }[] = [
    {
      label: "Clics",
      value: integer.format(totals.clicks),
      extra: <Delta now={totals.clicks} before={prevTotals.clicks} />,
    },
    {
      label: "Impresiones",
      value: integer.format(totals.impressions),
      extra: <Delta now={totals.impressions} before={prevTotals.impressions} />,
    },
    {
      label: "CTR",
      value: percent.format(totals.ctr),
      extra: <Delta now={totals.ctr} before={prevTotals.ctr} />,
    },
    {
      label: "Peso sobre la búsqueda web",
      value: all > 0 ? percent.format(totals.clicks / all) : "—",
      extra: (
        <span className="text-xs text-muted-foreground">
          {integer.format(webClicks)} clics de búsqueda web frente a{" "}
          {integer.format(totals.clicks)} de {what}
        </span>
      ),
    },
  ];
  return (
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
            {card.extra}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Highlights({ report, what }: { report: Report; what: string }) {
  const lines: { good: boolean | null; node: ReactNode }[] = [];
  const change = relativeChange(
    report.totals.clicks,
    report.prevTotals.clicks,
  );
  if (change !== null) {
    const diff = report.totals.clicks - report.prevTotals.clicks;
    lines.push({
      good: diff >= 0,
      node: (
        <>
          Los clics de {what} {diff >= 0 ? "suben" : "bajan"}{" "}
          <strong>
            {percent.format(Math.abs(change))} ({signed(diff)})
          </strong>
          .
        </>
      ),
    });
  }
  const top = report.topPages[0];
  if (top) {
    const share =
      report.totals.clicks > 0 ? top.clicks / report.totals.clicks : 0;
    lines.push({
      good: null,
      node: (
        <>
          Tu contenido estrella es <PageLink url={top.url} />:{" "}
          <strong>{percent.format(share)}</strong> de los clics.
          {share > 0.5
            ? " El tráfico depende demasiado de una sola página."
            : ""}
        </>
      ),
    });
  }
  const winner = report.pageChanges.winners[0];
  if (winner) {
    lines.push({
      good: true,
      node: (
        <>
          Mayor subida: <PageLink url={winner.key} />{" "}
          <strong>{signed(winner.clicksDelta)}</strong>
          {winner.status === "new" ? " (apareció este periodo)" : ""}.
        </>
      ),
    });
  }
  const loser = report.pageChanges.losers[0];
  if (loser) {
    lines.push({
      good: false,
      node: (
        <>
          Mayor caída: <PageLink url={loser.key} />{" "}
          <strong>{signed(loser.clicksDelta)}</strong>.
        </>
      ),
    });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lo importante</CardTitle>
        <p className="text-xs text-muted-foreground">
          {shortDate.format(new Date(`${report.range.startDate}T00:00:00Z`))} –{" "}
          {shortDate.format(new Date(`${report.range.endDate}T00:00:00Z`))}
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {lines.map((line, index) => (
            <li key={index} className="flex gap-3 text-sm">
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${
                  line.good === null
                    ? "bg-muted-foreground/60"
                    : line.good
                      ? "bg-success"
                      : "bg-destructive"
                }`}
                aria-hidden
              />
              <span>{line.node}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TrendCard({ report }: { report: Report }) {
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
        <ChartContainer config={chartConfig} className="h-60 w-full">
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

function TopPages({ report }: { report: Report }) {
  return (
    <TableCard>
      <div className="border-b border-border p-4">
        <h3 className="font-medium">Páginas con más tráfico</h3>
        <p className="text-xs text-muted-foreground">
          Las {report.topPages.length} que más clics reciben en este periodo,
          con su variación.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Página</TableHead>
            <TableHead className="text-right">Clics</TableHead>
            <TableHead className="text-right">Cambio</TableHead>
            <TableHead className="text-right">Impresiones</TableHead>
            <TableHead className="text-right">CTR</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.topPages.map((page) => {
            const delta = page.clicks - page.prevClicks;
            return (
              <TableRow key={page.url}>
                <TableCell className="min-w-64 align-top">
                  <PageLink url={page.url} />
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {integer.format(page.clicks)}
                </TableCell>
                <TableCell
                  className={`text-right whitespace-nowrap tabular-nums ${
                    delta === 0
                      ? "text-muted-foreground"
                      : delta > 0
                        ? "text-success"
                        : "text-destructive"
                  }`}
                >
                  {signed(delta)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {integer.format(page.impressions)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {percent.format(page.ctr)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableCard>
  );
}
