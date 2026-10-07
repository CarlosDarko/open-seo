import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/client/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import type { RadarReport } from "@/custom/radar/actions";
import { GoogleLink, PageLink } from "@/custom/radar/client/RadarLinks";
import { SortableHead, useSort } from "@/custom/radar/client/sortable";
import { integer, signed } from "@/custom/radar/format";
import type { ChangeCause } from "@/custom/radar/radarAnalysis";

const CAUSE_LABEL: Record<ChangeCause, string> = {
  posicion: "Ha perdido posición",
  demanda: "Se busca menos",
  ctr: "Menos clics por impresión",
  mixto: "Varias causas",
  nueva: "Página nueva",
  perdida: "Sin tráfico ahora",
};

type Mover = {
  key: string;
  clicks: number;
  prevClicks: number;
  clicksDelta: number;
  position: number | null;
  prevPosition: number | null;
  status: "new" | "lost" | "changed";
  /** A line of context under the name (cause of a page's change). */
  note?: string;
};

// Positions are shown whole: a decimal says nothing here.
const pos = (value: number | null) =>
  value === null ? "-" : integer.format(value);

const TONES = {
  up: {
    chip: "bg-success/15 text-success",
    text: "text-success",
    bar: "bg-success",
  },
  down: {
    chip: "bg-destructive/15 text-destructive",
    text: "text-destructive",
    bar: "bg-destructive",
  },
} as const;

/**
 * The queries and the pages that gain and lose the most clicks against the
 * period before: queries in one row (gaining on the left, losing on the
 * right), pages in the next. Every column sorts.
 */
export function GainLoss({ report }: { report: RadarReport }) {
  const pageNote = (row: RadarReport["pageChanges"]["winners"][number]) =>
    [
      CAUSE_LABEL[row.cause],
      row.topQueries[0] ? `sobre todo «${row.topQueries[0].query}»` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const pages = (rows: RadarReport["pageChanges"]["winners"]): Mover[] =>
    rows.map((row) => ({ ...row, note: pageNote(row) }));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Qué sube y qué baja</h2>
        <p className="text-sm text-muted-foreground">
          Las consultas y las páginas que más clics ganan y pierden frente al
          periodo anterior. Pulsa el título de una columna para ordenar.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MoverCard
          title="Consultas que suben"
          kind="query"
          up
          rows={report.queryChanges.winners}
        />
        <MoverCard
          title="Consultas que bajan"
          kind="query"
          rows={report.queryChanges.losers}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MoverCard
          title="Páginas que suben"
          kind="page"
          up
          rows={pages(report.pageChanges.winners)}
        />
        <MoverCard
          title="Páginas que bajan"
          kind="page"
          rows={pages(report.pageChanges.losers)}
        />
      </div>
    </section>
  );
}

function MoverCard({
  title,
  kind,
  up,
  rows,
}: {
  title: string;
  kind: "query" | "page";
  up?: boolean;
  rows: Mover[];
}) {
  const tone = TONES[up ? "up" : "down"];
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const total = rows.reduce((sum, row) => sum + row.clicksDelta, 0);
  const biggest = Math.max(1, ...rows.map((row) => Math.abs(row.clicksDelta)));
  const sort = useSort(
    rows,
    (row) => [row.key, row.position, row.clicks, row.clicksDelta],
    { col: 3, dir: up ? "desc" : "asc" },
  );

  return (
    <Card className="gap-3 overflow-hidden py-3">
      <header className="flex items-center justify-between gap-2 px-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold tracking-wide uppercase ${tone.chip}`}
        >
          <Icon className="size-3.5" aria-hidden />
          {title}
        </span>
        {rows.length > 0 ? (
          <span className={`text-sm font-bold tabular-nums ${tone.text}`}>
            {signed(total)} clics
          </span>
        ) : null}
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Sin cambios relevantes.
        </p>
      ) : (
        <div className="px-2">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <SortableHead
                  col={0}
                  state={sort.state}
                  onToggle={sort.toggle}
                  text
                  align="left"
                >
                  {kind === "query" ? "Consulta" : "Página"}
                </SortableHead>
                <SortableHead col={1} state={sort.state} onToggle={sort.toggle}>
                  Posición
                </SortableHead>
                <SortableHead col={2} state={sort.state} onToggle={sort.toggle}>
                  Clics
                </SortableHead>
                <SortableHead col={3} state={sort.state} onToggle={sort.toggle}>
                  Cambio
                </SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sort.rows.map((row) => (
                <TableRow key={row.key} className="hover:bg-card/60">
                  <TableCell className="max-w-72 min-w-40 align-top whitespace-normal">
                    {kind === "query" ? (
                      <GoogleLink query={row.key} label={row.key} subtle />
                    ) : (
                      <PageLink url={row.key} />
                    )}
                    {row.status !== "changed" || row.note ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.note ??
                          (row.status === "lost"
                            ? "Ya no aparece este periodo"
                            : "Nueva este periodo")}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {row.status === "new" ? "nueva" : pos(row.prevPosition)}
                    <span className="text-muted-foreground"> → </span>
                    <strong>{pos(row.position)}</strong>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {integer.format(row.clicks)}
                    <span className="block text-[11px] text-muted-foreground">
                      antes {integer.format(row.prevClicks)}
                    </span>
                  </TableCell>
                  <TableCell className="w-28 text-right whitespace-nowrap tabular-nums">
                    <span className={`font-bold ${tone.text}`}>
                      {signed(row.clicksDelta)}
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span
                        className={`block h-full rounded-full ${tone.bar}`}
                        style={{
                          width: `${Math.max(6, (Math.abs(row.clicksDelta) / biggest) * 100)}%`,
                        }}
                      />
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
