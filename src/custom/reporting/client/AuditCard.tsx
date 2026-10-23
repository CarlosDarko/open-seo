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
  applyCachedAudits,
  getReportPageTypes,
  pruneReportAudits,
  saveReportAudit,
} from "@/serverFunctions/reporting";

const pathOf = (url: string) => {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
};

export type AuditRun = {
  done: number;
  total: number;
  failed: string | null;
  /** Pages filled from an audit saved earlier (no new request). */
  reused: number;
};

const RECENT_HOURS = 24 * 7;
const ANY_HOURS = 24 * 90;
const limited = (message: string) =>
  /l[ií]mite|limit|429|demasiad|too many/i.test(message);

/** Audits the example pages of the saved page types with Microaudit and keeps
 *  every answer in the report. It never leaves the report without the
 *  technical analysis: recent audits are reused instead of asked again, a
 *  failed request is retried, and when Microaudit still does not answer the
 *  last audit saved for that page fills the gap. It runs in the browser:
 *  Microaudit limits audits per IP and the consultant's is allowed. */
export async function auditPageTypes(
  projectId: string,
  reportId: string,
  types: { name: string; urls: string[] }[],
  onProgress: (text: string) => void,
  options: { force?: boolean } = {},
): Promise<AuditRun> {
  const all = types.map((type) => ({
    name: type.name,
    urls: type.urls.slice(0, 5),
  }));
  const total = all.reduce((sum, type) => sum + type.urls.length, 0);
  let reused = 0;
  let covered = new Set<string>();
  if (!options.force) {
    onProgress("Buscando auditorías recientes de estas páginas…");
    const fresh = await applyCachedAudits({
      data: { projectId, reportId, types: all, maxAgeHours: RECENT_HOURS },
    }).catch(() => ({ applied: [] as string[] }));
    covered = new Set(fresh.applied);
    reused = covered.size;
  }
  const jobs = all.flatMap((type) =>
    type.urls
      .filter((url) => !covered.has(url))
      .map((url) => ({ type: type.name, url })),
  );
  let done = reused;
  let failed: string | null = null;
  if (jobs.length > 0) {
    // Microaudit takes 15 to 60 seconds per page: ask for three at a time,
    // and try again (twice) when a request fails for any reason but the limit.
    const answers: Awaited<ReturnType<typeof runMicroaudit>>[] = [];
    let finished = 0;
    onProgress(
      `Auditando ${jobs.length} páginas con Microaudit (0 de ${jobs.length})…`,
    );
    for (let from = 0; from < jobs.length; from += 3) {
      const results = await Promise.all(
        jobs.slice(from, from + 3).map(async (job) => {
          let result = await runMicroaudit(job.url);
          for (
            let retry = 0;
            retry < 2 && !result.ok && !limited(result.message);
            retry += 1
          ) {
            await new Promise((resolve) => setTimeout(resolve, 4000));
            result = await runMicroaudit(job.url);
          }
          finished += 1;
          onProgress(
            `Auditando ${jobs.length} páginas con Microaudit (${finished} de ${jobs.length})…`,
          );
          return result;
        }),
      );
      answers.push(...results);
    }
    // Saved one after the other: each save reads and rewrites the report.
    for (let index = 0; index < jobs.length; index += 1) {
      const result = answers[index];
      if (!result.ok) {
        failed ??= result.message;
        continue;
      }
      const job = jobs[index];
      const stored = await saveReportAudit({
        data: {
          projectId,
          reportId,
          type: job.type,
          url: job.url,
          markdown: result.markdown,
        },
      });
      if (stored.ok && stored.unreadable) {
        failed ??= `Microaudit no pudo leer ${job.url}: la web parece bloquear el rastreo.`;
      } else if (stored.ok) done += 1;
      else failed ??= "No se pudo leer la respuesta de Microaudit.";
    }
  }
  // Whatever Microaudit did not answer: the last audit saved for the page.
  if (done < total) {
    onProgress("Completando con las últimas auditorías guardadas…");
    const older = await applyCachedAudits({
      data: { projectId, reportId, types: all, maxAgeHours: ANY_HOURS },
    }).catch(() => ({ applied: [] as string[] }));
    const extra = older.applied.filter((url) => !covered.has(url)).length;
    reused += Math.max(0, Math.min(extra, total - done));
    done = Math.min(total, done + Math.max(0, extra));
  }
  // Audits of pages that are not an example any more would repeat a type.
  await pruneReportAudits({
    data: {
      projectId,
      reportId,
      urls: all.flatMap((type) => type.urls),
    },
  }).catch(() => undefined);
  return { done, total, failed: done >= total ? null : failed, reused };
}

/** Microaudit's audit of the example pages of each page type (these are set
 *  in the project's Context page). */
export function AuditCard({
  projectId,
  reportId,
  audits,
  busy,
  note,
  onChanged,
}: {
  projectId: string;
  reportId: string;
  audits: AuditPage[];
  /** The report is preparing itself (audits and AI): nothing to launch now. */
  busy: boolean;
  /** What the automatic audit said when the report prepared itself. */
  note: string | null;
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
    mutationFn: () =>
      auditPageTypes(projectId, reportId, types, setProgress, { force: true }),
    onSuccess: ({ done, total: all, failed, reused }) => {
      setProgress(null);
      setMessage(
        failed
          ? `Se han auditado ${done} de ${all} páginas. Microaudit ha respondido: ${failed}`
          : `Auditoría terminada: ${done} páginas${reused > 0 ? ` (${reused} con la última auditoría guardada)` : ""}.`,
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
                variant={audits.length > 0 ? "outline" : "default"}
                disabled={audit.isPending || busy}
                title="Se audita solo al crear el informe. Úsalo para repetir la auditoría, por ejemplo tras corregir cosas en la web."
                onClick={() => audit.mutate()}
              >
                <ScanSearch className="size-3.5" aria-hidden />
                {audit.isPending
                  ? "Auditando…"
                  : audits.length > 0
                    ? `Volver a auditar ${total} páginas`
                    : `Auditar ${total} páginas`}
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
        {(message ?? note) ? (
          <p className="text-xs">{message ?? note}</p>
        ) : null}
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
