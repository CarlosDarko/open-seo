import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, ScanSearch, Trash2 } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { runMicroaudit } from "@/custom/reporting/client/microauditClient";
import type { AuditPage } from "@/custom/reporting/types";
import {
  clearReportAudits,
  getReportPageTypes,
  saveReportAudit,
  saveReportPageTypes,
} from "@/serverFunctions/reporting";

const NEWLINE = String.fromCharCode(10);
type Draft = { name: string; urls: string };

const pathOf = (url: string) => {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
};

/** The page types of the site and the Microaudit audit of their examples. */
export function AuditCard({
  projectId,
  reportId,
  audits,
  onChanged,
}: {
  projectId: string;
  reportId: string;
  audits: AuditPage[];
  onChanged: () => void;
}) {
  const saved = useQuery({
    queryKey: ["report-page-types", projectId],
    queryFn: () => getReportPageTypes({ data: { projectId } }),
  });
  const [types, setTypes] = useState<Draft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    if (saved.data && !loaded) {
      setTypes(
        saved.data.map((type) => ({
          name: type.name,
          urls: type.urls.join(NEWLINE),
        })),
      );
      setLoaded(true);
    }
  }, [saved.data, loaded]);

  const parsed = types.map((type) => ({
    name: type.name.trim(),
    urls: type.urls
      .split(NEWLINE)
      .map((line) => line.trim())
      .filter(Boolean),
  }));
  const valid = parsed.filter((type) => type.name && type.urls.length > 0);
  const total = valid.reduce((sum, type) => sum + type.urls.length, 0);

  const saveTypes = useMutation({
    mutationFn: () =>
      saveReportPageTypes({
        data: {
          projectId,
          types: valid.map((type) => ({
            name: type.name,
            urls: type.urls.slice(0, 5),
          })),
        },
      }),
    onSuccess: () => setMessage("Tipologías guardadas para este cliente."),
    onError: () =>
      setMessage(
        "No se pudieron guardar. Revisa que las direcciones sean válidas.",
      ),
  });

  const audit = useMutation({
    mutationFn: async () => {
      let done = 0;
      let failed: string | null = null;
      for (const type of valid) {
        for (const url of type.urls.slice(0, 5)) {
          setProgress(`Auditando ${done + 1} de ${total}: ${pathOf(url)}…`);
          const result = await runMicroaudit(url);
          if (!result.ok) {
            failed = result.message;
            break;
          }
          const stored = await saveReportAudit({
            data: {
              projectId,
              reportId,
              type: type.name,
              url,
              markdown: result.markdown,
            },
          });
          if (!stored.ok) {
            failed = "No se pudo leer la respuesta de Microaudit.";
            break;
          }
          done += 1;
        }
        if (failed) break;
      }
      return { done, failed };
    },
    onSuccess: ({ done, failed }) => {
      setProgress(null);
      setMessage(
        failed
          ? `Se han auditado ${done} de ${total} páginas. Microaudit ha respondido: ${failed}`
          : `Auditoría terminada: ${done} páginas.`,
      );
      onChanged();
    },
    onError: () => {
      setProgress(null);
      setMessage("La auditoría se ha interrumpido. Prueba de nuevo.");
    },
  });

  const clear = useMutation({
    mutationFn: () => clearReportAudits({ data: { projectId, reportId } }),
    onSuccess: () => {
      setMessage("Auditorías quitadas del informe.");
      onChanged();
    },
  });

  const update = (index: number, patch: Partial<Draft>) =>
    setTypes((previous) =>
      previous.map((type, at) => (at === index ? { ...type, ...patch } : type)),
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auditoría técnica de páginas tipo</CardTitle>
        <p className="text-xs text-muted-foreground">
          Define las tipologías de página del cliente (inicio, categoría,
          producto, blog…) con de 1 a 5 páginas de ejemplo cada una. Microaudit
          las audita y el informe habla de las plantillas del sitio. Se lanza
          desde tu navegador, con tu IP (Microaudit limita las auditorías por
          IP).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {types.map((type, index) => (
          <div key={index} className="space-y-1.5 rounded-lg border p-3">
            <div className="flex gap-2">
              <Input
                value={type.name}
                onChange={(event) =>
                  update(index, { name: event.target.value })
                }
                placeholder="Tipología (por ejemplo, Producto)"
                aria-label="Nombre de la tipología"
                maxLength={40}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Quitar tipología"
                onClick={() =>
                  setTypes((previous) =>
                    previous.filter((_, at) => at !== index),
                  )
                }
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
            <Textarea
              rows={3}
              value={type.urls}
              onChange={(event) => update(index, { urls: event.target.value })}
              placeholder={`https://… (una por línea, máximo 5)`}
              aria-label="Páginas de ejemplo"
            />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={types.length >= 8}
            onClick={() =>
              setTypes((previous) => [...previous, { name: "", urls: "" }])
            }
          >
            <Plus className="size-3.5" aria-hidden />
            Añadir tipología
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={saveTypes.isPending || valid.length === 0}
            onClick={() => saveTypes.mutate()}
          >
            Guardar tipologías
          </Button>
          <Button
            size="sm"
            disabled={audit.isPending || total === 0}
            onClick={() => audit.mutate()}
          >
            <ScanSearch className="size-3.5" aria-hidden />
            {audit.isPending ? "Auditando…" : `Auditar ${total} páginas`}
          </Button>
        </div>
        {progress ? (
          <p className="text-xs text-muted-foreground">{progress}</p>
        ) : null}
        {message ? <p className="text-xs">{message}</p> : null}
        {audits.length > 0 ? (
          <div className="space-y-1 border-t pt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Auditadas en este informe</p>
              <Button
                variant="ghost"
                size="sm"
                disabled={clear.isPending}
                onClick={() => clear.mutate()}
              >
                Quitar
              </Button>
            </div>
            {audits.map((item) => (
              <p
                key={item.url}
                className="flex justify-between gap-3 text-xs text-muted-foreground"
              >
                <span className="truncate">
                  {item.type} · {pathOf(item.url)}
                </span>
                <strong className="text-foreground">
                  {item.score === null ? "—" : Math.round(item.score)}
                </strong>
              </p>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
