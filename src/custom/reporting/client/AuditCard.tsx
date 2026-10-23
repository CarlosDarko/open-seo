import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ScanSearch } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { runMicroaudit } from "@/custom/reporting/client/microauditClient";
import { pageTypesKey } from "@/custom/reporting/client/PageTypesSection";
import type { AuditPage } from "@/custom/reporting/types";
import {
  clearReportAudits,
  getReportPageTypes,
  saveReportAudit,
} from "@/serverFunctions/reporting";

const pathOf = (url: string) => {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
};

export type AuditRun = { done: number; total: number; failed: string | null };

/** Audits every example page of the saved page types with Microaudit, one
 *  after the other, and stores each answer in the report. It runs in the
 *  browser: Microaudit limits audits per IP and the consultant's is allowed. */
export async function auditPageTypes(
  projectId: string,
  reportId: string,
  types: { name: string; urls: string[] }[],
  onProgress: (text: string) => void,
): Promise<AuditRun> {
  const total = types.reduce((sum, type) => sum + type.urls.length, 0);
  let done = 0;
  for (const type of types) {
    for (const url of type.urls) {
      onProgress(`Auditando ${done + 1} de ${total}: ${pathOf(url)}…`);
      const result = await runMicroaudit(url);
      if (!result.ok) return { done, total, failed: result.message };
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
        return {
          done,
          total,
          failed: "No se pudo leer la respuesta de Microaudit.",
        };
      }
      done += 1;
    }
  }
  return { done, total, failed: null };
}

/** Microaudit's audit of the example pages of each page type (these are set
 *  in the project's Context page). */
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
    queryKey: pageTypesKey(projectId),
    queryFn: () => getReportPageTypes({ data: { projectId } }),
  });
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const types = saved.data ?? [];
  const total = types.reduce((sum, type) => sum + type.urls.length, 0);

  const audit = useMutation({
    mutationFn: () => auditPageTypes(projectId, reportId, types, setProgress),
    onSuccess: ({ done, total: all, failed }) => {
      setProgress(null);
      setMessage(
        failed
          ? `Se han auditado ${done} de ${all} páginas. Microaudit ha respondido: ${failed}`
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auditoría técnica de páginas tipo</CardTitle>
        <p className="text-xs text-muted-foreground">
          Microaudit audita las páginas de ejemplo de cada tipología y el
          informe habla de las plantillas del sitio. Se lanza desde tu
          navegador, con tu IP (Microaudit limita las auditorías por IP).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {types.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay tipologías de página. Defínelas en{" "}
            <Link
              to="/p/$projectId/context"
              params={{ projectId }}
              className="font-medium text-foreground underline"
            >
              Contexto del proyecto
            </Link>{" "}
            (sección «Tipologías de página») y vuelve aquí.
          </p>
        ) : (
          <>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {types.map((type) => (
                <li key={type.name}>
                  <strong className="text-foreground">{type.name}</strong>:{" "}
                  {type.urls.length}{" "}
                  {type.urls.length === 1 ? "página" : "páginas"}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={audit.isPending}
                onClick={() => audit.mutate()}
              >
                <ScanSearch className="size-3.5" aria-hidden />
                {audit.isPending ? "Auditando…" : `Auditar ${total} páginas`}
              </Button>
              <Link
                to="/p/$projectId/context"
                params={{ projectId }}
                className="text-xs text-muted-foreground underline"
              >
                Editar tipologías
              </Link>
            </div>
          </>
        )}
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
