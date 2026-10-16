import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ExternalLink,
  Link2,
  Sparkles,
  RefreshCw,
  Trash2,
} from "lucide-react";
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
import { Skeleton } from "@/client/components/ui/skeleton";
import { Switch } from "@/client/components/ui/switch";
import { Textarea } from "@/client/components/ui/textarea";
import { publicUrl } from "@/custom/reporting/client/ReportingPage";
import {
  REPORT_SECTIONS,
  type ReportFull,
  type ReportNotes,
} from "@/custom/reporting/types";
import {
  draftClientReportWithAi,
  getClientReport,
  getReportingAiStatus,
  refreshClientReport,
  saveClientReport,
  setClientReportShared,
} from "@/serverFunctions/reporting";

function Editor({
  report,
  projectId,
}: {
  report: ReportFull;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(report.title);
  const [client, setClient] = useState(report.clientName ?? "");
  const [notes, setNotes] = useState<ReportNotes>(report.notes);
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = (patch: Partial<ReportNotes>) => {
    setNotes((previous) => ({ ...previous, ...patch }));
    setDirty(true);
  };
  const refetch = () =>
    queryClient.invalidateQueries({
      queryKey: ["client-report", projectId, report.id],
    });

  const save = useMutation({
    mutationFn: () =>
      saveClientReport({
        data: {
          projectId,
          reportId: report.id,
          title: title.trim() || report.title,
          clientName: client.trim() || null,
          notes,
        },
      }),
    onSuccess: async () => {
      setDirty(false);
      setError(null);
      await refetch();
      void queryClient.invalidateQueries({
        queryKey: ["client-reports", projectId],
      });
      setVersion((value) => value + 1);
    },
    onError: () => setError("No se pudo guardar. Prueba de nuevo."),
  });
  const aiStatus = useQuery({
    queryKey: ["client-report-ai", projectId],
    queryFn: () => getReportingAiStatus({ data: { projectId } }),
    staleTime: 10 * 60_000,
  });
  const draft = useMutation({
    mutationFn: () =>
      draftClientReportWithAi({ data: { projectId, reportId: report.id } }),
    onSuccess: (result) => {
      if (!result.ok) {
        setError(
          result.reason === "no_key"
            ? "La redacción con IA no está activada (falta la clave de Anthropic)."
            : "La IA no ha podido redactar ahora. Prueba de nuevo.",
        );
        return;
      }
      setError(null);
      setNotes((previous) => ({
        ...previous,
        message: result.draft.message || previous.message,
        sectionNotes: {
          ...previous.sectionNotes,
          ...result.draft.sectionNotes,
        },
        nextSteps: result.draft.nextSteps || previous.nextSteps,
      }));
      setDirty(true);
    },
    onError: () =>
      setError("La IA no ha podido redactar ahora. Prueba de nuevo."),
  });
  const share = useMutation({
    mutationFn: (shared: boolean) =>
      setClientReportShared({
        data: { projectId, reportId: report.id, shared },
      }),
    onSuccess: async () => {
      await refetch();
      void queryClient.invalidateQueries({
        queryKey: ["client-reports", projectId],
      });
    },
  });
  const refresh = useMutation({
    mutationFn: () =>
      refreshClientReport({ data: { projectId, reportId: report.id } }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(
          "No se pudieron actualizar los datos (revisa Search Console).",
        );
        return;
      }
      setError(null);
      await refetch();
      setVersion((value) => value + 1);
    },
    onError: () => setError("No se pudieron actualizar los datos."),
  });

  // Warns before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const hidden = new Set(notes.hidden);
  const toggleSection = (id: string, visible: boolean) =>
    change({
      hidden: visible
        ? notes.hidden.filter((item) => item !== id)
        : [...notes.hidden, id],
    });

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link to="/p/$projectId/reporting" params={{ projectId }} />
            }
          >
            <ArrowLeft className="size-4" aria-hidden />
            Informes
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">
            Editar informe
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button
            variant="outline"
            size="sm"
            disabled={
              draft.isPending || !aiStatus.data || !aiStatus.data.available
            }
            title={
              aiStatus.data?.available
                ? `Redacta el mensaje y las notas con IA (${aiStatus.data.model}). Es un borrador: lo revisas antes de guardar.`
                : "Para activarlo hay que añadir la clave de Anthropic (ANTHROPIC_API_KEY)."
            }
            onClick={() => draft.mutate()}
          >
            <Sparkles className="size-3.5" aria-hidden />
            {draft.isPending ? "Redactando…" : "Redactar con IA"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            {refresh.isPending ? "Actualizando…" : "Actualizar datos"}
          </Button>
          <Button
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending
              ? "Guardando…"
              : dirty
                ? "Guardar cambios"
                : "Guardado"}
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[430px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Compartir con el cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {report.shared ? "Enlace activo" : "Solo lo ves tú"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cualquiera con el enlace puede verlo, sin iniciar sesión.
                  </p>
                </div>
                <Switch
                  checked={report.shared}
                  disabled={share.isPending}
                  onCheckedChange={(checked) => share.mutate(checked)}
                  aria-label="Compartir informe"
                />
              </div>
              {report.shared ? (
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={publicUrl(report.token)}
                    onFocus={(event) => event.currentTarget.select()}
                    aria-label="Enlace para el cliente"
                  />
                  <Button
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
                    <Link2 className="size-4" aria-hidden />
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Datos del informe</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ed-title">Título</Label>
                <Input
                  id="ed-title"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setDirty(true);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-client">Cliente</Label>
                <Input
                  id="ed-client"
                  value={client}
                  onChange={(event) => {
                    setClient(event.target.value);
                    setDirty(true);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ed-message">Mensaje para el cliente</Label>
                <Textarea
                  id="ed-message"
                  rows={4}
                  value={notes.message}
                  onChange={(event) => change({ message: event.target.value })}
                  placeholder="Un saludo y lo más importante del mes, con tus palabras. Sale destacado al principio."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Secciones y notas</CardTitle>
              <p className="text-xs text-muted-foreground">
                Activa o quita secciones y añade una nota tuya bajo cada una.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {REPORT_SECTIONS.map((section) => {
                const visible = !hidden.has(section.id);
                return (
                  <div key={section.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label>{section.label}</Label>
                      <Switch
                        checked={visible}
                        onCheckedChange={(checked) =>
                          toggleSection(section.id, checked)
                        }
                        aria-label={`Mostrar ${section.label}`}
                      />
                    </div>
                    {visible && section.id !== "proximos" ? (
                      <Textarea
                        rows={2}
                        value={notes.sectionNotes[section.id] ?? ""}
                        onChange={(event) =>
                          change({
                            sectionNotes: {
                              ...notes.sectionNotes,
                              [section.id]: event.target.value,
                            },
                          })
                        }
                        placeholder="Nota opcional bajo esta sección"
                      />
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Próximos pasos</CardTitle>
              <p className="text-xs text-muted-foreground">
                Uno por línea. Salen como lista numerada al final.
              </p>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={4}
                value={notes.nextSteps}
                onChange={(event) => change({ nextSteps: event.target.value })}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-2 lg:sticky lg:top-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Así lo verá el cliente</p>
            <Button
              size="xs"
              variant="outline"
              render={
                <a href={`/rv/${report.id}`} target="_blank" rel="noreferrer" />
              }
            >
              <ExternalLink className="size-3" aria-hidden />
              Abrir aparte
            </Button>
          </div>
          <iframe
            key={`${report.id}-${version}-${report.updatedAt}`}
            title="Vista previa del informe"
            src={`/rv/${report.id}`}
            className="h-[calc(100vh-7rem)] w-full rounded-xl border border-border bg-card"
          />
          {dirty ? (
            <p className="text-xs text-warning">
              Hay cambios sin guardar: guarda para verlos en la vista previa.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ReportEditor({
  projectId,
  reportId,
}: {
  projectId: string;
  reportId: string;
}) {
  const query = useQuery({
    queryKey: ["client-report", projectId, reportId],
    queryFn: () => getClientReport({ data: { projectId, reportId } }),
  });
  if (query.isError) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <QueryError
          variant="card"
          error={query.error}
          fallback="No se pudo cargar el informe."
          onRetry={() => void query.refetch()}
          isRetrying={query.isFetching}
        />
      </div>
    );
  }
  if (query.isPending) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">
        Este informe no existe.
      </div>
    );
  }
  return (
    <Editor key={query.data.id} report={query.data} projectId={projectId} />
  );
}
