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
  SortableHead,
  useSort,
  type SortValue,
} from "@/custom/radar/client/sortable";
import {
  decimal,
  integer,
  percent,
  position,
  signed,
} from "@/custom/radar/format";

type DetailTab = "opportunities" | "cannibal" | "queries";

export function RadarTables({ report }: { report: RadarReport }) {
  const comparable = report.period.comparable;
  const [chosen, setTab] = useState<DetailTab>("opportunities");
  // Without a period to compare with there are no new or lost queries.
  const tab: DetailTab =
    !comparable && chosen === "queries" ? "opportunities" : chosen;
  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(value) => setTab(value as DetailTab)}>
        <TabsList>
          <TabsTrigger value="opportunities">Oportunidades</TabsTrigger>
          <TabsTrigger value="cannibal">Canibalización</TabsTrigger>
          {comparable ? (
            <TabsTrigger value="queries">
              Consultas nuevas y perdidas
            </TabsTrigger>
          ) : null}
        </TabsList>
      </Tabs>

      {tab === "opportunities" ? (
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
              sort: [
                row.query,
                row.page,
                row.position,
                row.impressions,
                row.potentialClicks,
              ],
              cells: [
                <GoogleLink
                  key="q"
                  query={row.query}
                  label={row.query}
                  subtle
                />,
                <PageLink key="p" url={row.page} />,
                position(row.position),
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
              sort: [
                row.query,
                row.page ?? null,
                row.position,
                row.ctr,
                row.potentialClicks,
              ],
              cells: [
                <GoogleLink
                  key="q"
                  query={row.query}
                  label={row.query}
                  subtle
                />,
                row.page ? <PageLink key="p" url={row.page} /> : "—",
                position(row.position),
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
            sort: [row.query, row.pages.length, row.totalImpressions],
            cells: [
              <GoogleLink key="q" query={row.query} label={row.query} subtle />,
              <ul key="pages" className="space-y-1 text-left">
                {row.pages.map((page, index) => (
                  <li key={page.page} className="text-xs">
                    <PageLink url={page.page} />{" "}
                    <span className="text-muted-foreground">
                      {index === 0 ? "principal · " : ""}pos.{" "}
                      {position(page.position)} · {integer.format(page.clicks)}{" "}
                      clics · {integer.format(page.impressions)} impr.
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
              sort: [row.key, row.position, row.impressions],
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
              sort: [row.key, row.prevPosition, row.prevClicks],
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
  /** `sort`: what each column is sorted by (omit it for no sorting). */
  rows: { key: string; cells: ReactNode[]; sort?: SortValue[] }[];
}) {
  const sort = useSort(rows, (row) => row.sort ?? []);
  const sortable = rows.some((row) => row.sort);
  return (
    <TableCard>
      <div className="border-b border-border p-4">
        <h3 className="font-medium">{title}</h3>
        {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {head.map((label, index) =>
              sortable ? (
                <SortableHead
                  key={label}
                  col={index}
                  state={sort.state}
                  onToggle={sort.toggle}
                  text={index === 0}
                  align={index > 0 ? "right" : "left"}
                >
                  {label}
                </SortableHead>
              ) : (
                <TableHead
                  key={label}
                  className={index > 0 ? "text-right" : ""}
                >
                  {label}
                </TableHead>
              ),
            )}
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
          {sort.rows.map((row) => (
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
