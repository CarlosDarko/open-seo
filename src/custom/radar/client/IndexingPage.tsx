import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Checkbox } from "@/client/components/ui/checkbox";
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
import { PageLink } from "@/custom/radar/client/RadarLinks";
import { integer, percent } from "@/custom/radar/format";
import {
  getIndexReport,
  inspectIndexUrls,
  type InspectedUrl,
} from "@/serverFunctions/radarIndexing";

const MAX_INSPECT = 25;
const BATCH = 5;

const COVERAGE_ES: Record<string, string> = {
  "Submitted and indexed": "Enviada e indexada",
  "Indexed, not submitted in sitemap": "Indexada, pero no está en el sitemap",
  "Crawled - currently not indexed": "Rastreada, pero Google no la indexa",
  "Discovered - currently not indexed": "Descubierta, pero sin rastrear ni indexar",
  "Duplicate without user-selected canonical": "Duplicada: no has elegido canónica",
  "Duplicate, Google chose different canonical than user": "Duplicada: Google eligió otra canónica",
  "Duplicate, submitted URL not selected as canonical": "Duplicada: Google prefiere otra URL",
  "Page with redirect": "Redirección",
  "Not found (404)": "No encontrada (404)",
  "Soft 404": "Soft 404 (parece vacía)",
  "Blocked by robots.txt": "Bloqueada por robots.txt",
  "Excluded by 'noindex' tag": "Excluida por etiqueta noindex",
  "URL is unknown to Google": "Google no la conoce",
  "Alternate page with proper canonical tag": "Alternativa con canónica correcta",
  "Server error (5xx)": "Error de servidor (5xx)",
};

function coverageText(state: string | null): string {
  if (!state) return "Sin información";
  return COVERAGE_ES[state] ?? state;
}

const VERDICT: Record<string, { label: string; className: string }> = {
  PASS: { label: "Indexada", className: "bg-success/10 text-success" },
  FAIL: { label: "No indexada", className: "bg-destructive/10 text-destructive" },
  NEUTRAL: { label: "Excluida", className: "bg-warning/10 text-warning" },
  PARTIAL: { label: "Parcial", className: "bg-warning/10 text-warning" },
};

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

function day(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormat.format(date);
}

export function IndexingPage({ projectId }: { projectId: string }) {
  const report = useQuery({
    queryKey: ["radar-index", projectId],
    queryFn: () => getIndexReport({ data: { projectId } }),
    staleTime: 10 * 60_000,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inspected, setInspected] = useState<Map<string, InspectedUrl>>(new Map());

  // Google answers one URL at a time; they are sent in small batches so the
  // results appear as they arrive and the progress is visible.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [inspectFailed, setInspectFailed] = useState(false);
  const inspecting = progress !== null;
  const runInspect = async (urls: string[]) => {
    const list = urls.slice(0, MAX_INSPECT);
    setInspectFailed(false);
    setProgress({ done: 0, total: list.length });
    try {
      for (let start = 0; start < list.length; start += BATCH) {
        const data = await inspectIndexUrls({
          data: { projectId, urls: list.slice(start, start + BATCH) },
        });
        setInspected((previous) => {
          const next = new Map(previous);
          for (const item of data.results) next.set(item.url, item);
          return next;
        });
        setProgress({ done: Math.min(start + BATCH, list.length), total: list.length });
      }
    } catch {
      setInspectFailed(true);
    } finally {
      setProgress(null);
    }
  };
  const progressText = progress
    ? `Consultando a Google… ${progress.done} de ${progress.total}`
    : "";

  const data = report.data?.connected ? report.data : null;
  const unseen = data?.unseen ?? [];
  const selectedUrls = useMemo(
    () => unseen.filter((item) => selected.has(item.url)).map((item) => item.url),
    [unseen, selected],
  );

  const toggle = (url: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(url)) next.delete(url);
      else if (next.size < MAX_INSPECT) next.add(url);
      return next;
    });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-6">
      <PageHeader
        title="Indexación y sitemap"
        description="Qué URLs publicas en el sitemap, cuáles ve Google de verdad y por qué otras no aparecen. Cruza tu sitemap con Search Console (últimos 3 meses) y usa la Inspección de URL de Google. Gratis."
      />

      {report.isError ? (
        <QueryError
          variant="card"
          error={report.error}
          fallback="No se pudo analizar el sitemap."
          onRetry={() => void report.refetch()}
          isRetrying={report.isFetching}
        />
      ) : report.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
          <p className="text-sm text-muted-foreground">
            Leyendo tu sitemap y los datos de Search Console…
          </p>
        </div>
      ) : report.data && !report.data.connected ? (
        <Card>
          <CardContent className="space-y-3 py-8 text-center">
            <p className="font-medium">
              {report.data.reason === "reconnect"
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
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "URLs en el sitemap", value: data.counts.inSitemap },
              { label: "Páginas con impresiones (3 meses)", value: data.counts.pagesWithImpressions },
              {
                label: "En el sitemap sin ninguna impresión",
                value: data.counts.unseen,
                hint:
                  data.counts.inSitemap > 0
                    ? `${percent.format(data.counts.unseen / data.counts.inSitemap)} del sitemap`
                    : undefined,
              },
              { label: "Con impresiones pero fuera del sitemap", value: data.counts.notInSitemap },
            ].map((card) => (
              <Card key={card.label}>
                <CardContent className="space-y-1">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {card.label}
                  </p>
                  <p className="text-2xl leading-tight font-semibold tabular-nums">
                    {integer.format(card.value)}
                  </p>
                  {card.hint ? (
                    <p className="text-xs text-muted-foreground">{card.hint}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>

          {data.counts.inSitemap === 0 ? (
            <Card>
              <CardContent className="space-y-1 py-6 text-sm">
                <p className="font-medium">No he encontrado URLs en tu sitemap.</p>
                <p className="text-muted-foreground">
                  Si no tienes sitemap, créalo y envíalo en Search Console
                  (Sitemaps): ayuda a Google a descubrir tus páginas. Si lo
                  tienes, comprueba que está en /sitemap.xml o declarado en
                  robots.txt
                  {data.read.failed.length > 0
                    ? ` (no se pudo leer: ${data.read.failed.slice(0, 2).join(", ")})`
                    : ""}
                  .
                </p>
              </CardContent>
            </Card>
          ) : null}

          {data.read.truncated ? (
            <p className="text-xs text-muted-foreground">
              El sitemap es muy grande: se han leído {data.read.files} archivos y
              como máximo 5.000 URLs.
            </p>
          ) : null}

          <TableCard>
            <div className="border-b border-border p-4">
              <h3 className="font-medium">Sitemaps enviados a Google</h3>
              <p className="text-xs text-muted-foreground">
                Lo que Search Console dice de cada sitemap que has enviado.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sitemap</TableHead>
                  <TableHead className="text-right">Última lectura</TableHead>
                  <TableHead className="text-right">URLs enviadas</TableHead>
                  <TableHead className="text-right">Errores</TableHead>
                  <TableHead className="text-right">Avisos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sitemaps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                      No hay ningún sitemap enviado en Search Console. Envíalo
                      en «Sitemaps» para que Google lo lea con regularidad.
                    </TableCell>
                  </TableRow>
                ) : null}
                {data.sitemaps.map((sitemap) => (
                  <TableRow key={sitemap.path}>
                    <TableCell className="min-w-64">
                      <PageLink url={sitemap.path} />
                      {sitemap.isIndex ? (
                        <span className="ml-1 text-xs text-muted-foreground">(índice)</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {day(sitemap.lastDownloaded)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {integer.format(sitemap.submitted)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${sitemap.errors > 0 ? "font-semibold text-destructive" : ""}`}
                    >
                      {integer.format(sitemap.errors)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${sitemap.warnings > 0 ? "text-warning" : ""}`}
                    >
                      {integer.format(sitemap.warnings)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>

          {data.sections.length > 0 ? (
            <TableCard>
              <div className="border-b border-border p-4">
                <h3 className="font-medium">Dónde está el problema</h3>
                <p className="text-xs text-muted-foreground">
                  Las secciones de tu sitemap con más URLs que Google no
                  muestra nunca. Un porcentaje alto en una sección apunta a
                  contenido ignorado o sin indexar.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sección</TableHead>
                    <TableHead className="text-right">En el sitemap</TableHead>
                    <TableHead className="text-right">Sin impresiones</TableHead>
                    <TableHead className="text-right">Porcentaje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sections.map((section) => (
                    <TableRow key={section.label}>
                      <TableCell>{section.label}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {integer.format(section.inSitemap)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {integer.format(section.unseen)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${section.unseen / section.inSitemap > 0.5 ? "font-semibold text-destructive" : ""}`}
                      >
                        {percent.format(section.unseen / section.inSitemap)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          ) : null}

          <Card>
            <CardHeader className="space-y-1">
              <CardTitle>Tus 20 páginas con más tráfico</CardTitle>
              <p className="text-xs text-muted-foreground">
                Comprueba cómo las ve Google: indexación, última visita y si
                eligió otra URL como canónica (un problema silencioso).
              </p>
            </CardHeader>
            <CardContent>
              <Button
                size="sm"
                variant="outline"
                disabled={inspecting || data.topPages.length === 0}
                onClick={() => void runInspect(data.topPages)}
              >
                {inspecting ? progressText : "Comprobar mis páginas principales"}
              </Button>
              {inspectFailed ? (
                <p className="mt-2 text-sm text-destructive">
                  No se pudo consultar a Google (puede haber alcanzado la cuota
                  diaria). Prueba más tarde.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {inspected.size > 0 ? (
            <InspectionTable results={[...inspected.values()]} />
          ) : null}

          {unseen.length > 0 ? (
            <TableCard>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
                <div>
                  <h3 className="font-medium">
                    En el sitemap pero sin ninguna impresión en 3 meses
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Candidatas a no estar indexadas o a ser ignoradas por
                    Google. Marca hasta {MAX_INSPECT} y comprueba qué dice Google
                    de cada una.
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={selectedUrls.length === 0 || inspecting}
                  onClick={() => void runInspect(selectedUrls)}
                >
                  {inspecting
                    ? progressText
                    : `Comprobar ${selectedUrls.length} seleccionadas`}
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>URL</TableHead>
                    <TableHead>Sección</TableHead>
                    <TableHead>Qué dice Google</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unseen.map((item) => {
                    const result = inspected.get(item.url);
                    return (
                      <TableRow key={item.url}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(item.url)}
                            onCheckedChange={() => toggle(item.url)}
                            aria-label={`Seleccionar ${item.url}`}
                          />
                        </TableCell>
                        <TableCell className="min-w-72">
                          <PageLink url={item.url} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {item.section}
                        </TableCell>
                        <TableCell className="text-sm">
                          {result
                            ? result.error
                              ? result.error
                              : coverageText(result.coverageState)
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableCard>
          ) : null}

          {data.notInSitemap.length > 0 ? (
            <TableCard>
              <div className="border-b border-border p-4">
                <h3 className="font-medium">Con impresiones pero fuera del sitemap</h3>
                <p className="text-xs text-muted-foreground">
                  Páginas que Google ya muestra y que no declaras. Si son
                  páginas que quieres posicionar, añádelas al sitemap; si son
                  parámetros o duplicados, revisa su canónica.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead className="text-right">Impresiones</TableHead>
                    <TableHead className="text-right">Clics</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.notInSitemap.map((item) => (
                    <TableRow key={item.url}>
                      <TableCell className="min-w-72">
                        <PageLink url={item.url} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {integer.format(item.impressions)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {integer.format(item.clicks)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function InspectionTable({ results }: { results: InspectedUrl[] }) {
  return (
    <TableCard>
      <div className="border-b border-border p-4">
        <h3 className="font-medium">Lo que dice Google de estas URLs</h3>
        <p className="text-xs text-muted-foreground">
          Resultado de la Inspección de URL. «Canónica» distinta significa que
          Google ha elegido otra URL como la principal de esa página.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>URL</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Detalle</TableHead>
            <TableHead className="text-right">Último rastreo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((item) => {
            const verdict = item.verdict ? VERDICT[item.verdict] : undefined;
            return (
              <TableRow key={item.url}>
                <TableCell className="min-w-64 align-top">
                  <PageLink url={item.url} />
                </TableCell>
                <TableCell className="align-top whitespace-nowrap">
                  {verdict ? (
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${verdict.className}`}
                    >
                      {verdict.label}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="space-y-1 align-top text-sm">
                  <p>{item.error ?? coverageText(item.coverageState)}</p>
                  {item.cached ? (
                    <p className="text-xs text-muted-foreground">
                      Dato guardado de hace menos de 12 horas.
                    </p>
                  ) : null}
                  {item.canonicalMismatch ? (
                    <p className="text-xs text-warning">
                      Canónica distinta. Tú declaras {item.userCanonical}; Google
                      eligió {item.googleCanonical}.
                    </p>
                  ) : null}
                  {item.robotsTxtState === "DISALLOWED" ? (
                    <p className="text-xs text-destructive">Bloqueada por robots.txt.</p>
                  ) : null}
                </TableCell>
                <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
                  {day(item.lastCrawlTime)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableCard>
  );
}
