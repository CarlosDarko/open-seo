import { useMutation } from "@tanstack/react-query";
import { Activity, FileText, Gauge, ShieldAlert } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Skeleton } from "@/client/components/ui/skeleton";
import { TableCard } from "@/client/components/ui/table";
import { PageLink } from "@/custom/radar/client/RadarLinks";
import { DataTable } from "@/custom/radar/client/sortable";
import { integer } from "@/custom/radar/format";
import {
  getCrawlHealth,
  type CrawlHealth,
  type PageHealth,
} from "@/serverFunctions/radarCrawl";

type Tone = "good" | "warn" | "bad";

const PILL: Record<Tone, string> = {
  good: "bg-success/10 text-success",
  warn: "bg-warning/10 text-warning",
  bad: "bg-destructive/10 text-destructive",
};

/** How an answer time reads for a crawler: under 0,6 s is comfortable. */
export function speedTone(ms: number | null): Tone {
  if (ms === null) return "bad";
  return ms < 600 ? "good" : ms < 1500 ? "warn" : "bad";
}

export function pageProblems(page: PageHealth): string[] {
  const problems: string[] = [];
  if (page.error) problems.push(page.error);
  else if (page.status === 0) problems.push("Sin respuesta");
  else if (page.status >= 400) problems.push(`Error ${page.status}`);
  if (page.redirectsOutside) problems.push("Redirige fuera del sitio");
  if (page.blockedByRobots) problems.push("Bloqueada por robots.txt");
  if (page.noindexHeader) problems.push("noindex en la cabecera");
  if (page.hops.length > 1) problems.push("Cadena de redirecciones");
  if (page.ttfbMs !== null && page.ttfbMs >= 1500)
    problems.push("Respuesta lenta");
  return problems;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function StatusPill({ page }: { page: PageHealth }) {
  const ok = page.status >= 200 && page.status < 300;
  const redirect = page.status >= 300 && page.status < 400;
  const tone: Tone =
    ok && page.hops.length === 0 ? "good" : ok || redirect ? "warn" : "bad";
  return (
    <span
      className={`inline-block min-w-12 rounded-full px-2 py-0.5 text-center text-xs font-bold ${PILL[tone]}`}
    >
      {page.status === 0 ? "—" : page.status}
    </span>
  );
}

/**
 * The "Servidor y robots.txt" tab: how a crawler meets the site. Measured on
 * demand from Cloudflare's network (free), so it is a reference, not
 * Googlebot's own figures (those are only in Search Console's web interface).
 */
export function CrawlHealthPanel({
  projectId,
  result,
  onResult,
}: {
  projectId: string;
  result: CrawlHealth | null;
  onResult: (result: CrawlHealth) => void;
}) {
  const measure = useMutation({
    mutationFn: () => getCrawlHealth({ data: { projectId } }),
    onSuccess: (data) => {
      if (data.connected) onResult(data);
    },
  });
  const failed = measure.isError;
  const notConnected =
    measure.data && !measure.data.connected ? measure.data.reason : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-2xl">
            <p className="font-medium">Cómo responde tu web a un rastreador</p>
            <p className="text-sm text-muted-foreground">
              Lee tu <strong>robots.txt</strong> y mide cómo contestan tus 10
              páginas con más clics: estado, redirecciones y tiempo de
              respuesta. Se mide desde la red de Cloudflare, no desde Googlebot,
              así que es una referencia. Gratis.
            </p>
          </div>
          <Button onClick={() => measure.mutate()} disabled={measure.isPending}>
            <Activity className="size-4" aria-hidden />
            {measure.isPending
              ? "Midiendo…"
              : result
                ? "Volver a medir"
                : "Medir ahora"}
          </Button>
        </CardContent>
      </Card>

      {failed ? (
        <p className="text-sm text-destructive">
          No se pudo medir ahora mismo. Prueba de nuevo en un momento.
        </p>
      ) : null}
      {notConnected ? (
        <p className="text-sm text-destructive">
          {notConnected === "reconnect"
            ? "La conexión con Google ha caducado: reconecta Search Console."
            : "Este proyecto no tiene Search Console conectado."}
        </p>
      ) : null}
      {measure.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : null}

      {result && !measure.isPending ? <Results result={result} /> : null}
    </div>
  );
}

function Results({ result }: { result: CrawlHealth }) {
  const { robots, pages } = result;
  const answered = pages.filter((page) => page.ttfbMs !== null);
  const typical = median(answered.map((page) => page.ttfbMs as number));
  const withProblems = pages.filter((page) => pageProblems(page).length > 0);
  const blocked = pages.filter(
    (page) => page.blockedByRobots || page.noindexHeader,
  );
  const robotsTone: Tone = !robots.found
    ? robots.status === 404
      ? "warn"
      : "bad"
    : robots.homeBlocked || blocked.some((page) => page.blockedByRobots)
      ? "bad"
      : "good";
  const robotsLabel = !robots.found
    ? robots.status === 404
      ? "No existe"
      : "No se pudo leer"
    : robots.homeBlocked
      ? "Bloquea tu web"
      : blocked.some((page) => page.blockedByRobots)
        ? "Bloquea páginas clave"
        : "Correcto";

  const tiles = [
    {
      icon: Gauge,
      label: "Respuesta típica",
      value: typical === null ? "—" : `${integer.format(typical)} ms`,
      tone: speedTone(typical),
      hint:
        typical === null
          ? "Ninguna página respondió"
          : typical < 600
            ? "Rápida: cómoda para un rastreador"
            : typical < 1500
              ? "Aceptable, mejorable"
              : "Lenta: Google rastreará menos",
    },
    {
      icon: Activity,
      label: "Páginas sin problemas",
      value: `${pages.length - withProblems.length} de ${pages.length}`,
      tone: (withProblems.length === 0
        ? "good"
        : withProblems.length > 2
          ? "bad"
          : "warn") as Tone,
      hint:
        withProblems.length === 0
          ? "Todas responden bien"
          : `${withProblems.length} con algún aviso`,
    },
    {
      icon: FileText,
      label: "robots.txt",
      value: robotsLabel,
      tone: robotsTone,
      hint: robots.found
        ? `${robots.sitemaps.length} sitemap${robots.sitemaps.length === 1 ? "" : "s"} declarado${robots.sitemaps.length === 1 ? "" : "s"}`
        : "Sin él, Google rastrea todo por defecto",
    },
    {
      icon: ShieldAlert,
      label: "Bloqueadas o con noindex",
      value: String(blocked.length),
      tone: (blocked.length === 0 ? "good" : "bad") as Tone,
      hint:
        blocked.length === 0
          ? "Ninguna de tus páginas clave"
          : "Revisa estas páginas ahora",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <tile.icon className="size-3.5" aria-hidden />
                {tile.label}
              </p>
              <p>
                <span
                  className={`inline-block rounded-full px-3 py-1 text-lg font-bold tabular-nums ${PILL[tile.tone]}`}
                >
                  {tile.value}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{tile.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <RobotsCard robots={robots} origin={result.origin} />

      <TableCard>
        <div className="border-b border-border p-4">
          <h3 className="font-medium">Cómo responde cada página clave</h3>
          <p className="text-xs text-muted-foreground">
            Tus 10 páginas con más clics en 28 días. «Respuesta» es el tiempo
            hasta el primer byte. Pulsa una columna para ordenar.
          </p>
        </div>
        <DataTable
          rows={pages}
          rowKey={(page) => page.url}
          initial={{ col: 3, dir: "desc" }}
          columns={[
            {
              label: "Página",
              text: true,
              value: (page) => page.url,
              render: (page) => <PageLink url={page.url} />,
              className: "min-w-64 align-top",
            },
            {
              label: "Estado",
              value: (page) => page.status,
              render: (page) => <StatusPill page={page} />,
            },
            {
              label: "Redirecciones",
              value: (page) => page.hops.length,
              render: (page) =>
                page.hops.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span
                    title={page.hops
                      .map((hop) => `${hop.status} → ${hop.to}`)
                      .join("\n")}
                  >
                    {page.hops.length}
                  </span>
                ),
            },
            {
              label: "Respuesta",
              value: (page) => page.ttfbMs,
              render: (page) =>
                page.ttfbMs === null ? (
                  "—"
                ) : (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${PILL[speedTone(page.ttfbMs)]}`}
                  >
                    {integer.format(page.ttfbMs)} ms
                  </span>
                ),
            },
            {
              label: "Tamaño",
              value: (page) => page.bytes,
              render: (page) =>
                page.bytes === null
                  ? "—"
                  : `${integer.format(page.bytes / 1000)} KB`,
            },
            {
              label: "Avisos",
              text: true,
              value: (page) => pageProblems(page).length,
              render: (page) => {
                const problems = pageProblems(page);
                return problems.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    Sin avisos
                  </span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {problems.map((problem) => (
                      <span
                        key={problem}
                        className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive"
                      >
                        {problem}
                      </span>
                    ))}
                  </span>
                );
              },
              className: "min-w-48 align-top",
            },
          ]}
        />
      </TableCard>
      <p className="text-xs text-muted-foreground">
        Medido el{" "}
        {new Intl.DateTimeFormat("es-ES", {
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Madrid",
        }).format(new Date(result.measuredAt))}{" "}
        desde la red de Cloudflare. Una sola medida: repítela si ves algo raro
        antes de sacar conclusiones.
      </p>
    </div>
  );
}

function RobotsCard({
  robots,
  origin,
}: {
  robots: CrawlHealth["robots"];
  origin: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-medium">Tu robots.txt</h3>
          <a
            href={`${origin}/robots.txt`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-primary hover:underline"
          >
            Abrirlo ↗
          </a>
        </div>
        {!robots.found ? (
          <p className="text-sm text-muted-foreground">
            {robots.error ??
              (robots.status === 404
                ? "Tu web no tiene robots.txt. No es un error: Google rastrea todo lo que encuentra. Sirve para indicar el sitemap y bloquear zonas que no quieres que rastree."
                : `Respondió con el código ${robots.status ?? "desconocido"}.`)}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                Sitemaps que declara
              </p>
              {robots.sitemaps.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ninguno. Declarar el sitemap ayuda a Google a encontrarlo.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {robots.sitemaps.slice(0, 6).map((sitemap) => (
                    <li key={sitemap} className="min-w-0 truncate">
                      <PageLink url={sitemap} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                {robots.group === "googlebot"
                  ? "Reglas solo para Googlebot"
                  : "Reglas para todos los rastreadores"}
              </p>
              {robots.disallows.length === 0 ? (
                <p className="text-sm text-success">
                  No bloquea nada: todo es rastreable.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {robots.disallows.map((path) => (
                    <li
                      key={path}
                      className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs"
                      title="Googlebot no rastrea las direcciones que empiezan así"
                    >
                      {path}
                    </li>
                  ))}
                </ul>
              )}
              {robots.crawlDelay !== null ? (
                <p className="text-xs text-warning">
                  Pide esperar {robots.crawlDelay} s entre peticiones: Google lo
                  ignora, pero otros rastreadores lo respetan y irán más lentos.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
