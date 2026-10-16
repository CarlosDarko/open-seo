import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Link2, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
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
import type { PeriodInput } from "@/custom/radar/periods";
import type { ReportSummary } from "@/custom/reporting/types";
import {
  createClientReport,
  deleteClientReport,
  listClientReports,
} from "@/serverFunctions/reporting";

const RANGES: { value: PeriodInput["range"]; label: string }[] = [
  { value: "last_28_days", label: "Últimos 28 días" },
  { value: "last_3_months", label: "Últimos 3 meses" },
  { value: "last_6_months", label: "Últimos 6 meses" },
  { value: "last_12_months", label: "Últimos 12 meses" },
  { value: "last_7_days", label: "Últimos 7 días" },
];

const COMPARE: { value: PeriodInput["compare"]; label: string }[] = [
  { value: "previous", label: "El periodo anterior" },
  { value: "year", label: "El mismo periodo del año pasado" },
];

const monthYear = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Madrid",
});
const dateFormat = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

const shortDate = (iso: string) => dateFormat.format(new Date(iso));

export const publicUrl = (token: string) =>
  `${window.location.origin}/c/${token}`;

function defaultTitle(): string {
  const text = monthYear.format(new Date());
  return `Informe SEO — ${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function ReportRow({
  report,
  projectId,
  onDelete,
}: {
  report: ReportSummary;
  projectId: string;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const progress =
    report.tasksTotal > 0 ? report.tasksDone / report.tasksTotal : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FileText className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 basis-60">
        <Link
          to="/p/$projectId/reporting/$reportId"
          params={{ projectId, reportId: report.id }}
          className="font-semibold hover:underline"
        >
          {report.title}
        </Link>
        <p className="text-xs text-muted-foreground">
          {report.clientName ? `${report.clientName} · ` : ""}
          {shortDate(report.range.startDate)} –{" "}
          {shortDate(report.range.endDate)} · creado el{" "}
          {shortDate(report.createdAt)}
        </p>
      </div>
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
          report.shared
            ? "bg-success/10 text-success"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {report.shared ? "Compartido" : "Privado"}
      </span>
      {report.tasksTotal > 0 ? (
        <div className="w-36 space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {report.tasksDone} de {report.tasksTotal} tareas hechas
          </p>
        </div>
      ) : null}
      <div className="flex items-center gap-1.5">
        {report.shared ? (
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                .writeText(publicUrl(report.token))
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
            }}
          >
            <Link2 className="size-3" aria-hidden />
            {copied ? "Copiado" : "Copiar enlace"}
          </Button>
        ) : null}
        <Button
          size="xs"
          variant="outline"
          render={
            <a href={`/rv/${report.id}`} target="_blank" rel="noreferrer" />
          }
        >
          <ExternalLink className="size-3" aria-hidden />
          Ver
        </Button>
        <Button
          size="xs"
          variant="ghost"
          aria-label="Borrar informe"
          onClick={() => {
            if (
              window.confirm(`¿Borrar «${report.title}»? No se puede deshacer.`)
            )
              onDelete();
          }}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function ReportingPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const list = useQuery({
    queryKey: ["client-reports", projectId],
    queryFn: () => listClientReports({ data: { projectId } }),
  });
  const [title, setTitle] = useState(defaultTitle);
  const [client, setClient] = useState("");
  const [range, setRange] = useState<PeriodInput["range"]>("last_28_days");
  const [compare, setCompare] = useState<PeriodInput["compare"]>("previous");
  const [message, setMessage] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createClientReport({
        data: {
          projectId,
          title: title.trim() || defaultTitle(),
          clientName: client.trim() || null,
          period: { range, compare },
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        setMessage(
          result.reason === "reconnect"
            ? "La conexión con Google ha caducado: reconéctala en Search Console."
            : "Este proyecto no tiene Search Console conectado.",
        );
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: ["client-reports", projectId],
      });
      void navigate({
        to: "/p/$projectId/reporting/$reportId",
        params: { projectId, reportId: result.reportId },
      });
    },
    onError: () =>
      setMessage(
        "No se pudo generar el informe. Prueba de nuevo en un momento.",
      ),
  });
  const remove = useMutation({
    mutationFn: (reportId: string) =>
      deleteClientReport({ data: { projectId, reportId } }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["client-reports", projectId],
      }),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        title="Reporting"
        description="Informes online para tus clientes: resumen claro, gráficas interactivas y un plan de acción con tareas que se marcan. Se generan con los datos de Search Console y los compartes con un enlace."
      />

      <Card>
        <CardHeader>
          <CardTitle>Nuevo informe</CardTitle>
          <p className="text-xs text-muted-foreground">
            Se guarda una foto de los datos de hoy, así el cliente siempre ve lo
            mismo. Puedes actualizarla cuando quieras.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="report-title">Título</Label>
              <Input
                id="report-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-client">Cliente (opcional)</Label>
              <Input
                id="report-client"
                value={client}
                onChange={(event) => setClient(event.target.value)}
                placeholder="Nombre del cliente"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Periodo</Label>
              <Select
                items={RANGES}
                value={range}
                onValueChange={(value) =>
                  setRange(value as PeriodInput["range"])
                }
              >
                <SelectTrigger aria-label="Periodo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RANGES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Comparar con</Label>
              <Select
                items={COMPARE}
                value={compare}
                onValueChange={(value) =>
                  setCompare(value as PeriodInput["compare"])
                }
              >
                <SelectTrigger aria-label="Comparar con">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPARE.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={create.isPending}
              onClick={() => {
                setMessage(null);
                create.mutate();
              }}
            >
              <Plus className="size-4" aria-hidden />
              {create.isPending ? "Generando…" : "Generar informe"}
            </Button>
            {message ? (
              <p className="text-sm text-destructive">{message}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informes de este proyecto</CardTitle>
        </CardHeader>
        <CardContent>
          {list.isError ? (
            <QueryError
              variant="card"
              error={list.error}
              fallback="No se pudieron cargar los informes."
              onRetry={() => void list.refetch()}
              isRetrying={list.isFetching}
            />
          ) : list.isPending ? (
            <Skeleton className="h-20 w-full" />
          ) : list.data.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Aún no hay informes. Genera el primero arriba.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {list.data.map((report) => (
                <ReportRow
                  key={report.id}
                  report={report}
                  projectId={projectId}
                  onDelete={() => remove.mutate(report.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
