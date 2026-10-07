import { Fragment, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Bar, BarChart } from "recharts";
import {
  ChartGrid,
  ChartXAxis,
  ChartYAxis,
} from "@/client/components/ChartAxes";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/client/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import {
  decimal,
  integer,
  percent,
  relativeChange,
  pathOf,
  signed,
} from "@/custom/radar/format";
import type { Segment, SegmentMember } from "@/custom/radar/radarSegments";

const chartConfig = {
  prevClicks: { label: "Periodo anterior", color: "var(--muted-foreground)" },
  clicks: { label: "Este periodo", color: "var(--primary)" },
} satisfies ChartConfig;

export type SegmentSet = {
  key: string;
  tab: string;
  title: string;
  help: string;
  segments: Segment[];
  /** Folders merged because they are the same section in other languages. */
  merges?: { label: string; folders: string[] }[];
};

/** A sentence that says what the segments show: who brings the clicks and
 *  what moved most. */
export function segmentInsight(
  segments: Segment[],
  comparable = true,
): string | null {
  const total = segments.reduce((sum, segment) => sum + segment.clicks, 0);
  if (segments.length === 0 || total === 0) return null;
  const top = segments[0];
  const share = percent.format(top.clicks / total);
  const mover = [...segments]
    .filter((segment) => segment.label !== top.label)
    .sort(
      (a, b) =>
        Math.abs(b.clicks - b.prevClicks) - Math.abs(a.clicks - a.prevClicks),
    )[0];
  const topChange = comparable
    ? relativeChange(top.clicks, top.prevClicks)
    : null;
  let text = `«${top.label}» aporta el ${share} de los clics${
    topChange === null
      ? ""
      : ` (${topChange > 0 ? "+" : ""}${percent.format(topChange)} frente al periodo anterior)`
  }.`;
  if (comparable && mover && Math.abs(mover.clicks - mover.prevClicks) > 0) {
    const delta = mover.clicks - mover.prevClicks;
    text += ` El mayor movimiento fuera de ahí es «${mover.label}»: ${signed(delta)} clics.`;
  }
  return text;
}

/** Charts and tables of the traffic split by page type, search intent,
 *  device or brand. */
export function Segments({
  sets,
  comparable = true,
}: {
  sets: SegmentSet[];
  comparable?: boolean;
}) {
  const [key, setKey] = useState(sets[0]?.key ?? "");
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const active = sets.find((set) => set.key === key) ?? sets[0];
  if (!active) return null;
  const rows = active.segments.slice(0, 8);
  const insight = segmentInsight(active.segments, comparable);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Tráfico por tipología</CardTitle>
          <Tabs
            value={active.key}
            onValueChange={(value) => {
              setKey(value);
              setOpenLabel(null);
            }}
          >
            <TabsList>
              {sets.map((set) => (
                <TabsTrigger key={set.key} value={set.key}>
                  {set.tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <p className="text-xs text-muted-foreground">{active.help}</p>
        {active.merges && active.merges.length > 0 ? (
          <p className="flex gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Unidas por ser la misma sección en otro idioma, para no repartir
              su tráfico en varias barras:{" "}
              {active.merges.map((merge, index) => (
                <span key={merge.label}>
                  {index > 0 ? "; " : ""}
                  <strong className="text-foreground">
                    {merge.label}
                  </strong> = {merge.folders.join(", ")}
                </span>
              ))}
              . Se reconocen por palabras equivalentes conocidas.
            </span>
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {insight ? <p className="text-sm">{insight}</p> : null}
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay datos suficientes para esta división.
          </p>
        ) : (
          <>
            <ChartContainer
              config={chartConfig}
              className="w-full"
              style={{ height: Math.max(rows.length * 52 + 40, 140) }}
            >
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
              >
                <ChartGrid horizontal={false} vertical />
                <ChartXAxis
                  type="number"
                  tickFormatter={(value: number) => integer.format(value)}
                />
                <ChartYAxis
                  type="category"
                  dataKey="label"
                  width={150}
                  interval={0}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      valueFormatter={(value) =>
                        `${integer.format(Number(value))} clics`
                      }
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                {comparable ? (
                  <Bar
                    dataKey="prevClicks"
                    fill="var(--color-prevClicks)"
                    radius={[0, 2, 2, 0]}
                    maxBarSize={16}
                  />
                ) : null}
                <Bar
                  dataKey="clicks"
                  fill="var(--color-clicks)"
                  radius={[0, 2, 2, 0]}
                  maxBarSize={16}
                />
              </BarChart>
            </ChartContainer>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{active.title}</TableHead>
                  <TableHead className="text-right">Clics</TableHead>
                  {comparable ? (
                    <TableHead className="text-right">Cambio</TableHead>
                  ) : null}
                  <TableHead className="text-right">Impresiones</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Posición</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((segment) => {
                  const delta = segment.clicks - segment.prevClicks;
                  const isOpen = openLabel === segment.label;
                  return (
                    <Fragment key={segment.label}>
                      <TableRow
                        className={
                          segment.members.length > 0 ? "cursor-pointer" : ""
                        }
                        onClick={() =>
                          segment.members.length > 0
                            ? setOpenLabel(isOpen ? null : segment.label)
                            : undefined
                        }
                      >
                        <TableCell className="max-w-56 truncate">
                          <span className="inline-flex items-center gap-1.5">
                            {segment.members.length > 0 ? (
                              <ChevronDown
                                className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`}
                                aria-hidden
                              />
                            ) : null}
                            {segment.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {integer.format(segment.clicks)}
                        </TableCell>
                        {comparable ? (
                          <TableCell
                            className={`text-right whitespace-nowrap tabular-nums ${
                              delta === 0
                                ? "text-muted-foreground"
                                : delta > 0
                                  ? "text-success"
                                  : "text-destructive"
                            }`}
                          >
                            {signed(delta)}
                          </TableCell>
                        ) : null}
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {integer.format(segment.impressions)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {percent.format(segment.ctr)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {segment.position === null
                            ? "—"
                            : decimal.format(segment.position)}
                        </TableCell>
                      </TableRow>
                      {isOpen ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell
                            colSpan={comparable ? 6 : 5}
                            className="bg-muted/30 p-0"
                          >
                            <MemberTable
                              members={segment.members}
                              total={segment.items}
                              comparable={comparable}
                            />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** The pages (or queries) a segment holds, with their own figures. */
function MemberTable({
  members,
  total,
  comparable,
}: {
  members: SegmentMember[];
  total: number;
  comparable: boolean;
}) {
  return (
    <div className="space-y-1 px-3 py-2">
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>
              <th className="py-1 pr-2 text-left font-medium">
                Página o consulta
              </th>
              <th className="px-2 py-1 text-right font-medium">Clics</th>
              {comparable ? (
                <th className="px-2 py-1 text-right font-medium">Cambio</th>
              ) : null}
              <th className="px-2 py-1 text-right font-medium">Impresiones</th>
              <th className="px-2 py-1 text-right font-medium">CTR</th>
              <th className="py-1 pl-2 text-right font-medium">Posición</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const delta = member.clicks - member.prevClicks;
              const isUrl = /^https?:\/\//.test(member.key);
              return (
                <tr key={member.key} className="border-t border-border">
                  <td
                    className="max-w-64 truncate py-1 pr-2"
                    title={member.key}
                  >
                    {isUrl ? (
                      <a
                        href={member.key}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline"
                      >
                        {pathOf(member.key)}
                      </a>
                    ) : (
                      <span className="font-medium">{member.key}</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {integer.format(member.clicks)}
                  </td>
                  {comparable ? (
                    <td
                      className={`px-2 py-1 text-right tabular-nums ${
                        delta === 0
                          ? "text-muted-foreground"
                          : delta > 0
                            ? "text-success"
                            : "text-destructive"
                      }`}
                    >
                      {signed(delta)}
                    </td>
                  ) : null}
                  <td className="px-2 py-1 text-right tabular-nums">
                    {integer.format(member.impressions)}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {percent.format(member.ctr)}
                  </td>
                  <td className="py-1 pl-2 text-right tabular-nums">
                    {member.position === null
                      ? "—"
                      : decimal.format(member.position)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {total > members.length ? (
        <p className="text-[11px] text-muted-foreground">
          Mostrando las {integer.format(members.length)} con más clics de{" "}
          {integer.format(total)}
        </p>
      ) : null}
    </div>
  );
}
