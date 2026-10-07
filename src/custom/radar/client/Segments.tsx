import { useState } from "react";
import { Info } from "lucide-react";
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
  signed,
} from "@/custom/radar/format";
import type { Segment } from "@/custom/radar/radarSegments";

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
export function segmentInsight(segments: Segment[]): string | null {
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
  const topChange = relativeChange(top.clicks, top.prevClicks);
  let text = `«${top.label}» aporta el ${share} de los clics${
    topChange === null
      ? ""
      : ` (${topChange > 0 ? "+" : ""}${percent.format(topChange)} frente al periodo anterior)`
  }.`;
  if (mover && Math.abs(mover.clicks - mover.prevClicks) > 0) {
    const delta = mover.clicks - mover.prevClicks;
    text += ` El mayor movimiento fuera de ahí es «${mover.label}»: ${signed(delta)} clics.`;
  }
  return text;
}

/** Charts and tables of the traffic split by page type, search intent,
 *  device or brand. */
export function Segments({ sets }: { sets: SegmentSet[] }) {
  const [key, setKey] = useState(sets[0]?.key ?? "");
  const active = sets.find((set) => set.key === key) ?? sets[0];
  if (!active) return null;
  const rows = active.segments.slice(0, 8);
  const insight = segmentInsight(active.segments);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Tráfico por tipología</CardTitle>
          <Tabs value={active.key} onValueChange={setKey}>
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
                  <strong className="text-foreground">{merge.label}</strong> ={" "}
                  {merge.folders.join(", ")}
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
                <Bar
                  dataKey="prevClicks"
                  fill="var(--color-prevClicks)"
                  radius={[0, 2, 2, 0]}
                  maxBarSize={16}
                />
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
                  <TableHead className="text-right">Cambio</TableHead>
                  <TableHead className="text-right">Impresiones</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">Posición</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((segment) => {
                  const delta = segment.clicks - segment.prevClicks;
                  return (
                    <TableRow key={segment.label}>
                      <TableCell className="max-w-56 truncate">
                        {segment.label}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {integer.format(segment.clicks)}
                      </TableCell>
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
