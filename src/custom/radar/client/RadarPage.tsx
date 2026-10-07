import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Line, LineChart } from "recharts";
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
import { Label } from "@/client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Skeleton } from "@/client/components/ui/skeleton";
import { Switch } from "@/client/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import type { RadarReport } from "@/custom/radar/actions";
import { ActionPlan } from "@/custom/radar/client/ActionPlan";
import { RadarTables } from "@/custom/radar/client/RadarTables";
import {
  decimal,
  integer,
  percent,
  relativeChange,
} from "@/custom/radar/format";
import { getRadarReport } from "@/serverFunctions/radar";

type Range = "last_28_days" | "last_3_months";

const RANGE_ITEMS = [
  { value: "last_28_days", label: "Últimos 28 días" },
  { value: "last_3_months", label: "Últimos 3 meses" },
];

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
  const [range, setRange] = useState<Range>("last_28_days");
  const [includeBrand, setIncludeBrand] = useState(false);
  const query = useQuery({
    queryKey: ["radar", projectId, range, includeBrand],
    queryFn: () =>
      getRadarReport({ data: { projectId, range, includeBrand } }),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const report = query.data?.connected ? query.data : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        title="Radar SEO"
        description="Qué ha cambiado en Search Console y qué hacer con ello, página por página. Datos gratuitos, sin gasto en DataForSEO."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            {report?.brand.hasBrand ? (
              <div className="flex items-center gap-2">
                <Switch
                  id="radar-brand"
                  checked={includeBrand}
                  onCheckedChange={setIncludeBrand}
                />
                <Label htmlFor="radar-brand" className="text-sm">
                  Incluir consultas de marca
                </Label>
              </div>
            ) : null}
            <Select
              items={RANGE_ITEMS}
              value={range}
              onValueChange={(value) => setRange(value as Range)}
            >
              <SelectTrigger size="sm" aria-label="Periodo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          className={query.isPlaceholderData ? "opacity-60 transition-opacity" : ""}
        >
          <div className="space-y-6">
            <Summary report={report} />
            <ActionPlan projectId={projectId} report={report} />
            <div className="grid gap-4 lg:grid-cols-2">
              <TrendCard report={report} />
              <BandsCard report={report} />
            </div>
            <RadarTables report={report} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
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

function Summary({ report }: { report: RadarReport }) {
  const { totals, prevTotals, brand } = report;
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
    <section className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {shortDate.format(new Date(`${report.range.startDate}T00:00:00Z`))} –{" "}
        {shortDate.format(new Date(`${report.range.endDate}T00:00:00Z`))},
        comparado con los mismos días justo antes.
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
      {brand.hasBrand ? (
        <p className="text-sm text-muted-foreground">
          De los clics de las mejores 1000 consultas,{" "}
          <strong className="text-foreground">
            {integer.format(brand.clicks)}
          </strong>{" "}
          son de marca y{" "}
          <strong className="text-foreground">
            {integer.format(brand.otherClicks)}
          </strong>{" "}
          sin marca (antes {integer.format(brand.prevClicks)} y{" "}
          {integer.format(brand.prevOtherClicks)}).{" "}
          {brand.included
            ? "El análisis incluye las consultas de marca."
            : "El análisis las deja fuera para centrarse en lo que puedes mejorar."}
        </p>
      ) : null}
    </section>
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
            <ChartYAxis tickFormatter={(value: number) => integer.format(value)} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  valueFormatter={(value) => `${integer.format(Number(value))} consultas`}
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
