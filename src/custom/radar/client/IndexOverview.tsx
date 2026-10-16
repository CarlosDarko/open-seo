import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { PageLink } from "@/custom/radar/client/RadarLinks";
import {
  type CrawlTab,
  type Finding,
  type InspectionStats,
} from "@/custom/radar/crawlStats";
import { integer } from "@/custom/radar/format";

const TONE: Record<
  Finding["tone"],
  { icon: LucideIcon; circle: string; label: string }
> = {
  bad: {
    icon: CircleAlert,
    circle: "bg-destructive/15 text-destructive",
    label: "Urgente",
  },
  warn: {
    icon: TriangleAlert,
    circle: "bg-warning/15 text-warning",
    label: "Revisar",
  },
  todo: {
    icon: CircleDashed,
    circle: "bg-primary/10 text-primary",
    label: "Por comprobar",
  },
  good: {
    icon: CircleCheck,
    circle: "bg-success/15 text-success",
    label: "Bien",
  },
};

/** What to look at first, worst first, each with a button to the tab that
 *  shows more. */
export function FindingsCard({
  findings,
  onGo,
}: {
  findings: Finding[];
  onGo: (tab: CrawlTab) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Qué mirar primero</CardTitle>
        <p className="text-xs text-muted-foreground">
          Ordenado de lo más grave a lo más tranquilo. Lo que aún no has
          comprobado sale como «por comprobar».
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {findings.map((finding) => {
            const tone = TONE[finding.tone];
            const Icon = tone.icon;
            return (
              <li
                key={finding.id}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-full ${tone.circle}`}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug font-semibold">
                    {finding.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {finding.detail}
                  </p>
                </div>
                <span
                  className={`hidden rounded-full px-2 py-0.5 text-[11px] font-bold sm:inline ${tone.circle}`}
                >
                  {tone.label}
                </span>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => onGo(finding.go)}
                >
                  Ver
                  <ArrowRight className="size-3" aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

const BUCKETS = [
  { key: "recent", label: "Hace 7 días o menos", color: "bg-success" },
  { key: "medium", label: "Entre 8 y 30 días", color: "bg-warning" },
  { key: "old", label: "Hace más de 30 días", color: "bg-destructive" },
  {
    key: "unknown",
    label: "Sin fecha (nunca)",
    color: "bg-muted-foreground/50",
  },
] as const;

/**
 * What Google's answers say as a whole: how many pages are indexed, how many
 * have a different canonical or are blocked, and when Google last crawled
 * them (how fresh its view of the site is).
 */
export function InspectionSummary({ stats }: { stats: InspectionStats }) {
  if (stats.total === 0) return null;
  const tiles = [
    {
      label: "Indexadas",
      value: stats.indexed,
      tone: "text-success bg-success/10",
    },
    {
      label: "No indexadas",
      value: stats.notIndexed,
      tone:
        stats.notIndexed > 0
          ? "text-destructive bg-destructive/10"
          : "text-muted-foreground bg-muted",
    },
    {
      label: "Otra canónica",
      value: stats.canonicalMismatches,
      tone:
        stats.canonicalMismatches > 0
          ? "text-warning bg-warning/10"
          : "text-muted-foreground bg-muted",
    },
    {
      label: "Bloqueadas por robots.txt",
      value: stats.blockedByRobots,
      tone:
        stats.blockedByRobots > 0
          ? "text-destructive bg-destructive/10"
          : "text-muted-foreground bg-muted",
    },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <CardContent className="space-y-1.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {tile.label}
              </p>
              <p>
                <span
                  className={`inline-block rounded-full px-3 py-1 text-xl font-bold tabular-nums ${tile.tone}`}
                >
                  {integer.format(tile.value)}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  de {integer.format(stats.total)}
                </span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cuándo las rastreó Google por última vez</CardTitle>
          <p className="text-xs text-muted-foreground">
            Cuanto más reciente, más al día está la visión que Google tiene de
            esas páginas. Google vuelve antes a lo que cambia y a lo que más
            tráfico trae.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {BUCKETS.map((bucket) => {
              const count = stats.freshness[bucket.key];
              return count > 0 ? (
                <div
                  key={bucket.key}
                  className={bucket.color}
                  style={{ width: `${(count / stats.total) * 100}%` }}
                  title={`${bucket.label}: ${count}`}
                />
              ) : null;
            })}
          </div>
          <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {BUCKETS.map((bucket) => (
              <li key={bucket.key} className="flex items-center gap-2">
                <span
                  className={`size-2.5 shrink-0 rounded-full ${bucket.color}`}
                  aria-hidden
                />
                <span className="text-muted-foreground">{bucket.label}</span>
                <strong className="ml-auto tabular-nums">
                  {stats.freshness[bucket.key]}
                </strong>
              </li>
            ))}
          </ul>
          {stats.stale.length > 0 ? (
            <div className="space-y-1.5 border-t border-border pt-3">
              <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                Sin rastrear en más de 30 días
              </p>
              <ul className="space-y-1">
                {stats.stale.slice(0, 5).map((row) => (
                  <li
                    key={row.url}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      <PageLink url={row.url} />
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-destructive tabular-nums">
                      {row.days === null
                        ? "sin fecha"
                        : `hace ${integer.format(row.days)} días`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Para empujar a Google: actualiza el contenido, enlázala desde
                páginas que sí rastrea y, si es importante, pide su indexación
                en Search Console.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
