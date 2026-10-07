import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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
import {
  VALID_CONDITIONS,
  WINDOWS,
  type Condition,
  type Metric,
  type Scope,
} from "@/custom/radar/alertRules";
import { PageLink } from "@/custom/radar/client/RadarLinks";
import {
  deleteAlertRule,
  listAlertEvents,
  listAlertRules,
  markAlertsSeen,
  runAlertsNow,
  saveAlertRule,
  setAlertRuleEnabled,
} from "@/serverFunctions/radarAlerts";

const SCOPE_LABEL: Record<Scope, string> = {
  site: "Todo el sitio",
  top_pages: "Cualquiera de mis 20 páginas con más tráfico",
  top_queries: "Cualquiera de mis 50 consultas con más tráfico",
  page: "Una página concreta",
  query: "Una consulta concreta",
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

type Draft = {
  name: string;
  scope: Scope;
  target: string;
  metric: Metric;
  condition: Condition;
  threshold: string;
  windowDays: string;
  minValue: string;
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
};

const PRESETS: { label: string; draft: Draft }[] = [
  {
    label: "Caída fuerte de clics del sitio",
    draft: { ...BLANK, name: "Caída fuerte de clics del sitio" },
  },
  {
    label: "Mis páginas principales pierden tráfico",
    draft: {
      ...BLANK,
      name: "Mis páginas principales pierden tráfico",
      scope: "top_pages",
      threshold: "40",
      windowDays: "14",
      minValue: "20",
    },
  },
  {
    label: "Mis consultas principales empeoran de posición",
    draft: {
      ...BLANK,
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
      ...BLANK,
      name: "Se hunde el CTR del sitio",
      metric: "ctr",
      threshold: "25",
      windowDays: "14",
      minValue: "500",
    },
  },
  {
    label: "Pico de impresiones del sitio",
    draft: {
      ...BLANK,
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
        description="Define condiciones sobre tus datos de Search Console y la herramienta las comprueba cada día. Los avisos aparecen aquí y en el Radar. Por ahora no se envían por correo."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={run.isPending}
            onClick={() => run.mutate()}
          >
            {run.isPending ? "Comprobando…" : "Comprobar ahora"}
          </Button>
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
                                {hit.url ? (
                                  <PageLink url={hit.url} />
                                ) : (
                                  hit.label
                                )}
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
                          frente a {event.window.prevStart} –{" "}
                          {event.window.prevEnd}
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
                      {SCOPE_LABEL[rule.scope]}
                      {rule.target ? `: ${rule.target}` : ""} ·{" "}
                      {METRIC_LABEL[rule.metric]}{" "}
                      {CONDITION_LABEL[rule.condition].replace(
                        "…",
                        String(rule.threshold),
                      )}{" "}
                      · últimos {rule.windowDays} días frente a los {rule.windowDays} anteriores
                      {rule.minValue > 0 ? ` · mínimo ${rule.minValue}` : ""}
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

function RuleDialog({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(BLANK);

  const save = useMutation({
    mutationFn: () =>
      saveAlertRule({
        data: {
          projectId,
          name: draft.name,
          scope: draft.scope,
          target:
            draft.scope === "page" || draft.scope === "query"
              ? draft.target.trim()
              : null,
          metric: draft.metric,
          condition: draft.condition,
          threshold: Number(draft.threshold.replace(",", ".")),
          windowDays: Number(draft.windowDays),
          minValue: Number(draft.minValue.replace(",", ".") || 0),
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["radar-alert-rules", projectId],
      });
      setOpen(false);
    },
  });

  const set = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const conditions = VALID_CONDITIONS[draft.metric];
  const needsTarget = draft.scope === "page" || draft.scope === "query";
  const valid =
    draft.name.trim().length >= 2 &&
    Number.isFinite(Number(draft.threshold.replace(",", "."))) &&
    draft.threshold.trim() !== "" &&
    (!needsTarget || draft.target.trim() !== "");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(BLANK);
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" aria-hidden />
        Nueva regla
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nueva regla de alerta</DialogTitle>
          <DialogDescription>
            Compara los últimos días con los mismos días justo antes. Cuando se
            cumple la condición, aparece un aviso (como máximo uno por regla y
            día).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label>Empezar desde una plantilla</Label>
            <Select
              items={PRESETS.map((preset) => ({ value: preset.label, label: preset.label }))}
              value=""
              onValueChange={(value) => {
                const preset = PRESETS.find((item) => item.label === value);
                if (preset) setDraft(preset.draft);
              }}
            >
              <SelectTrigger aria-label="Plantilla">
                <SelectValue placeholder="Elige una plantilla…" />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((preset) => (
                  <SelectItem key={preset.label} value={preset.label}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rule-name">Nombre</Label>
            <Input
              id="rule-name"
              value={draft.name}
              onChange={(event) => set({ name: event.target.value })}
              placeholder="Ej.: Caída fuerte de clics del sitio"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Qué vigilar</Label>
            <Select
              items={Object.entries(SCOPE_LABEL).map(([value, label]) => ({ value, label }))}
              value={draft.scope}
              onValueChange={(value) => set({ scope: value as Scope })}
            >
              <SelectTrigger aria-label="Qué vigilar">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SCOPE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {needsTarget ? (
              <Input
                value={draft.target}
                onChange={(event) => set({ target: event.target.value })}
                placeholder={
                  draft.scope === "page"
                    ? "https://tuweb.com/pagina/"
                    : "la consulta exacta"
                }
                aria-label="Página o consulta"
              />
            ) : null}
          </div>

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
                <SelectContent>
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
                <SelectContent>
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
                <SelectContent>
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
            El mínimo evita avisos por cifras pequeñas: se ignora lo que tenía
            menos de eso en el periodo anterior (en impresiones para CTR y
            posición).
          </p>
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
