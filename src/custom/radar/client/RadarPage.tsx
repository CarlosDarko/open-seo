import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
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
import type { ChangeRow } from "@/custom/radar/radarAnalysis";
import { getRadarReport } from "@/serverFunctions/radar";

type Report = Extract<
  Awaited<ReturnType<typeof getRadarReport>>,
  { connected: true }
>;
type Range = "last_28_days" | "last_3_months";

const RANGE_ITEMS = [
  { value: "last_28_days", label: "Últimos 28 días" },
  { value: "last_3_months", label: "Últimos 3 meses" },
];

const integer = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat("es-ES", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
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

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${integer.format(value)}`;
}

function relativeChange(now: number, before: number): number | null {
  return before > 0 ? (now - before) / before : null;
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

export function RadarPage({ projectId }: { projectId: string }) {
  const [range, setRange] = useState<Range>("last_28_days");
  const query = useQuery({
    queryKey: ["radar", projectId, range],
    queryFn: () => getRadarReport({ data: { projectId, range } }),
    staleTime: 5 * 60_000,
  });
  const report = query.data?.connected ? query.data : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        title="Radar SEO"
        description="Qué ha cambiado en Search Console y dónde hay tráfico fácil de ganar. Datos gratuitos, sin gasto en DataForSEO."
        actions={
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
        <NotConnected projectId={projectId} />
      ) : report ? (
        <>
          <Highlights report={report} />
          <Kpis report={report} />
          <TrendCard report={report} />
          <Details report={report} />
        </>
      ) : null}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function NotConnected({ projectId }: { projectId: string }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-8 text-center">
        <p className="font-medium">Este proyecto no tiene Search Console conectado</p>
        <p className="text-sm text-muted-foreground">
          Conéctalo desde el Panel para ver aquí los cambios y las oportunidades.
        </p>
        <Button
          render={<Link to="/p/$projectId" params={{ projectId }} />}
          variant="outline"
        >
          Ir al Panel
        </Button>
      </CardContent>
    </Card>
  );
}

function Highlights({ report }: { report: Report }) {
  const items: ReactNode[] = [];
  const clicksChange = relativeChange(
    report.totals.clicks,
    report.prevTotals.clicks,
  );
  if (clicksChange !== null) {
    const diff = report.totals.clicks - report.prevTotals.clicks;
    items.push(
      <>
        Los clics {diff >= 0 ? "suben" : "bajan"}{" "}
        <strong>
          {percent.format(Math.abs(clicksChange))} ({signed(diff)})
        </strong>{" "}
        frente al periodo anterior.
      </>,
    );
  }
  const topLoser = report.pageChanges.losers[0];
  if (topLoser) {
    items.push(
      <>
        La página que más pierde es{" "}
        <strong className="break-all">{pathOf(topLoser.key)}</strong> (
        {signed(topLoser.clicksDelta)} clics). Revísala primero.
      </>,
    );
  }
  const topWinner = report.pageChanges.winners[0];
  if (topWinner) {
    items.push(
      <>
        La que más gana es{" "}
        <strong className="break-all">{pathOf(topWinner.key)}</strong> (
        {signed(topWinner.clicksDelta)} clics).
      </>,
    );
  }
  const ctrGain = report.ctrOpportunities.reduce(
    (sum, row) => sum + row.potentialClicks,
    0,
  );
  if (ctrGain > 0) {
    items.push(
      <>
        Mejorando título y descripción de {report.ctrOpportunities.length}{" "}
        consultas de primera página podrías ganar unos{" "}
        <strong>{integer.format(ctrGain)} clics</strong>.
      </>,
    );
  }
  const topGain = report.nearTop.reduce(
    (sum, row) => sum + row.potentialClicks,
    0,
  );
  if (topGain > 0) {
    items.push(
      <>
        {report.nearTop.length} consultas están cerca del top 3: subirlas
        valdría unos <strong>{integer.format(topGain)} clics</strong>.
      </>,
    );
  }
  if (report.cannibalized.length > 0) {
    items.push(
      <>
        <strong>{report.cannibalized.length}</strong> consultas tienen dos o
        más páginas compitiendo entre sí.
      </>,
    );
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
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay datos suficientes en este periodo.
          </p>
        ) : (
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        )}
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

function Kpis({ report }: { report: Report }) {
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
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
    </section>
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
        <ChartContainer config={chartConfig} className="h-64 w-full">
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
            <ChartYAxis tickFormatter={(value: number) => integer.format(value)} />
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

type DetailTab = "changes" | "opportunities" | "cannibal";

function Details({ report }: { report: Report }) {
  const [tab, setTab] = useState<DetailTab>("changes");
  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(value) => setTab(value as DetailTab)}>
        <TabsList>
          <TabsTrigger value="changes">Ganadores y perdedores</TabsTrigger>
          <TabsTrigger value="opportunities">Oportunidades</TabsTrigger>
          <TabsTrigger value="cannibal">Canibalización</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "changes" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChangeTable
            title="Páginas que más ganan"
            rows={report.pageChanges.winners}
            asPath
          />
          <ChangeTable
            title="Páginas que más pierden"
            rows={report.pageChanges.losers}
            asPath
          />
          <ChangeTable
            title="Consultas que más ganan"
            rows={report.queryChanges.winners}
          />
          <ChangeTable
            title="Consultas que más pierden"
            rows={report.queryChanges.losers}
          />
        </div>
      ) : tab === "opportunities" ? (
        <div className="space-y-4">
          <OpportunityTable
            title="Casi en el top 3"
            help="Consultas entre las posiciones 5 y 20. «Clics extra» es lo que ganarías si llegaran a la posición 3."
            empty="No hay consultas con potencial claro en este periodo."
            head={["Consulta", "Posición", "Impresiones", "Clics extra"]}
            rows={report.nearTop.map((row) => ({
              key: `${row.query}|${row.page}`,
              cells: [
                <QueryCell
                  key="q"
                  text={row.query}
                  sub={pathOf(row.page)}
                />,
                decimal.format(row.position),
                integer.format(row.impressions),
                <strong key="p">+{integer.format(row.potentialClicks)}</strong>,
              ],
            }))}
          />
          <OpportunityTable
            title="CTR bajo para su posición"
            help="Consultas de primera página con menos clics de los habituales en esa posición: reescribe el título y la descripción de la página."
            empty="No hay consultas con CTR claramente bajo en este periodo."
            head={["Consulta", "Posición", "CTR", "CTR habitual", "Clics extra"]}
            rows={report.ctrOpportunities.map((row) => ({
              key: row.query,
              cells: [
                <QueryCell key="q" text={row.query} />,
                decimal.format(row.position),
                percent.format(row.ctr),
                percent.format(row.expectedCtr),
                <strong key="p">+{integer.format(row.potentialClicks)}</strong>,
              ],
            }))}
          />
        </div>
      ) : (
        <OpportunityTable
          title="Páginas que compiten por la misma consulta"
          help="Si dos páginas se reparten una consulta, Google duda entre ellas. Valora fusionarlas, diferenciar su intención o enlazar una a la otra."
          empty="No se detecta canibalización en este periodo."
          head={["Consulta", "Páginas implicadas", "Impresiones"]}
          rows={report.cannibalized.map((row) => ({
            key: row.query,
            cells: [
              <QueryCell key="q" text={row.query} />,
              <ul key="pages" className="space-y-0.5">
                {row.pages.map((page) => (
                  <li key={page.page} className="break-all text-xs">
                    {pathOf(page.page)}{" "}
                    <span className="text-muted-foreground">
                      (pos. {decimal.format(page.position)} ·{" "}
                      {integer.format(page.impressions)} impr.)
                    </span>
                  </li>
                ))}
              </ul>,
              integer.format(row.totalImpressions),
            ],
          }))}
        />
      )}
    </div>
  );
}

function QueryCell({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="max-w-80">
      <p className="truncate">{text}</p>
      {sub ? (
        <p className="truncate text-xs text-muted-foreground">{sub}</p>
      ) : null}
    </div>
  );
}

function ChangeTable({
  title,
  rows,
  asPath,
}: {
  title: string;
  rows: ChangeRow[];
  asPath?: boolean;
}) {
  return (
    <TableCard>
      <div className="border-b border-border p-4">
        <h2 className="font-medium">{title}</h2>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{asPath ? "Página" : "Consulta"}</TableHead>
            <TableHead className="text-right">Clics</TableHead>
            <TableHead className="text-right">Cambio</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={3}
                className="py-6 text-center text-muted-foreground"
              >
                Sin cambios relevantes.
              </TableCell>
            </TableRow>
          ) : null}
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="max-w-64 truncate">
                {asPath ? pathOf(row.key) : row.key}
                {row.status !== "changed" ? (
                  <span className="ml-1 rounded bg-muted px-1 text-[0.65rem] text-muted-foreground">
                    {row.status === "new" ? "nueva" : "sin tráfico"}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {integer.format(row.clicks)}
                <span className="ml-1 text-xs text-muted-foreground">
                  ({integer.format(row.prevClicks)})
                </span>
              </TableCell>
              <TableCell
                className={`text-right tabular-nums ${
                  row.clicksDelta > 0 ? "text-success" : "text-destructive"
                }`}
              >
                {signed(row.clicksDelta)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}

function OpportunityTable({
  title,
  help,
  empty,
  head,
  rows,
}: {
  title: string;
  help: string;
  empty: string;
  head: string[];
  rows: { key: string; cells: ReactNode[] }[];
}) {
  return (
    <TableCard>
      <div className="border-b border-border p-4">
        <h2 className="font-medium">{title}</h2>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {head.map((label, index) => (
              <TableHead key={label} className={index > 0 ? "text-right" : ""}>
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={head.length}
                className="py-6 text-center text-muted-foreground"
              >
                {empty}
              </TableCell>
            </TableRow>
          ) : null}
          {rows.map((row) => (
            <TableRow key={row.key}>
              {row.cells.map((cell, index) => (
                <TableCell
                  key={index}
                  className={index > 0 ? "text-right tabular-nums" : ""}
                >
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}
