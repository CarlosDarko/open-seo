import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Download,
  Info,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Bar, BarChart } from "recharts";
import {
  ChartGrid,
  ChartXAxis,
  ChartYAxis,
} from "@/client/components/ChartAxes";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
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
import { Input } from "@/client/components/ui/input";
import { Progress } from "@/client/components/ui/progress";
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
import {
  costEventsQuery,
  costOverviewQuery,
} from "@/custom/costs/client/queries";
import {
  COST_FEATURES,
  addDays,
  costFeatureLabel,
  formatEur,
  type CostAlert,
  type CostSettings,
} from "@/custom/costs/shared";
import {
  exportCostEvents,
  refreshProviderBalance,
  saveCostSettings,
  type getCostOverview,
} from "@/serverFunctions/costs";

type Overview = Awaited<ReturnType<typeof getCostOverview>>;

const PAGE_SIZE = 20;
const ALL = "all";
const dateTime = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  dateStyle: "short",
  timeStyle: "short",
});
const monthName = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const chartConfig = {
  eur: { label: "Gasto", color: "var(--primary)" },
} satisfies ChartConfig;

export function CostsPage() {
  const overviewQuery = useQuery(costOverviewQuery());
  const overview = overviewQuery.data;
  const queryClient = useQueryClient();

  const refreshBalance = useMutation({
    mutationFn: () => refreshProviderBalance(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["costs"] }),
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        title="Costes"
        description="Todo el gasto en DataForSEO, en euros."
        actions={
          overview ? (
            <p className="max-w-xs text-right text-xs text-muted-foreground">
              DataForSEO cobra en dólares. Tipo de cambio aplicado: 1 USD ={" "}
              {overview.fx.rate.toFixed(4).replace(".", ",")} €{" "}
              {overview.fx.source === "bce" && overview.fx.asOf
                ? `(BCE, ${overview.fx.asOf.split("-").reverse().join("/")})`
                : "(aproximado, sin conexión con el BCE)"}
            </p>
          ) : null
        }
      />

      {overviewQuery.isError ? (
        <QueryError
          variant="card"
          error={overviewQuery.error}
          fallback="No se pudieron cargar los costes."
          onRetry={() => void overviewQuery.refetch()}
          isRetrying={overviewQuery.isFetching}
        />
      ) : null}

      {!overview ? (
        overviewQuery.isError ? null : (
          <LoadingSkeleton />
        )
      ) : (
        <>
          {overview.alerts.length > 0 ? (
            <div className="space-y-2">
              {overview.alerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} />
              ))}
            </div>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Hoy" value={formatEur(overview.totals.today)} />
            <KpiCard
              label="Últimos 7 días"
              value={formatEur(overview.totals.last7)}
            />
            <MonthKpi overview={overview} />
            <BalanceKpi
              overview={overview}
              refreshing={refreshBalance.isPending}
              onRefresh={() => refreshBalance.mutate()}
            />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Gasto diario</CardTitle>
              <p className="text-xs text-muted-foreground">Últimos 30 días</p>
            </CardHeader>
            <CardContent>
              <DailyChart data={overview.daily} />
            </CardContent>
          </Card>

          <Breakdown overview={overview} />

          <History />

          <div className="grid gap-6 lg:grid-cols-2">
            <SettingsForm settings={overview.settings} />
            <Reconciliation overview={overview} />
          </div>
        </>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

function AlertRow({ alert }: { alert: CostAlert }) {
  const isError = alert.level === "error";
  const Icon = isError ? XCircle : AlertTriangle;
  return (
    <Alert variant={isError ? "destructive" : "warning"}>
      <Icon />
      <AlertTitle>{alert.title}</AlertTitle>
      <AlertDescription className="text-foreground/80">
        {alert.detail}
      </AlertDescription>
    </Alert>
  );
}

function KpiCard({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="text-2xl leading-tight font-semibold tabular-nums">
          {value}
        </p>
        {children}
      </CardContent>
    </Card>
  );
}

function MonthKpi({ overview }: { overview: Overview }) {
  const budget = overview.settings.monthlyBudgetEur;
  const pct = budget > 0 ? (overview.totals.month / budget) * 100 : 0;
  const indicator =
    pct >= 100
      ? "[&_[data-slot=progress-indicator]]:bg-destructive"
      : pct >= overview.settings.warnAtPercent
        ? "[&_[data-slot=progress-indicator]]:bg-warning"
        : "";
  return (
    <KpiCard label="Este mes" value={formatEur(overview.totals.month)}>
      {budget > 0 ? (
        <>
          <Progress
            value={Math.min(pct, 100)}
            aria-label="Gasto del mes frente al presupuesto"
            className={`mt-2 gap-0 ${indicator}`}
          />
          <p className="text-xs text-muted-foreground">
            {Math.round(pct)} % de {formatEur(budget)} · proyección{" "}
            {formatEur(overview.projectedMonthEur)}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sin presupuesto definido · proyección{" "}
          {formatEur(overview.projectedMonthEur)}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Mes anterior: {formatEur(overview.totals.previousMonth)}
      </p>
    </KpiCard>
  );
}

function BalanceKpi({
  overview,
  refreshing,
  onRefresh,
}: {
  overview: Overview;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const balance = overview.balance;
  return (
    <Card>
      <CardContent className="space-y-1">
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Saldo en DataForSEO
          </p>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Actualizar saldo"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
          </Button>
        </div>
        {balance ? (
          <>
            <p className="text-2xl leading-tight font-semibold tabular-nums">
              {formatEur(balance.eur)}
            </p>
            <p className="text-xs text-muted-foreground">
              {balance.usd.toFixed(2).replace(".", ",")} USD
              {balance.daysLeft !== null
                ? ` · para unos ${balance.daysLeft} días al ritmo actual`
                : ""}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No disponible ahora</p>
        )}
      </CardContent>
    </Card>
  );
}

function DailyChart({ data }: { data: { day: string; eur: number }[] }) {
  if (!data.some((point) => point.eur > 0)) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
        Todavía no hay gasto registrado
      </div>
    );
  }
  return (
    <ChartContainer config={chartConfig} className="h-44 w-full">
      <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <ChartGrid />
        <ChartXAxis
          dataKey="day"
          tickFormatter={(day: string) => `${day.slice(8)}/${day.slice(5, 7)}`}
          minTickGap={24}
        />
        <ChartYAxis tickFormatter={(value: number) => formatEur(value)} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label: unknown) =>
                typeof label === "string"
                  ? label.split("-").reverse().join("/")
                  : ""
              }
              valueFormatter={(value) => formatEur(Number(value))}
            />
          }
        />
        <Bar
          dataKey="eur"
          fill="var(--color-eur)"
          radius={[2, 2, 0, 0]}
          maxBarSize={14}
        />
      </BarChart>
    </ChartContainer>
  );
}

type BreakdownTab = "feature" | "project" | "user";

function Breakdown({ overview }: { overview: Overview }) {
  const [tab, setTab] = useState<BreakdownTab>("feature");
  const rows =
    tab === "feature"
      ? overview.byFeature.map((row) => ({
          key: row.feature,
          name: row.label,
          eur: row.eur,
          calls: row.calls,
        }))
      : tab === "project"
        ? overview.byProject.map((row) => ({
            key: row.projectId ?? "none",
            name: row.name,
            eur: row.eur,
            calls: row.calls,
          }))
        : overview.byUser.map((row) => ({
            key: row.email,
            name: row.email,
            eur: row.eur,
            calls: row.calls,
          }));
  const total = rows.reduce((sum, row) => sum + row.eur, 0);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Dónde se va el gasto este mes</CardTitle>
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as BreakdownTab)}
        >
          <TabsList>
            <TabsTrigger value="feature">Por función</TabsTrigger>
            <TabsTrigger value="project">Por proyecto</TabsTrigger>
            <TabsTrigger value="user">Por persona</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Sin gasto este mes.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.key} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate">{row.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatEur(row.eur)}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {row.calls} consulta{row.calls === 1 ? "" : "s"}
                    </span>
                  </span>
                </div>
                <Progress
                  value={total > 0 ? (row.eur / total) * 100 : 0}
                  aria-label={`${row.name}: parte del gasto`}
                  className="mt-1 gap-0 [&_[data-slot=progress-track]]:h-1.5"
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function monthOptions(day: string) {
  const options = [{ value: ALL, label: "Todo el historial" }];
  let cursor = `${day.slice(0, 7)}-01`;
  for (let index = 0; index < 12; index += 1) {
    const [y, m] = cursor.split("-").map(Number);
    options.push({
      value: cursor.slice(0, 7),
      label: monthName.format(new Date(Date.UTC(y, m - 1, 1))),
    });
    cursor = addDays(cursor, -1).slice(0, 7) + "-01";
  }
  return options;
}

const FEATURE_ITEMS = [
  { value: ALL, label: "Todas las funciones" },
  ...COST_FEATURES.map((key) => ({ value: key, label: costFeatureLabel(key) })),
];

function History() {
  const overview = useQuery(costOverviewQuery()).data;
  const [month, setMonth] = useState(ALL);
  const [feature, setFeature] = useState(ALL);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const filters = {
    month: month === ALL ? undefined : month,
    feature: feature === ALL ? undefined : feature,
  };
  const eventsQuery = useQuery(
    costEventsQuery({ ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
  );
  const data = eventsQuery.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const monthItems = overview
    ? monthOptions(overview.day)
    : monthOptions("2026-01-01");

  async function download() {
    setExporting(true);
    try {
      const { csv } = await exportCostEvents({ data: filters });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `costes-${filters.month ?? "todo"}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <TableCard>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <div>
          <h2 className="font-medium">Historial de consultas</h2>
          {data ? (
            <p className="text-xs text-muted-foreground">
              {data.total} consulta{data.total === 1 ? "" : "s"} ·{" "}
              {formatEur(data.totalEur)} en total
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            items={monthItems}
            value={month}
            onValueChange={(value) => {
              setMonth(String(value));
              setPage(0);
            }}
          >
            <SelectTrigger size="sm" aria-label="Mes">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={FEATURE_ITEMS}
            value={feature}
            onValueChange={(value) => {
              setFeature(String(value));
              setPage(0);
            }}
          >
            <SelectTrigger size="sm" aria-label="Función">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEATURE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void download()}
            disabled={exporting}
          >
            <Download data-icon="inline-start" />
            Exportar CSV
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Persona</TableHead>
            <TableHead>Proyecto</TableHead>
            <TableHead>Función</TableHead>
            <TableHead className="hidden md:table-cell">Endpoint</TableHead>
            <TableHead className="text-right">Coste</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data && data.rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-8 text-center text-muted-foreground"
              >
                No hay consultas registradas con estos filtros.
              </TableCell>
            </TableRow>
          ) : null}
          {data?.rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">
                {dateTime.format(new Date(row.createdAt))}
              </TableCell>
              <TableCell className="max-w-40 truncate">
                {row.userEmail ?? "—"}
              </TableCell>
              <TableCell className="max-w-40 truncate">
                {row.projectName ?? "—"}
              </TableCell>
              <TableCell>
                {row.featureLabel}
                {row.outcome !== "ok" ? (
                  <span className="ml-1 rounded bg-warning/15 px-1 text-[0.65rem] text-warning-foreground dark:text-warning">
                    fallida
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="hidden max-w-64 truncate font-mono text-xs text-muted-foreground md:table-cell">
                {row.endpoint}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">
                {formatEur(row.costEur)}
                <span className="ml-1 text-xs text-muted-foreground">
                  ({row.costUsd.toFixed(4).replace(".", ",")} $)
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 border-t border-border p-3 text-sm">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </Button>
          <span className="tabular-nums text-muted-foreground">
            {page + 1} / {pages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </TableCard>
  );
}

type SettingKey = keyof CostSettings;

const SETTING_FIELDS: {
  key: SettingKey;
  label: string;
  help: string;
  suffix: string;
  integer?: boolean;
  max?: number;
}[] = [
  {
    key: "monthlyBudgetEur",
    label: "Presupuesto mensual",
    help: "Límite de gasto al mes. Con 0 se desactivan los avisos de presupuesto.",
    suffix: "€",
  },
  {
    key: "warnAtPercent",
    label: "Avisar al llegar al",
    help: "Porcentaje del presupuesto en el que aparece el aviso amarillo.",
    suffix: "%",
    integer: true,
    max: 100,
  },
  {
    key: "confirmAboveEur",
    label: "Pedir confirmación por encima de",
    help: "Antes de lanzar una acción con un coste estimado superior a esta cifra, se te pedirá confirmar.",
    suffix: "€",
  },
  {
    key: "lowBalanceEur",
    label: "Avisar si el saldo baja de",
    help: "Aviso cuando el saldo de DataForSEO cae por debajo de esta cifra.",
    suffix: "€",
  },
];

const toInput = (value: number) => String(value).replace(".", ",");
const parseInput = (text: string) => Number(text.trim().replace(",", "."));

function isValidSetting(field: (typeof SETTING_FIELDS)[number], text: string) {
  const value = parseInput(text);
  if (text.trim() === "" || !Number.isFinite(value) || value < 0) return false;
  if (field.integer && !Number.isInteger(value)) return false;
  if (field.max !== undefined && value > field.max) return false;
  if (field.key === "warnAtPercent" && value < 1) return false;
  return true;
}

function SettingsForm({ settings }: { settings: CostSettings }) {
  const queryClient = useQueryClient();
  const initial = Object.fromEntries(
    SETTING_FIELDS.map((field) => [field.key, toInput(settings[field.key])]),
  ) as Record<SettingKey, string>;
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(false);

  const dirty = SETTING_FIELDS.some(
    (field) => values[field.key] !== initial[field.key],
  );
  const allValid = SETTING_FIELDS.every((field) =>
    isValidSetting(field, values[field.key]),
  );

  const save = useMutation({
    mutationFn: () =>
      saveCostSettings({
        data: {
          monthlyBudgetEur: parseInput(values.monthlyBudgetEur),
          warnAtPercent: parseInput(values.warnAtPercent),
          confirmAboveEur: parseInput(values.confirmAboveEur),
          lowBalanceEur: parseInput(values.lowBalanceEur),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["costs"] });
      setSaved(true);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Presupuesto y avisos</CardTitle>
        <p className="text-xs text-muted-foreground">
          Todo en euros. Los avisos aparecen en un banner en toda la aplicación.
        </p>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {SETTING_FIELDS.map((field) => {
            const invalid = !isValidSetting(field, values[field.key]);
            const id = `cost-setting-${field.key}`;
            return (
              <div
                key={field.key}
                className="grid gap-2 py-3 first:pt-0 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center sm:gap-6"
              >
                <div>
                  <label htmlFor={id} className="block text-sm font-medium">
                    {field.label}
                  </label>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {field.help}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id={id}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-invalid={invalid || undefined}
                    className="text-right tabular-nums"
                    value={values[field.key]}
                    onChange={(event) => {
                      setSaved(false);
                      setValues({ ...values, [field.key]: event.target.value });
                    }}
                  />
                  <span className="w-4 text-sm text-muted-foreground">
                    {field.suffix}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {save.isError ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            No se pudo guardar. Inténtalo de nuevo.
          </p>
        ) : null}
        <div className="mt-3 flex items-center gap-3">
          <Button
            disabled={!dirty || !allValid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
          {saved && !dirty ? (
            <span className="text-sm text-success">Guardado</span>
          ) : null}
          {dirty && !allValid ? (
            <span className="text-sm text-destructive">
              Revisa los campos marcados en rojo.
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Reconciliation({ overview }: { overview: Overview }) {
  const rec = overview.reconciliation;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conciliación con DataForSEO</CardTitle>
        <p className="text-xs text-muted-foreground">
          Compara lo que DataForSEO dice que has gastado con lo que ha
          registrado esta herramienta.
        </p>
      </CardHeader>
      <CardContent>
        {rec ? (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt>Gastado según DataForSEO</dt>
              <dd className="tabular-nums">
                {formatEur(rec.providerSpentEur)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Registrado aquí</dt>
              <dd className="tabular-nums">{formatEur(rec.loggedEur)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-2 font-medium">
              <dt>Sin atribuir</dt>
              <dd className="tabular-nums">{formatEur(rec.unattributedEur)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            No se pudo consultar DataForSEO ahora mismo.
          </p>
        )}
        <p className="mt-3 flex gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            «Sin atribuir» incluye el gasto anterior a la puesta en marcha de
            este registro y las consultas hechas fuera de la herramienta. El
            importe en euros es aproximado: tu banco aplicará su propio tipo de
            cambio.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
