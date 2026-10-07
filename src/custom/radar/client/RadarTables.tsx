import { useState, type ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import type { RadarReport } from "@/custom/radar/actions";
import { GoogleLink, PageLink } from "@/custom/radar/client/RadarLinks";
import {
  decimal,
  integer,
  percent,
  position,
  signed,
} from "@/custom/radar/format";
import type {
  ChangeCause,
  ChangeRow,
  PageChange,
} from "@/custom/radar/radarAnalysis";

type DetailTab = "changes" | "opportunities" | "cannibal" | "queries";

const CAUSE_LABEL: Record<ChangeCause, string> = {
  posicion: "Ha perdido posición",
  demanda: "Se busca menos",
  ctr: "Menos clics por impresión",
  mixto: "Varias causas",
  nueva: "Página nueva",
  perdida: "Sin tráfico ahora",
};

export function RadarTables({ report }: { report: RadarReport }) {
  const comparable = report.period.comparable;
  const [chosen, setTab] = useState<DetailTab>("changes");
  // Without a period to compare with there are no changes to list.
  const tab: DetailTab =
    !comparable && (chosen === "changes" || chosen === "queries")
      ? "opportunities"
      : chosen;
  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(value) => setTab(value as DetailTab)}>
        <TabsList>
          {comparable ? (
            <TabsTrigger value="changes">Ganadores y perdedores</TabsTrigger>
          ) : null}
          <TabsTrigger value="opportunities">Oportunidades</TabsTrigger>
          <TabsTrigger value="cannibal">Canibalización</TabsTrigger>
          {comparable ? (
            <TabsTrigger value="queries">
              Consultas nuevas y perdidas
            </TabsTrigger>
          ) : null}
        </TabsList>
      </Tabs>

      {tab === "changes" ? (
        <div className="space-y-4">
          <PageChangeTable
            title="Páginas que más pierden"
            rows={report.pageChanges.losers}
          />
          <PageChangeTable
            title="Páginas que más ganan"
            rows={report.pageChanges.winners}
          />
          <QueryChangeTable
            title="Consultas que más pierden"
            rows={report.queryChanges.losers}
          />
          <QueryChangeTable
            title="Consultas que más ganan"
            rows={report.queryChanges.winners}
          />
        </div>
      ) : tab === "opportunities" ? (
        <div className="space-y-4">
          <SimpleTable
            title="Casi en el top 3"
            help="Consultas entre las posiciones 4 y 20. «Clics extra» es lo que ganarías si la página llegara a la posición 3 con el CTR habitual de tu sitio."
            empty="No hay consultas con potencial claro en este periodo."
            head={[
              "Consulta",
              "Página",
              "Posición",
              "Impresiones",
              "Clics extra",
            ]}
            rows={report.nearTop.map((row) => ({
              key: `${row.query}|${row.page}`,
              cells: [
                <GoogleLink
                  key="q"
                  query={row.query}
                  label={row.query}
                  subtle
                />,
                <PageLink key="p" url={row.page} />,
                decimal.format(row.position),
                integer.format(row.impressions),
                <strong key="g">+{integer.format(row.potentialClicks)}</strong>,
              ],
            }))}
          />
          <SimpleTable
            title="CTR bajo para su posición"
            help="Consultas de primera página con menos de la mitad de los clics que tu sitio suele conseguir en esa posición."
            empty="No hay consultas con CTR claramente bajo en este periodo."
            head={[
              "Consulta",
              "Página",
              "Posición",
              "CTR (habitual)",
              "Clics extra",
            ]}
            rows={report.ctrOpportunities.map((row) => ({
              key: row.query,
              cells: [
                <GoogleLink
                  key="q"
                  query={row.query}
                  label={row.query}
                  subtle
                />,
                row.page ? <PageLink key="p" url={row.page} /> : "—",
                decimal.format(row.position),
                `${percent.format(row.ctr)} (${percent.format(row.expectedCtr)})`,
                <strong key="g">+{integer.format(row.potentialClicks)}</strong>,
              ],
            }))}
          />
        </div>
      ) : tab === "cannibal" ? (
        <SimpleTable
          title="Páginas que compiten por la misma consulta"
          help="La primera página de cada lista es la propuesta como principal (más clics)."
          empty="No se detecta canibalización en este periodo."
          head={["Consulta", "Páginas implicadas", "Impresiones"]}
          rows={report.cannibalized.map((row) => ({
            key: row.query,
            cells: [
              <GoogleLink key="q" query={row.query} label={row.query} subtle />,
              <ul key="pages" className="space-y-1 text-left">
                {row.pages.map((page, index) => (
                  <li key={page.page} className="text-xs">
                    <PageLink url={page.page} />{" "}
                    <span className="text-muted-foreground">
                      {index === 0 ? "principal · " : ""}pos.{" "}
                      {decimal.format(page.position)} ·{" "}
                      {integer.format(page.clicks)} clics ·{" "}
                      {integer.format(page.impressions)} impr.
                    </span>
                  </li>
                ))}
              </ul>,
              integer.format(row.totalImpressions),
            ],
          }))}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <SimpleTable
            title="Consultas nuevas"
            help="Aparecen este periodo y no el anterior: temas que Google empieza a asociarte."
            empty="No hay consultas nuevas relevantes."
            head={["Consulta", "Posición", "Impresiones"]}
            rows={report.newQueries.map((row) => ({
              key: row.key,
              cells: [
                <GoogleLink key="q" query={row.key} label={row.key} subtle />,
                position(row.position),
                integer.format(row.impressions),
              ],
            }))}
          />
          <SimpleTable
            title="Consultas perdidas"
            help="Tenían visibilidad el periodo anterior y este ya no."
            empty="No hay consultas perdidas relevantes."
            head={["Consulta", "Posición antes", "Clics antes"]}
            rows={report.lostQueries.map((row) => ({
              key: row.key,
              cells: [
                <GoogleLink key="q" query={row.key} label={row.key} subtle />,
                position(row.prevPosition),
                integer.format(row.prevClicks),
              ],
            }))}
          />
        </div>
      )}
    </div>
  );
}

function PageChangeTable({
  title,
  rows,
}: {
  title: string;
  rows: PageChange[];
}) {
  return (
    <SimpleTable
      title={title}
      empty="Sin cambios relevantes."
      head={["Página", "Posición", "Clics", "Cambio"]}
      rows={rows.map((row) => ({
        key: row.key,
        cells: [
          <div key="p" className="space-y-0.5 text-left">
            <PageLink url={row.key} />
            <p className="text-xs text-muted-foreground">
              {CAUSE_LABEL[row.cause]}
              {row.topQueries[0]
                ? ` · sobre todo «${row.topQueries[0].query}»`
                : ""}
            </p>
          </div>,
          `${position(row.prevPosition)} → ${position(row.position)}`,
          `${integer.format(row.clicks)} (${integer.format(row.prevClicks)})`,
          <span
            key="d"
            className={
              row.clicksDelta > 0 ? "text-success" : "text-destructive"
            }
          >
            {signed(row.clicksDelta)}
          </span>,
        ],
      }))}
    />
  );
}

function QueryChangeTable({
  title,
  rows,
}: {
  title: string;
  rows: ChangeRow[];
}) {
  return (
    <SimpleTable
      title={title}
      empty="Sin cambios relevantes."
      head={["Consulta", "Posición", "Clics", "Cambio"]}
      rows={rows.map((row) => ({
        key: row.key,
        cells: [
          <div key="q" className="space-y-0.5 text-left">
            <GoogleLink query={row.key} label={row.key} subtle />
            {row.status !== "changed" ? (
              <p className="text-xs text-muted-foreground">
                {row.status === "lost"
                  ? "Ya no aparece en Google este periodo"
                  : "Consulta nueva este periodo"}
              </p>
            ) : null}
          </div>,
          row.status === "lost"
            ? `${position(row.prevPosition)} → sin datos`
            : row.status === "new"
              ? `nueva → ${position(row.position)}`
              : `${position(row.prevPosition)} → ${position(row.position)}`,
          `${integer.format(row.clicks)} (${integer.format(row.prevClicks)})`,
          <span
            key="d"
            className={
              row.clicksDelta > 0 ? "text-success" : "text-destructive"
            }
          >
            {signed(row.clicksDelta)}
          </span>,
        ],
      }))}
    />
  );
}

function SimpleTable({
  title,
  help,
  empty,
  head,
  rows,
}: {
  title: string;
  help?: string;
  empty: string;
  head: string[];
  rows: { key: string; cells: ReactNode[] }[];
}) {
  return (
    <TableCard>
      <div className="border-b border-border p-4">
        <h3 className="font-medium">{title}</h3>
        {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {head.map((label, index) => (
              <TableHead key={label} className={index > 0 ? "text-right" : ""}>
                {label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={head.length}
                className="py-6 text-center text-muted-foreground"
              >
                {empty}
              </TableCell>
            </TableRow>
          ) : null}
          {rows.map((row) => (
            <TableRow key={row.key}>
              {row.cells.map((cell, index) => (
                <TableCell
                  key={index}
                  className={
                    index > 0
                      ? "text-right align-top whitespace-nowrap tabular-nums"
                      : "min-w-64 align-top"
                  }
                >
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}
