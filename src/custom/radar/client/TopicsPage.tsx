import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Bar, BarChart } from "recharts";
import { ChevronDown, ListPlus } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/client/components/ui/dialog";
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
import { Textarea } from "@/client/components/ui/textarea";
import { RadarControls } from "@/custom/radar/client/RadarControls";
import { GoogleLink, PageLink } from "@/custom/radar/client/RadarLinks";
import {
  periodInput,
  useRadarFilters,
} from "@/custom/radar/client/useRadarFilters";
import {
  decimal,
  integer,
  percent,
  relativeChange,
  signed,
} from "@/custom/radar/format";
import {
  getTopicsReport,
  saveRadarTopics,
} from "@/serverFunctions/radarTopics";

type Report = Extract<
  Awaited<ReturnType<typeof getTopicsReport>>,
  { connected: true }
>;
type Topic = Report["topics"][number];

const chartConfig = {
  prevClicks: { label: "Periodo anterior", color: "var(--muted-foreground)" },
  clicks: { label: "Este periodo", color: "var(--primary)" },
} satisfies ChartConfig;

const OTHERS = "Otros temas";

export function TopicsPage({ projectId }: { projectId: string }) {
  const { filters, update, ready } = useRadarFilters();
  const input = { ...periodInput(filters), includeBrand: filters.includeBrand };
  const hasDates =
    filters.range !== "custom" || Boolean(filters.startDate && filters.endDate);
  const query = useQuery({
    queryKey: ["radar-topics", projectId, input],
    queryFn: () => getTopicsReport({ data: { projectId, ...input } }),
    enabled: ready && hasDates,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const report = query.data?.connected ? query.data : null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        title="Temas"
        description="Tus consultas agrupadas por temas, no por palabras sueltas: qué temas te traen tráfico, cuáles crecen o caen y en cuáles estás cerca de dar el salto. Los temas se deducen solos de tus propias consultas; puedes definir los tuyos."
        actions={
          <RadarControls
            filters={filters}
            onChange={update}
            showBrandSwitch={report?.brand.hasBrand}
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
                <Link to="/p/$projectId/search-performance" params={{ projectId }} />
              }
            >
              Ir a Search Console
            </Button>
          </CardContent>
        </Card>
      ) : report ? (
        <div
          className={`space-y-6 ${query.isPlaceholderData ? "opacity-60 transition-opacity" : ""}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Se analizan las {integer.format(report.analysedQueries)} consultas
              con más tráfico (límite de Search Console).
            </p>
            <CustomTopicsDialog projectId={projectId} custom={report.custom} />
          </div>
          <Insights report={report} />
          <TopicsChart topics={report.topics} />
          <TopicsTable topics={report.topics} />
        </div>
      ) : null}
    </div>
  );
}

function Insights({ report }: { report: Report }) {
  const lines = useMemo(() => {
    const out: { tone: "good" | "bad" | "info"; node: ReactNode }[] = [];
    const real = report.topics.filter((topic) => topic.label !== OTHERS);
    const totalClicks = report.topics.reduce((sum, topic) => sum + topic.clicks, 0);
    const totalImpressions = report.topics.reduce(
      (sum, topic) => sum + topic.impressions,
      0,
    );
    const top = real[0];
    if (top && totalClicks > 0) {
      out.push({
        tone: "info",
        node: (
          <>
            El tema que más clics trae es <strong>«{top.label}»</strong>:{" "}
            {percent.format(top.clicks / totalClicks)} del total (
            {integer.format(top.clicks)} clics en {integer.format(top.queries)}{" "}
            consultas).
          </>
        ),
      });
    }
    const movers = real
      .filter((topic) => Math.max(topic.clicks, topic.prev.clicks) >= 10)
      .map((topic) => ({ topic, delta: topic.clicks - topic.prev.clicks }));
    const grow = [...movers].sort((a, b) => b.delta - a.delta)[0];
    if (grow && grow.delta > 0) {
      const change = relativeChange(grow.topic.clicks, grow.topic.prev.clicks);
      out.push({
        tone: "good",
        node: (
          <>
            Crece más: <strong>«{grow.topic.label}»</strong> ({signed(grow.delta)}{" "}
            clics{change !== null ? `, ${percent.format(change)}` : ""}).
          </>
        ),
      });
    }
    const fall = [...movers].sort((a, b) => a.delta - b.delta)[0];
    if (fall && fall.delta < 0) {
      const change = relativeChange(fall.topic.clicks, fall.topic.prev.clicks);
      out.push({
        tone: "bad",
        node: (
          <>
            Cae más: <strong>«{fall.topic.label}»</strong> ({signed(fall.delta)}{" "}
            clics{change !== null ? `, ${percent.format(change)}` : ""}).
          </>
        ),
      });
    }
    const visible = real.find(
      (topic) =>
        totalImpressions > 0 &&
        topic.impressions / totalImpressions >= 0.05 &&
        topic.position > 10,
    );
    if (visible) {
      out.push({
        tone: "info",
        node: (
          <>
            <strong>«{visible.label}»</strong> aparece mucho (
            {integer.format(visible.impressions)} impresiones) pero con posición
            media {decimal.format(visible.position)}: hay mucho margen si
            consigues subir.
          </>
        ),
      });
    }
    const reach = [...real]
      .filter(
        (topic) =>
          totalImpressions > 0 &&
          topic.impressions / totalImpressions >= 0.02 &&
          topic.nearTopShare >= 0.4,
      )
      .sort((a, b) => b.nearTopShare * b.impressions - a.nearTopShare * a.impressions)[0];
    if (reach) {
      out.push({
        tone: "good",
        node: (
          <>
            <strong>«{reach.label}»</strong> está al alcance:{" "}
            {percent.format(reach.nearTopShare)} de sus impresiones están entre
            las posiciones 4 y 20.
          </>
        ),
      });
    }
    if (report.othersShare >= 0.25) {
      out.push({
        tone: "info",
        node: (
          <>
            El {percent.format(report.othersShare)} de las impresiones no
            encaja en ningún tema. Define tus propios temas con «Mis temas»
            para agruparlas como tú piensas.
          </>
        ),
      });
    }
    return out;
  }, [report]);

  const dot = {
    good: "bg-success",
    bad: "bg-destructive",
    info: "bg-muted-foreground/60",
  } as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lo importante</CardTitle>
      </CardHeader>
      <CardContent>
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay datos suficientes en este periodo para sacar conclusiones.
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

function TopicsChart({ topics }: { topics: Topic[] }) {
  const rows = topics
    .filter((topic) => topic.label !== OTHERS)
    .slice(0, 12)
    .map((topic) => ({
      label: topic.label,
      clicks: topic.clicks,
      prevClicks: topic.prev.clicks,
    }));
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Clics por tema</CardTitle>
        <p className="text-xs text-muted-foreground">
          Los 12 temas con más clics, frente al periodo anterior.
        </p>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="w-full"
          style={{ height: Math.max(rows.length * 44 + 40, 160) }}
        >
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          >
            <ChartGrid horizontal={false} vertical />
            <ChartXAxis
              type="number"
              tickFormatter={(value: number) => integer.format(value)}
            />
            <ChartYAxis type="category" dataKey="label" width={170} interval={0} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  valueFormatter={(value) => `${integer.format(Number(value))} clics`}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar
              dataKey="prevClicks"
              fill="var(--color-prevClicks)"
              radius={[0, 2, 2, 0]}
              maxBarSize={14}
            />
            <Bar
              dataKey="clicks"
              fill="var(--color-clicks)"
              radius={[0, 2, 2, 0]}
              maxBarSize={14}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function TopicsTable({ topics }: { topics: Topic[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <TableCard>
      <div className="border-b border-border p-4">
        <h3 className="font-medium">Todos los temas</h3>
        <p className="text-xs text-muted-foreground">
          Pulsa un tema para ver sus consultas, subtemas y páginas. «Al
          alcance» es el porcentaje de sus impresiones que están entre las
          posiciones 4 y 20.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tema</TableHead>
            <TableHead className="text-right">Consultas</TableHead>
            <TableHead className="text-right">Clics</TableHead>
            <TableHead className="text-right">Cambio</TableHead>
            <TableHead className="text-right">Impresiones</TableHead>
            <TableHead className="text-right">Posición</TableHead>
            <TableHead className="text-right">Al alcance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {topics.map((topic) => {
            const delta = topic.clicks - topic.prev.clicks;
            const isOpen = open === topic.id;
            return (
              <Fragment key={topic.id}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => setOpen(isOpen ? null : topic.id)}
                >
                  <TableCell className="min-w-56 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <ChevronDown
                        className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                      {topic.label}
                      {topic.custom ? (
                        <span className="rounded bg-primary/10 px-1.5 text-[0.65rem] font-semibold text-primary">
                          tuyo
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {integer.format(topic.queries)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {integer.format(topic.clicks)}
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
                  <TableCell className="text-right tabular-nums">
                    {integer.format(topic.impressions)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {topic.impressions > 0 ? decimal.format(topic.position) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {percent.format(topic.nearTopShare)}
                  </TableCell>
                </TableRow>
                {isOpen ? (
                  <TableRow>
                    <TableCell colSpan={7} className="bg-muted/30">
                      <div className="grid gap-4 py-2 lg:grid-cols-3">
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            Consultas principales
                          </p>
                          <ul className="space-y-1 text-sm">
                            {topic.topQueries.map((item) => (
                              <li key={item.query} className="flex justify-between gap-3">
                                <GoogleLink query={item.query} label={item.query} subtle />
                                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                  {integer.format(item.clicks)} clics · pos.{" "}
                                  {decimal.format(item.position)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            Dentro del tema
                          </p>
                          {topic.subtopics.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Sin subtemas claros.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {topic.subtopics.map((sub) => (
                                <span
                                  key={sub.label}
                                  className="rounded-md bg-muted px-2 py-1 text-xs"
                                >
                                  {sub.label}{" "}
                                  <span className="text-muted-foreground">
                                    ({sub.queries})
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            Páginas que lo cubren
                          </p>
                          {topic.pages.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Sin datos de páginas.
                            </p>
                          ) : (
                            <ul className="space-y-1 text-sm">
                              {topic.pages.map((page) => (
                                <li key={page.page} className="space-y-0.5">
                                  <PageLink url={page.page} />
                                  <p className="text-xs text-muted-foreground tabular-nums">
                                    {integer.format(page.clicks)} clics ·{" "}
                                    {integer.format(page.impressions)} impresiones
                                  </p>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </TableCard>
  );
}

function parseCustom(text: string): { name: string; terms: string[] }[] {
  return text
    .split("\n")
    .flatMap((line) => {
      const [name, rest] = line.split(":");
      const terms = (rest ?? "")
        .split(",")
        .map((term) => term.trim())
        .filter((term) => term.length >= 2);
      return name?.trim().length >= 2 && terms.length > 0
        ? [{ name: name.trim(), terms }]
        : [];
    });
}

/** Lets the user define topics by hand: a name and the words that belong. */
function CustomTopicsDialog({
  projectId,
  custom,
}: {
  projectId: string;
  custom: Report["custom"];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const save = useMutation({
    mutationFn: (topics: { name: string; terms: string[] }[]) =>
      saveRadarTopics({ data: { projectId, topics } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["radar-topics", projectId] });
      setOpen(false);
    },
  });
  const parsed = parseCustom(text);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setText(custom.map((topic) => `${topic.name}: ${topic.terms.join(", ")}`).join("\n"));
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <ListPlus className="size-4" aria-hidden />
        Mis temas{custom.length > 0 ? ` (${custom.length})` : ""}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Mis temas</DialogTitle>
          <DialogDescription>
            Define tus propios temas, uno por línea: el nombre, dos puntos y las
            palabras que lo identifican separadas por comas. Una consulta que
            contenga alguna de esas palabras irá a tu tema, antes que a los
            automáticos.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={7}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            "Herencias: herencia, testamento, legítima\nIncapacidad: incapacidad temporal, baja médica"
          }
          aria-label="Mis temas"
        />
        <p className="text-xs text-muted-foreground">
          {parsed.length} {parsed.length === 1 ? "tema válido" : "temas válidos"}.
          Déjalo vacío para volver al agrupado automático.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate(parsed)}>
            {save.isPending ? "Guardando…" : "Guardar temas"}
          </Button>
        </DialogFooter>
        {save.isError ? (
          <p className="text-sm text-destructive">No se pudo guardar. Prueba de nuevo.</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
