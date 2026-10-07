import { useMemo, useState, type ReactNode } from "react";
import { Line, LineChart, ReferenceLine } from "recharts";
import { Check } from "lucide-react";
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
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/client/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { decimal, integer, percent } from "@/custom/radar/format";
import type { DailyPoint } from "@/custom/radar/radarAnalysis";
import { useTrendLines, withTrend } from "@/custom/radar/client/TrendLines";

const shortDate = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const chartConfig = {
  value: { label: "Este periodo", color: "var(--primary)" },
  prev: { label: "Periodo anterior", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

// Distinct from the red line and the grey one of the previous period.
const MEAN_COLOR = "var(--warning)";
const TREND_COLOR = "var(--info)";

type Metric = "clicks" | "impressions" | "ctr" | "position";

const METRICS: {
  value: Metric;
  tab: string;
  format: (value: number) => string;
  /** A lower number is better (position): the axis is drawn upside down. */
  reversed?: boolean;
}[] = [
  { value: "clicks", tab: "Clics", format: (v) => integer.format(v) },
  {
    value: "impressions",
    tab: "Impresiones",
    format: (v) => integer.format(v),
  },
  { value: "ctr", tab: "CTR", format: (v) => percent.format(v) },
  {
    value: "position",
    tab: "Pos. media",
    format: (v) => decimal.format(v),
    reversed: true,
  },
];

function valueOf(point: DailyPoint, metric: Metric): number {
  if (metric === "ctr") {
    return point.impressions > 0 ? point.clicks / point.impressions : 0;
  }
  return point[metric];
}

function prevOf(point: DailyPoint, metric: Metric): number | null {
  switch (metric) {
    case "clicks":
      return point.prevClicks;
    case "impressions":
      return point.prevImpressions;
    case "ctr":
      return point.prevImpressions && point.prevClicks !== null
        ? point.prevClicks / point.prevImpressions
        : null;
    case "position":
      return point.prevPosition;
  }
}

/** Under this change the trend counts as flat. */
const FLAT_BELOW = 0.05;

/** What the trend line does, in words: the exact change depends on the days
 *  the period starts and ends on, so the figure stays in the tooltip. */
function trendWord(
  change: number | null,
  reversed: boolean | undefined,
): { text: string; arrow: string } | undefined {
  if (change === null) return undefined;
  if (Math.abs(change) < FLAT_BELOW) return { text: "Estable", arrow: "→" };
  const up = change > 0;
  // A lower position is better: going down is improving.
  if (reversed) {
    return up
      ? { text: "Empeora", arrow: "↑" }
      : { text: "Mejora", arrow: "↓" };
  }
  return up ? { text: "Sube", arrow: "↑" } : { text: "Baja", arrow: "↓" };
}

/** The daily chart shared by the Radar and Discover: clicks, impressions, CTR
 *  or average position against the previous period, with an optional average
 *  and trend line. */
export function DailyChart({
  daily,
  note,
}: {
  daily: DailyPoint[];
  note?: ReactNode;
}) {
  const [metric, setMetric] = useState<Metric>("clicks");
  const lines = useTrendLines();
  const config = METRICS.find((item) => item.value === metric) ?? METRICS[0];

  const { data, mean, trendChange } = useMemo(
    () =>
      withTrend(
        daily.map((point) => ({
          date: point.date,
          value: valueOf(point, metric),
          prev: prevOf(point, metric),
        })),
        "value",
      ),
    [daily, metric],
  );

  const word = trendWord(trendChange, config.reversed);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>Evolución diaria</CardTitle>
          {note ? (
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          ) : null}
        </div>
        <Tabs
          value={metric}
          onValueChange={(value) => setMetric(value as Metric)}
        >
          <TabsList>
            {METRICS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="space-y-3">
        <ChartContainer config={chartConfig} className="h-60 w-full">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <ChartGrid />
            <ChartXAxis
              dataKey="date"
              tickFormatter={(date: string) =>
                shortDate.format(new Date(`${date}T00:00:00Z`))
              }
            />
            <ChartYAxis
              reversed={config.reversed}
              domain={config.reversed ? ["auto", "auto"] : [0, "auto"]}
              tickFormatter={(value: number) => config.format(value)}
              width={metric === "impressions" ? 52 : 44}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label: unknown) =>
                    typeof label === "string"
                      ? shortDate.format(new Date(`${label}T00:00:00Z`))
                      : ""
                  }
                  valueFormatter={(value) => config.format(Number(value))}
                />
              }
            />
            <Line
              dataKey="prev"
              stroke="var(--color-prev)"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
            <Line
              dataKey="value"
              stroke="var(--color-value)"
              strokeWidth={2}
              dot={false}
            />
            {lines.showMean && mean !== null ? (
              <ReferenceLine
                y={mean}
                stroke={MEAN_COLOR}
                strokeDasharray="7 5"
                strokeWidth={2.5}
                ifOverflow="extendDomain"
              />
            ) : null}
            {lines.showTrend ? (
              <Line
                dataKey="trend"
                stroke={TREND_COLOR}
                strokeWidth={3}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
                legendType="none"
                tooltipType="none"
              />
            ) : null}
          </LineChart>
        </ChartContainer>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            Líneas de ayuda:
          </span>
          <LineSwitch
            on={lines.showMean}
            onClick={lines.toggleMean}
            color={MEAN_COLOR}
            dashed
            label="Media"
            value={mean !== null ? config.format(mean) : undefined}
          />
          <LineSwitch
            on={lines.showTrend}
            onClick={lines.toggleTrend}
            color={TREND_COLOR}
            label="Tendencia"
            value={word ? `${word.arrow} ${word.text}` : undefined}
            hint={
              trendChange !== null
                ? `La recta ajustada a los días cambia un ${trendChange > 0 ? "+" : ""}${percent.format(trendChange)} entre el principio y el final del periodo. Es una referencia, no una cifra exacta.`
                : undefined
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

/** A switch for one reference line: its own colour sample, name and, when on,
 *  its figure. Deliberately unlike the metric tabs above the chart. */
function LineSwitch({
  on,
  onClick,
  color,
  dashed,
  label,
  value,
  hint,
}: {
  on: boolean;
  onClick: () => void;
  color: string;
  dashed?: boolean;
  label: string;
  value?: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      title={hint}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        on
          ? "border-foreground/30 bg-card shadow-xs"
          : "border-dashed border-border text-muted-foreground hover:bg-muted/50"
      }`}
    >
      <svg width="22" height="8" aria-hidden>
        <line
          x1="1"
          y1="4"
          x2="21"
          y2="4"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={dashed ? "5 4" : undefined}
          opacity={on ? 1 : 0.45}
        />
      </svg>
      {label}
      {on && value ? (
        <strong className="tabular-nums text-foreground">{value}</strong>
      ) : null}
      {on ? <Check className="size-3 text-foreground" aria-hidden /> : null}
    </button>
  );
}
