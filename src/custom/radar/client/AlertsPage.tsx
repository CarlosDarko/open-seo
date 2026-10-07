import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CircleAlert,
  CircleCheck,
  Mail,
  Plus,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
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
import { Textarea } from "@/client/components/ui/textarea";
import {
  DEVICES,
  METRICS,
  VALID_CONDITIONS,
  WINDOWS,
  describeRule,
  type Condition,
  type Filter,
  type Metric,
  type Rule,
  type Scope,
} from "@/custom/radar/alertRules";
import { isSafeWebhookUrl, isValidEmail } from "@/custom/radar/alertMessages";
import { PageLink } from "@/custom/radar/client/RadarLinks";
import {
  deleteAlertRule,
  getAlertChannels,
  listAlertEvents,
  listAlertRules,
  markAlertsSeen,
  runAlertsNow,
  saveAlertChannels,
  saveAlertRule,
  sendAlertTest,
  setAlertRuleEnabled,
} from "@/serverFunctions/radarAlerts";

const WIDE_MENU = "w-auto min-w-(--anchor-width) max-w-[min(32rem,92vw)]";

const SCOPE_LABEL: Record<Scope, string> = {
  site: "Todo el sitio",
  site_brand: "Solo las consultas de marca",
  site_nonbrand: "Solo las consultas sin marca",
  top_pages: "Cualquiera de mis 20 páginas con más tráfico",
  top_queries: "Cualquiera de mis 50 consultas con más tráfico",
  pages_matching: "Las páginas cuya URL contiene…",
  queries_matching: "Las consultas que contienen…",
  page: "Una página concreta",
  query: "Una consulta concreta",
  device: "Un dispositivo (móvil, ordenador, tableta)",
  country: "Un país",
};
const METRIC_LABEL: Record<Metric, string> = {
  clicks: "Clics",
  impressions: "Impresiones",
  ctr: "CTR",
  position: "Posición media",
};
const CONDITION_LABEL: Record<Condition, string> = {
  drop_pct: "baja al menos un… %",
  rise_pct: "sube al menos un… %",
  below: "cae por debajo de…",
  above: "supera…",
  worse_by: "empeora al menos… puestos",
  better_by: "mejora al menos… puestos",
};
const DEVICE_LABEL: Record<string, string> = {
  MOBILE: "Móvil",
  DESKTOP: "Ordenador",
  TABLET: "Tableta",
};
const FILTER_METRIC_LABEL: Record<Metric, string> = {
  clicks: "clics",
  impressions: "impresiones",
  ctr: "CTR (%)",
  position: "posición",
};
const OP_LABEL = { gte: "es al menos", lte: "es como mucho" } as const;
const PERIOD_LABEL = {
  current: "en este periodo",
  previous: "en el periodo anterior",
} as const;

type FilterDraft = {
  metric: Metric;
  op: Filter["op"];
  value: string;
  period: Filter["period"];
};

type Draft = {
  name: string;
  scope: Scope;
  target: string;
  metric: Metric;
  condition: Condition;
  threshold: string;
  windowDays: string;
  minValue: string;
  filters: FilterDraft[];
  emails: string;
  webhooks: string[];
};

const BLANK: Draft = {
  name: "",
  scope: "site",
  target: "",
  metric: "clicks",
  condition: "drop_pct",
  threshold: "25",
  windowDays: "7",
  minValue: "50",
  filters: [],
  emails: "",
  webhooks: [],
};

const PRESETS: { label: string; draft: Partial<Draft> }[] = [
  { label: "Caída fuerte de clics del sitio", draft: { name: "Caída fuerte de clics del sitio" } },
  {
    label: "Mis páginas principales pierden tráfico",
    draft: {
      name: "Mis páginas principales pierden tráfico",
      scope: "top_pages",
      threshold: "40",
      windowDays: "14",
      minValue: "20",
    },
  },
  {
    label: "Páginas con muchas impresiones que pierden clics",
    draft: {
      name: "Páginas con muchas impresiones que pierden clics",
      scope: "top_pages",
      threshold: "30",
      windowDays: "14",
      minValue: "20",
      filters: [{ metric: "impressions", op: "gte", value: "1000", period: "current" }],
    },
  },
  {
    label: "Mis consultas principales empeoran de posición",
    draft: {
      name: "Mis consultas principales empeoran de posición",
      scope: "top_queries",
      metric: "position",
      condition: "worse_by",
      threshold: "3",
      minValue: "100",
    },
  },
  {
    label: "Se hunde el CTR del sitio",
    draft: {
      name: "Se hunde el CTR del sitio",
      metric: "ctr",
      threshold: "25",
      windowDays: "14",
      minValue: "500",
    },
  },
  {
    label: "Cae el tráfico sin marca",
    draft: {
      name: "Cae el tráfico sin marca",
      scope: "site_nonbrand",
      threshold: "20",
      windowDays: "14",
      minValue: "50",
    },
  },
  {
    label: "Cae el tráfico desde móvil",
    draft: {
      name: "Cae el tráfico desde móvil",
      scope: "device",
      target: "MOBILE",
      threshold: "25",
    },
  },
  {
    label: "Una sección de la web pierde tráfico",
    draft: {
      name: "Una sección de la web pierde tráfico",
      scope: "pages_matching",
      target: "/blog/",
      threshold: "30",
      windowDays: "14",
      minValue: "20",
    },
  },
  {
    label: "Pico de impresiones del sitio",
    draft: {
      name: "Pico de impresiones del sitio",
      metric: "impressions",
      condition: "rise_pct",
      threshold: "50",
      minValue: "500",
    },
  },
];

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Madrid",
});

function splitList(text: string): string[] {
  return text
    .split(/[\n,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function draftToRule(draft: Draft): Rule {
  const number = (text: string) => Number(text.replace(",", "."));
  return {
    id: "preview",
    name: draft.name,
    scope: draft.scope,
    target: draft.target.trim() || null,
    metric: draft.metric,
    condition: draft.condition,
    threshold: Number.isFinite(number(draft.threshold)) ? number(draft.threshold) : 0,
    windowDays: Number(draft.windowDays),
    minValue: Number.isFinite(number(draft.minValue || "0")) ? number(draft.minValue || "0") : 0,
    filters: draft.filters.flatMap((filter) =>
      filter.value.trim() !== "" && Number.isFinite(number(filter.value))
        ? [{ metric: filter.metric, op: filter.op, value: number(filter.value), period: filter.period }]
        : [],
    ),
    notify: {
      emails: splitList(draft.emails).filter(isValidEmail),
      webhooks: draft.webhooks.map((url) => url.trim()).filter(Boolean),
    },
  };
}

export function AlertsPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"events" | "rules">("events");
  const events = useQuery({
    queryKey: ["radar-alerts", projectId],
    queryFn: () => listAlertEvents({ data: { projectId } }),
  });
  const rules = useQuery({
    queryKey: ["radar-alert-rules", projectId],
    queryFn: () => listAlertRules({ data: { projectId } }),
  });

  // Alerts that were unread when the page opened keep their "Nuevo" label for
  // this visit; they are marked as read once shown.
  const freshIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!events.data || freshIds.current) return;
    freshIds.current = new Set(
      events.data.filter((event) => !event.seen).map((event) => event.id),
    );
    if (freshIds.current.size > 0) {
      void markAlertsSeen({ data: { projectId } }).then(() =>
        queryClient.invalidateQueries({
          queryKey: ["radar-alerts-unseen", projectId],
        }),
      );
    }
  }, [events.data, projectId, queryClient]);

  const run = useMutation({
    mutationFn: () => runAlertsNow({ data: { projectId } }),
    onSuccess: () => {
      freshIds.current = null;
      void queryClient.invalidateQueries({ queryKey: ["radar-alerts", projectId] });
    },
  });
  const toggle = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) =>
      setAlertRuleEnabled({ data: { projectId, ...input } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["radar-alert-rules", projectId] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteAlertRule({ data: { projectId, id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["radar-alert-rules", projectId] }),
  });

  const grouped = useMemo(() => {
    const byDay = new Map<string, NonNullable<typeof events.data>>();
    for (const event of events.data ?? []) {
      byDay.set(event.day, [...(byDay.get(event.day) ?? []), event]);
    }
    return [...byDay.entries()];
  }, [events.data]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        title="Alertas"
        description="Define condiciones sobre tus datos de Search Console y la herramienta las comprueba cada día. Los avisos aparecen aquí y en el Radar, y también pueden llegar por correo o a Slack, Discord o Teams."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ChannelsDialog projectId={projectId} />
            <Button
              variant="outline"
              size="sm"
              disabled={run.isPending}
              onClick={() => run.mutate()}
            >
              {run.isPending ? "Comprobando…" : "Comprobar ahora"}
            </Button>
          </div>
        }
      />

      {run.data ? (
        <p className="text-sm text-muted-foreground">
          {run.data.checked === 0
            ? "No hay reglas activas que comprobar."
            : `Se han comprobado ${run.data.checked} reglas: ${run.data.triggered === 0 ? "ninguna ha saltado" : `${run.data.triggered} ${run.data.triggered === 1 ? "ha saltado" : "han saltado"}`}.`}
        </p>
      ) : null}
      {run.isError ? (
        <p className="text-sm text-destructive">
          No se pudo comprobar ahora. Revisa que Search Console siga conectado.
        </p>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <TabsList>
          <TabsTrigger value="events">Avisos ({events.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="rules">Reglas ({rules.data?.length ?? 0})</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "events" ? (
        events.isError ? (
          <QueryError
            variant="card"
            error={events.error}
            fallback="No se pudieron cargar los avisos."
            onRetry={() => void events.refetch()}
            isRetrying={events.isFetching}
          />
        ) : events.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : grouped.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              Todavía no ha saltado ningún aviso.{" "}
              {rules.data && rules.data.length === 0
                ? "Crea tu primera regla en la pestaña «Reglas»."
                : "Se comprueban las reglas una vez al día."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {grouped.map(([day, items]) => (
              <section key={day} className="space-y-2">
                <h2 className="text-sm font-semibold text-muted-foreground capitalize">
                  {dateFormat.format(new Date(`${day}T12:00:00Z`))}
                </h2>
                {items.map((event) => (
                  <Card key={event.id}>
                    <CardContent className="space-y-2 py-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                          {event.ruleName}
                        </span>
                        {freshIds.current?.has(event.id) ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            Nuevo
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm font-medium">{event.summary}</p>
                      {event.hits.length > 1 || event.hits[0]?.url ? (
                        <ul className="space-y-1 text-sm">
                          {event.hits.map((hit) => (
                            <li
                              key={hit.label}
                              className="flex flex-wrap items-baseline justify-between gap-2"
                            >
                              <span className="min-w-0">
                                {hit.url ? <PageLink url={hit.url} /> : hit.label}
                              </span>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {Math.round(hit.before * 10) / 10} →{" "}
                                {Math.round(hit.after * 10) / 10}
                                {hit.changePct !== null
                                  ? ` (${hit.changePct > 0 ? "+" : ""}${hit.changePct.toFixed(0)} %)`
                                  : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {event.window ? (
                        <p className="text-xs text-muted-foreground">
                          Comparado: {event.window.start} – {event.window.end}{" "}
                          frente a {event.window.prevStart} – {event.window.prevEnd}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <RuleDialog projectId={projectId} />
          </div>
          {rules.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : (rules.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                No hay reglas. Pulsa «Nueva regla» y elige una plantilla para
                empezar, por ejemplo «Caída fuerte de clics del sitio».
              </CardContent>
            </Card>
          ) : (
            (rules.data ?? []).map((rule) => (
              <Card key={rule.id}>
                <CardContent className="flex items-start justify-between gap-3 py-1">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{rule.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {describeRule(rule)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Switch
                      checked={rule.enabled}
                      aria-label="Regla activa"
                      onCheckedChange={(enabled) =>
                        toggle.mutate({ id: rule.id, enabled })
                      }
                    />
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Borrar regla"
                      onClick={() => remove.mutate(rule.id)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="flex items-center gap-2 font-semibold">
        <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">
          {number}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

type TestResult = { channel: string; ok: boolean; error?: string };

function TestResults({ results }: { results: TestResult[] }) {
  return (
    <ul className="space-y-1 text-xs">
      {results.map((result, index) => (
        <li
          key={index}
          className={`flex items-start gap-1.5 ${result.ok ? "text-success" : "text-destructive"}`}
        >
          {result.ok ? (
            <CircleCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          ) : (
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          )}
          <span>
            {result.ok
              ? `${result.channel === "correo" ? "Correo" : "Webhook"} enviado: comprueba que ha llegado.`
              : `${result.channel === "correo" ? "Correo" : "Webhook"}: ${result.error ?? "falló"}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RuleDialog({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [tests, setTests] = useState<TestResult[]>([]);

  const rule = draftToRule(draft);
  const set = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const updateFilter = (index: number, patch: Partial<FilterDraft>) =>
    setDraft((prev) => ({
      ...prev,
      filters: prev.filters.map((filter, i) =>
        i === index ? { ...filter, ...patch } : filter,
      ),
    }));

  const emails = splitList(draft.emails);
  const badEmails = emails.filter((email) => !isValidEmail(email));
  const badWebhooks = draft.webhooks.filter(
    (url) => url.trim() !== "" && !isSafeWebhookUrl(url.trim()),
  );

  const save = useMutation({
    mutationFn: () =>
      saveAlertRule({
        data: {
          projectId,
          name: draft.name,
          scope: draft.scope,
          target: SCOPES_NEEDING_TARGET.includes(draft.scope)
            ? draft.target.trim()
            : null,
          metric: draft.metric,
          condition: draft.condition,
          threshold: rule.threshold,
          windowDays: Number(draft.windowDays),
          minValue: rule.minValue,
          filters: rule.filters ?? [],
          notify: {
            emails: emails.map((email) => email.toLowerCase()),
            webhooks: draft.webhooks.map((url) => url.trim()).filter(Boolean),
          },
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["radar-alert-rules", projectId] });
      setOpen(false);
    },
  });

  const test = useMutation({
    mutationFn: (input: { emails: string[]; webhook: string | null }) =>
      sendAlertTest({ data: { projectId, ...input } }),
    onSuccess: (data) => setTests(data.results),
    onError: () =>
      setTests([{ channel: "prueba", ok: false, error: "No se pudo enviar la prueba." }]),
  });

  const needsTarget = SCOPES_NEEDING_TARGET.includes(draft.scope);
  const targetOk =
    !needsTarget ||
    (draft.scope === "device"
      ? (DEVICES as readonly string[]).includes(draft.target)
      : draft.target.trim() !== "");
  const valid =
    draft.name.trim().length >= 2 &&
    draft.threshold.trim() !== "" &&
    Number.isFinite(Number(draft.threshold.replace(",", "."))) &&
    targetOk &&
    badEmails.length === 0 &&
    badWebhooks.length === 0;
  const conditions = VALID_CONDITIONS[draft.metric];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft(BLANK);
          setTests([]);
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" aria-hidden />
        Nueva regla
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Nueva regla de alerta</DialogTitle>
          <DialogDescription>
            Compara los últimos días con los mismos días justo antes. Cuando se
            cumple todo lo que indiques, aparece un aviso (como máximo uno por
            regla y día) y se envía a quien elijas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Empezar desde una plantilla</Label>
              <Select
                items={PRESETS.map((preset) => ({ value: preset.label, label: preset.label }))}
                value=""
                onValueChange={(value) => {
                  const preset = PRESETS.find((item) => item.label === value);
                  if (preset) setDraft({ ...BLANK, ...preset.draft });
                }}
              >
                <SelectTrigger aria-label="Plantilla">
                  <SelectValue placeholder="Elige una plantilla…" />
                </SelectTrigger>
                <SelectContent className={WIDE_MENU}>
                  {PRESETS.map((preset) => (
                    <SelectItem key={preset.label} value={preset.label}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-name">Nombre de la regla</Label>
              <Input
                id="rule-name"
                value={draft.name}
                onChange={(event) => set({ name: event.target.value })}
                placeholder="Ej.: Caída fuerte de clics del sitio"
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <Step number={1} title="Qué vigilar">
                <Select
                  items={Object.entries(SCOPE_LABEL).map(([value, label]) => ({ value, label }))}
                  value={draft.scope}
                  onValueChange={(value) =>
                    set({
                      scope: value as Scope,
                      target: value === "device" ? "MOBILE" : "",
                    })
                  }
                >
                  <SelectTrigger aria-label="Qué vigilar">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={WIDE_MENU}>
                    {Object.entries(SCOPE_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {draft.scope === "device" ? (
                  <Select
                    items={DEVICES.map((value) => ({ value, label: DEVICE_LABEL[value] }))}
                    value={draft.target || "MOBILE"}
                    onValueChange={(value) => set({ target: String(value) })}
                  >
                    <SelectTrigger aria-label="Dispositivo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={WIDE_MENU}>
                      {DEVICES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {DEVICE_LABEL[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : needsTarget ? (
                  <div className="space-y-1">
                    <Input
                      value={draft.target}
                      onChange={(event) => set({ target: event.target.value })}
                      placeholder={TARGET_PLACEHOLDER[draft.scope]}
                      aria-label="A qué se aplica"
                    />
                    <p className="text-xs text-muted-foreground">
                      {TARGET_HELP[draft.scope]}
                    </p>
                  </div>
                ) : null}
              </Step>

              <Step number={2} title="Cuándo avisar">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Métrica</Label>
                    <Select
                      items={Object.entries(METRIC_LABEL).map(([value, label]) => ({ value, label }))}
                      value={draft.metric}
                      onValueChange={(value) => {
                        const metric = value as Metric;
                        set({
                          metric,
                          condition: VALID_CONDITIONS[metric].includes(draft.condition)
                            ? draft.condition
                            : VALID_CONDITIONS[metric][0],
                        });
                      }}
                    >
                      <SelectTrigger aria-label="Métrica">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={WIDE_MENU}>
                        {Object.entries(METRIC_LABEL).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Condición</Label>
                    <Select
                      items={conditions.map((value) => ({ value, label: CONDITION_LABEL[value] }))}
                      value={draft.condition}
                      onValueChange={(value) => set({ condition: value as Condition })}
                    >
                      <SelectTrigger aria-label="Condición">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={WIDE_MENU}>
                        {conditions.map((value) => (
                          <SelectItem key={value} value={value}>
                            {CONDITION_LABEL[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-threshold">
                      {draft.condition === "drop_pct" || draft.condition === "rise_pct"
                        ? "Porcentaje (%)"
                        : draft.condition === "worse_by" || draft.condition === "better_by"
                          ? "Puestos"
                          : draft.metric === "ctr"
                            ? "Valor (CTR en %)"
                            : "Valor"}
                    </Label>
                    <Input
                      id="rule-threshold"
                      inputMode="decimal"
                      value={draft.threshold}
                      onChange={(event) => set({ threshold: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Periodo</Label>
                    <Select
                      items={WINDOWS.map((days) => ({ value: String(days), label: `${days} días` }))}
                      value={draft.windowDays}
                      onValueChange={(value) => set({ windowDays: String(value) })}
                    >
                      <SelectTrigger aria-label="Periodo">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={WIDE_MENU}>
                        {WINDOWS.map((days) => (
                          <SelectItem key={days} value={String(days)}>
                            {days} días
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rule-min">
                      Mínimo {draft.metric === "clicks" ? "de clics" : "de impresiones"}
                    </Label>
                    <Input
                      id="rule-min"
                      inputMode="decimal"
                      value={draft.minValue}
                      onChange={(event) => set({ minValue: event.target.value })}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  El mínimo evita avisos por cifras pequeñas: se ignora lo que
                  tenía menos de eso en el periodo anterior (en impresiones para
                  CTR y posición).
                </p>

                <div className="space-y-2 rounded-md bg-muted/40 p-3">
                  <div>
                    <p className="font-medium">Acotar con otras condiciones</p>
                    <p className="text-xs text-muted-foreground">
                      Solo avisa si, además, se cumplen todas. Por ejemplo:
                      impresiones al menos 1.000 y CTR como mucho 2 %.
                    </p>
                  </div>
                  {draft.filters.map((filter, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <Select
                        items={METRICS.map((value) => ({ value, label: FILTER_METRIC_LABEL[value] }))}
                        value={filter.metric}
                        onValueChange={(value) => updateFilter(index, { metric: value as Metric })}
                      >
                        <SelectTrigger size="sm" aria-label="Métrica de la condición">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className={WIDE_MENU}>
                          {METRICS.map((value) => (
                            <SelectItem key={value} value={value}>
                              {FILTER_METRIC_LABEL[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        items={Object.entries(OP_LABEL).map(([value, label]) => ({ value, label }))}
                        value={filter.op}
                        onValueChange={(value) => updateFilter(index, { op: value as Filter["op"] })}
                      >
                        <SelectTrigger size="sm" aria-label="Comparación">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className={WIDE_MENU}>
                          {Object.entries(OP_LABEL).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-7 w-24"
                        inputMode="decimal"
                        aria-label="Valor"
                        value={filter.value}
                        onChange={(event) => updateFilter(index, { value: event.target.value })}
                      />
                      <Select
                        items={Object.entries(PERIOD_LABEL).map(([value, label]) => ({ value, label }))}
                        value={filter.period}
                        onValueChange={(value) => updateFilter(index, { period: value as Filter["period"] })}
                      >
                        <SelectTrigger size="sm" aria-label="Periodo de la condición">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className={WIDE_MENU}>
                          {Object.entries(PERIOD_LABEL).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Quitar condición"
                        onClick={() =>
                          set({ filters: draft.filters.filter((_, i) => i !== index) })
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                  ))}
                  {draft.filters.length < 4 ? (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        set({
                          filters: [
                            ...draft.filters,
                            { metric: "impressions", op: "gte", value: "", period: "current" },
                          ],
                        })
                      }
                    >
                      <Plus className="size-3" aria-hidden />
                      Añadir condición
                    </Button>
                  ) : null}
                </div>
              </Step>
            </div>

            <Step number={3} title="A quién y cómo avisar">
              <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3">
                <Bell className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <p>
                  <strong>En la herramienta:</strong> siempre. Lo ve cualquiera
                  que tenga acceso a este proyecto, en Alertas y en una franja
                  en el Radar.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rule-emails" className="flex items-center gap-1.5">
                  <Mail className="size-3.5" aria-hidden />
                  Por correo a
                </Label>
                <Textarea
                  id="rule-emails"
                  rows={2}
                  value={draft.emails}
                  onChange={(event) => set({ emails: event.target.value })}
                  placeholder="tu@correo.com, otra@persona.com"
                />
                {badEmails.length > 0 ? (
                  <p className="text-xs text-destructive">
                    No parece un correo válido: {badEmails.join(", ")}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Separados por comas. Hasta 10. Hay que configurar antes, una
                    sola vez para toda la herramienta, el envío de correo
                    (botón «Canales de aviso» de la página de Alertas).
                  </p>
                )}
                {emails.length > 0 && badEmails.length === 0 ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={test.isPending}
                    onClick={() => test.mutate({ emails, webhook: null })}
                  >
                    <Send className="size-3" aria-hidden />
                    Enviar correo de prueba
                  </Button>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Webhook className="size-3.5" aria-hidden />
                  Por webhook (Slack, Discord, Teams u otro)
                </Label>
                {draft.webhooks.map((url, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Input
                        value={url}
                        placeholder="https://hooks.slack.com/services/…"
                        onChange={(event) =>
                          set({
                            webhooks: draft.webhooks.map((item, i) =>
                              i === index ? event.target.value : item,
                            ),
                          })
                        }
                        aria-label="Dirección del webhook"
                      />
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={test.isPending || !isSafeWebhookUrl(url.trim())}
                        onClick={() => test.mutate({ emails: [], webhook: url.trim() })}
                      >
                        <Send className="size-3" aria-hidden />
                        Probar
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Quitar webhook"
                        onClick={() =>
                          set({ webhooks: draft.webhooks.filter((_, i) => i !== index) })
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                    {url.trim() !== "" && !isSafeWebhookUrl(url.trim()) ? (
                      <p className="text-xs text-destructive">
                        Debe ser una dirección https pública (no una IP ni una
                        dirección interna).
                      </p>
                    ) : null}
                  </div>
                ))}
                {draft.webhooks.length < 3 ? (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => set({ webhooks: [...draft.webhooks, ""] })}
                  >
                    <Plus className="size-3" aria-hidden />
                    Añadir webhook
                  </Button>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  En Slack: Aplicaciones → Incoming Webhooks. En Discord:
                  Ajustes del canal → Integraciones → Webhooks. Cualquier otra
                  dirección recibe un JSON con el asunto y el texto.
                </p>
              </div>

              {tests.length > 0 ? <TestResults results={tests} /> : null}
            </Step>
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">
              Así quedará la regla
            </p>
            <p className="mt-1">{describeRule(rule)}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Guardando…" : "Crear regla"}
          </Button>
        </DialogFooter>
        {save.isError ? (
          <p className="text-sm text-destructive">
            No se pudo guardar la regla. Revisa los datos.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const SCOPES_NEEDING_TARGET: Scope[] = [
  "page",
  "query",
  "pages_matching",
  "queries_matching",
  "device",
  "country",
];

const TARGET_PLACEHOLDER: Partial<Record<Scope, string>> = {
  page: "https://tuweb.com/pagina/",
  query: "la consulta exacta",
  pages_matching: "/blog/",
  queries_matching: "una palabra o expresión",
  country: "esp",
};

const TARGET_HELP: Partial<Record<Scope, string>> = {
  page: "La dirección completa de la página.",
  query: "La consulta tal cual aparece en Search Console.",
  pages_matching: "Un trozo de la URL: «/blog/» vigila todas las páginas del blog.",
  queries_matching: "Vigila todas las consultas que contengan esa palabra o expresión.",
  country: "Código de 3 letras que usa Search Console: esp, mex, arg, col, usa…",
};

/** How e-mail leaves the tool: the sender and the Resend API key. */
function ChannelsDialog({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const info = useQuery({
    queryKey: ["radar-alert-channels", projectId],
    queryFn: () => getAlertChannels({ data: { projectId } }),
    enabled: open,
  });
  const [from, setFrom] = useState("");
  const [key, setKey] = useState("");
  const save = useMutation({
    mutationFn: (input: { resendKey?: string | null }) =>
      saveAlertChannels({
        data: { projectId, fromEmail: from.trim() || null, ...input },
      }),
    onSuccess: async () => {
      setKey("");
      await queryClient.invalidateQueries({
        queryKey: ["radar-alert-channels", projectId],
      });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setFrom(info.data?.fromEmail ?? "");
          setKey("");
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Mail className="size-4" aria-hidden />
        Canales de aviso
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Canales de aviso</DialogTitle>
          <DialogDescription>
            Los webhooks (Slack, Discord, Teams) no necesitan configuración: se
            ponen en cada regla. Para enviar correos se usa{" "}
            <strong>Resend</strong> (resend.com), que tiene plan gratuito. Se
            configura <strong>una sola vez para toda la herramienta</strong>:
            vale para todos los proyectos y todos los usuarios.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="channel-from">Remitente</Label>
            <Input
              id="channel-from"
              value={from || (info.data?.fromEmail ?? "")}
              onChange={(event) => setFrom(event.target.value)}
              placeholder="Alertas SEO <alertas@tudominio.com>"
            />
            <p className="text-xs text-muted-foreground">
              Si escribes solo un nombre (por ejemplo «Alerta SEO») uso
              <code> onboarding@resend.dev</code>, que solo llega a la cuenta
              con la que te registraste en Resend: vale para probar. Para
              escribir a cualquier persona, verifica tu dominio en Resend y
              escribe una dirección suya con este formato:{" "}
              <code>Alerta SEO &lt;alertas@tudominio.com&gt;</code>.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="channel-key">Clave de API de Resend</Label>
            <Input
              id="channel-key"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder={info.data?.hasKey ? "Ya hay una clave guardada" : "re_…"}
            />
            <p className="text-xs text-muted-foreground">
              Se guarda una vez en el servidor, para toda la herramienta, y no
              vuelve a mostrarse. Créala en Resend → API Keys con permiso solo
              para enviar. Solo quien puede gestionar integraciones puede
              cambiarla.
            </p>
          </div>
        </div>
        <DialogFooter>
          {info.data?.hasKey ? (
            <Button
              variant="ghost"
              disabled={save.isPending}
              onClick={() => save.mutate({ resendKey: null })}
            >
              Quitar la clave
            </Button>
          ) : null}
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate(key.trim() ? { resendKey: key.trim() } : {})
            }
          >
            {save.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
        {save.isSuccess ? (
          <p className="text-sm text-success">Guardado.</p>
        ) : null}
        {save.isError ? (
          <p className="text-sm text-destructive">
            No se pudo guardar. Puede que tu rol no permita cambiar las
            integraciones.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
