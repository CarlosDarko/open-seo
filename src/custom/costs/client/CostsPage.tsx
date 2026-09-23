import { useEffect, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  Download,
  Info,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
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

const PAGE_SIZE = 20;
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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Costes</h1>
          <p className="text-sm text-base-content/60">
            Todo el gasto en DataForSEO, en euros.
          </p>
        </div>
        {overview ? (
          <p className="text-xs text-base-content/50">
            DataForSEO cobra en dólares. Tipo de cambio aplicado: 1 USD ={" "}
            {overview.fx.rate.toFixed(4).replace(".", ",")} €{" "}
            {overview.fx.source === "bce" && overview.fx.asOf
              ? `(BCE, ${overview.fx.asOf.split("-").reverse().join("/")})`
              : "(aproximado, sin conexión con el BCE)"}
          </p>
        ) : null}
      </header>

      {overviewQuery.isError ? (
        <div className="alert alert-error text-sm">
          No se pudieron cargar los costes. Recarga la página en unos segundos.
        </div>
      ) : null}

      {!overview ? (
        <p className="text-sm text-base-content/60">Cargando…</p>
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
            <Kpi label="Hoy" value={formatEur(overview.totals.today)} />
            <Kpi label="Últimos 7 días" value={formatEur(overview.totals.last7)} />
            <MonthKpi overview={overview} />
            <BalanceKpi
              overview={overview}
              refreshing={refreshBalance.isPending}
              onRefresh={() => refreshBalance.mutate()}
            />
          </section>

          <section className="rounded-lg border border-base-300 bg-base-100 p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-semibold">Gasto diario</h2>
              <span className="text-xs text-base-content/50">Últimos 30 días</span>
            </div>
            <DailyChart data={overview.daily} />
          </section>

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

function AlertRow({ alert }: { alert: CostAlert }) {
  const Icon = alert.level === "error" ? XCircle : AlertTriangle;
  return (
    <div
      className={`alert ${alert.level === "error" ? "alert-error" : "alert-warning"}`}
    >
      <Icon className="size-4 shrink-0" />
      <div className="text-sm">
        <p className="font-medium">{alert.title}</p>
        <p className="opacity-80">{alert.detail}</p>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4">
      <p className="text-xs text-base-content/60">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-base-content/50">{hint}</p> : null}
    </div>
  );
}

type Overview = Awaited<ReturnType<typeof getCostOverview>>;

function MonthKpi({ overview }: { overview: Overview }) {
  const budget = overview.settings.monthlyBudgetEur;
  const pct = budget > 0 ? (overview.totals.month / budget) * 100 : 0;
  const barClass =
    pct >= 100 ? "progress-error" : pct >= overview.settings.warnAtPercent ? "progress-warning" : "progress-primary";
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4">
      <p className="text-xs text-base-content/60">Este mes</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {formatEur(overview.totals.month)}
      </p>
      {budget > 0 ? (
        <>
          <progress
            className={`progress ${barClass} mt-2 w-full`}
            value={Math.min(pct, 100)}
            max={100}
          />
          <p className="mt-1 text-xs text-base-content/50">
            {Math.round(pct)} % de {formatEur(budget)} · proyección{" "}
            {formatEur(overview.projectedMonthEur)}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-base-content/50">
          Sin presupuesto definido · proyección{" "}
          {formatEur(overview.projectedMonthEur)}
        </p>
      )}
      <p className="mt-1 text-xs text-base-content/50">
        Mes anterior: {formatEur(overview.totals.previousMonth)}
      </p>
    </div>
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
    <div className="rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs text-base-content/60">Saldo en DataForSEO</p>
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-circle"
          aria-label="Actualizar saldo"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>
      {balance ? (
        <>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatEur(balance.eur)}
          </p>
          <p className="mt-1 text-xs text-base-content/50">
            {balance.usd.toFixed(2).replace(".", ",")} USD
            {balance.daysLeft !== null
              ? ` · para unos ${balance.daysLeft} días al ritmo actual`
              : ""}
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-base-content/50">No disponible ahora</p>
      )}
    </div>
  );
}

function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function DailyChart({ data }: { data: { day: string; eur: number }[] }) {
  const { ref, width } = useChartWidth();
  const hasData = data.some((point) => point.eur > 0);
  return (
    <div ref={ref} className="h-44 w-full min-w-0">
      {!hasData ? (
        <div className="flex h-full items-center justify-center text-sm text-base-content/40">
          Todavía no hay gasto registrado
        </div>
      ) : width > 0 ? (
        <BarChart
          width={width}
          height={176}
          data={data}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            opacity={0.06}
            vertical={false}
          />
          <XAxis
            dataKey="day"
            tickFormatter={(day: string) => `${day.slice(8)}/${day.slice(5, 7)}`}
            tick={{ fontSize: 10, fill: "#888" }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(value: number) => formatEur(value)}
            tick={{ fontSize: 10, fill: "#888" }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip content={<DayTooltip />} cursor={{ fill: "rgba(150,150,150,0.1)" }} />
          <Bar dataKey="eur" fill="#f11c41" radius={[2, 2, 0, 0]} maxBarSize={14} />
        </BarChart>
      ) : null}
    </div>
  );
}

function DayTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-md border border-base-300 bg-base-100 px-3 py-2 shadow-sm">
      <p className="text-xs text-base-content/60">
        {label.split("-").reverse().join("/")}
      </p>
      <p className="text-sm font-medium tabular-nums">{formatEur(payload[0].value)}</p>
    </div>
  );
}

type BreakdownTab = "feature" | "project" | "user";

function Breakdown({ overview }: { overview: Overview }) {
  const [tab, setTab] = useState<BreakdownTab>("feature");
  const rows =
    tab === "feature"
      ? overview.byFeature.map((row) => ({ key: row.feature, name: row.label, eur: row.eur, calls: row.calls }))
      : tab === "project"
        ? overview.byProject.map((row) => ({ key: row.projectId ?? "none", name: row.name, eur: row.eur, calls: row.calls }))
        : overview.byUser.map((row) => ({ key: row.email, name: row.email, eur: row.eur, calls: row.calls }));
  const total = rows.reduce((sum, row) => sum + row.eur, 0);

  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Dónde se va el gasto este mes</h2>
        <div role="tablist" className="tabs tabs-box tabs-sm">
          {(
            [
              ["feature", "Por función"],
              ["project", "Por proyecto"],
              ["user", "Por persona"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              className={`tab ${tab === value ? "tab-active" : ""}`}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-base-content/40">
          Sin gasto este mes.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate">{row.name}</span>
                <span className="shrink-0 tabular-nums">
                  {formatEur(row.eur)}
                  <span className="ml-2 text-xs text-base-content/50">
                    {row.calls} consulta{row.calls === 1 ? "" : "s"}
                  </span>
                </span>
              </div>
              <progress
                className="progress progress-primary h-1.5 w-full"
                value={total > 0 ? (row.eur / total) * 100 : 0}
                max={100}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function monthOptions(day: string) {
  const options: { value: string; label: string }[] = [];
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

function History() {
  const overview = useQuery(costOverviewQuery()).data;
  const [month, setMonth] = useState<string>("");
  const [feature, setFeature] = useState<string>("");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const filters = {
    month: month || undefined,
    feature: feature || undefined,
  };
  const eventsQuery = useQuery(
    costEventsQuery({ ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
  );
  const data = eventsQuery.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  async function download() {
    setExporting(true);
    try {
      const { csv } = await exportCostEvents({ data: filters });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `costes-${month || "todo"}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Historial de consultas</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="select select-bordered select-sm"
            aria-label="Mes"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setPage(0);
            }}
          >
            <option value="">Todo el historial</option>
            {overview
              ? monthOptions(overview.day).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))
              : null}
          </select>
          <select
            className="select select-bordered select-sm"
            aria-label="Función"
            value={feature}
            onChange={(event) => {
              setFeature(event.target.value);
              setPage(0);
            }}
          >
            <option value="">Todas las funciones</option>
            {COST_FEATURES.map((key) => (
              <option key={key} value={key}>
                {costFeatureLabel(key)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void download()}
            disabled={exporting}
          >
            <Download className="size-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {data ? (
        <p className="mb-2 text-xs text-base-content/60">
          {data.total} consulta{data.total === 1 ? "" : "s"} · {formatEur(data.totalEur)} en total
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Persona</th>
              <th>Proyecto</th>
              <th>Función</th>
              <th className="hidden md:table-cell">Endpoint</th>
              <th className="text-right">Coste</th>
            </tr>
          </thead>
          <tbody>
            {data && data.rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-base-content/40">
                  No hay consultas registradas con estos filtros.
                </td>
              </tr>
            ) : null}
            {data?.rows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap">
                  {dateTime.format(new Date(row.createdAt))}
                </td>
                <td className="max-w-40 truncate">{row.userEmail ?? "—"}</td>
                <td className="max-w-40 truncate">{row.projectName ?? "—"}</td>
                <td>
                  {row.featureLabel}
                  {row.outcome !== "ok" ? (
                    <span className="badge badge-warning badge-xs ml-1">fallida</span>
                  ) : null}
                </td>
                <td className="hidden max-w-64 truncate font-mono text-xs text-base-content/60 md:table-cell">
                  {row.endpoint}
                </td>
                <td className="whitespace-nowrap text-right tabular-nums">
                  {formatEur(row.costEur)}
                  <span className="ml-1 text-xs text-base-content/40">
                    ({row.costUsd.toFixed(4).replace(".", ",")} $)
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </button>
          <span className="tabular-nums text-base-content/60">
            {page + 1} / {pages}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </section>
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

  const dirty = SETTING_FIELDS.some((field) => values[field.key] !== initial[field.key]);
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
    <section className="rounded-lg border border-base-300 bg-base-100 p-4">
      <h2 className="font-semibold">Presupuesto y avisos</h2>
      <p className="mt-0.5 text-xs text-base-content/60">
        Todo en euros. Los avisos aparecen en un banner en toda la aplicación.
      </p>

      <div className="mt-2 divide-y divide-base-300">
        {SETTING_FIELDS.map((field) => {
          const invalid = !isValidSetting(field, values[field.key]);
          const id = `cost-setting-${field.key}`;
          return (
            <div
              key={field.key}
              className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center sm:gap-6"
            >
              <div>
                <label htmlFor={id} className="block text-sm font-medium">
                  {field.label}
                </label>
                <p className="mt-0.5 text-xs leading-snug text-base-content/60">
                  {field.help}
                </p>
              </div>
              <div className="join w-full">
                <input
                  id={id}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={invalid || undefined}
                  className={`input input-bordered input-sm join-item w-full text-right tabular-nums ${
                    invalid ? "input-error" : ""
                  }`}
                  value={values[field.key]}
                  onChange={(event) => {
                    setSaved(false);
                    setValues({ ...values, [field.key]: event.target.value });
                  }}
                />
                <span className="join-item flex h-8 w-9 shrink-0 items-center justify-center border border-base-300 bg-base-200 text-sm text-base-content/70">
                  {field.suffix}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {save.isError ? (
        <p className="mt-2 text-sm text-error">
          No se pudo guardar. Inténtalo de nuevo.
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!dirty || !allValid || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
        {saved && !dirty ? (
          <span className="text-sm text-success">Guardado</span>
        ) : null}
        {dirty && !allValid ? (
          <span className="text-sm text-error">
            Revisa los campos marcados en rojo.
          </span>
        ) : null}
      </div>
    </section>
  );
}

function Reconciliation({ overview }: { overview: Overview }) {
  const rec = overview.reconciliation;
  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-4">
      <h2 className="mb-1 font-semibold">Conciliación con DataForSEO</h2>
      <p className="mb-3 text-xs text-base-content/60">
        Compara lo que DataForSEO dice que has gastado con lo que ha registrado
        esta herramienta.
      </p>
      {rec ? (
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt>Gastado según DataForSEO</dt>
            <dd className="tabular-nums">{formatEur(rec.providerSpentEur)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Registrado aquí</dt>
            <dd className="tabular-nums">{formatEur(rec.loggedEur)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-base-300 pt-2 font-medium">
            <dt>Sin atribuir</dt>
            <dd className="tabular-nums">{formatEur(rec.unattributedEur)}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-base-content/50">
          No se pudo consultar DataForSEO ahora mismo.
        </p>
      )}
      <p className="mt-3 flex gap-2 text-xs text-base-content/50">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          «Sin atribuir» incluye el gasto anterior a la puesta en marcha de este
          registro y las consultas hechas fuera de la herramienta. El importe en
          euros es aproximado: tu banco aplicará su propio tipo de cambio.
        </span>
      </p>
    </section>
  );
}
