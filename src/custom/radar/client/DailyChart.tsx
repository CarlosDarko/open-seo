import { useMemo, useState, type ReactNode } from "react";
import { Line, LineChart, ReferenceArea, ReferenceLine } from "recharts";
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
import { useGoogleUpdates } from "@/custom/radar/client/useGoogleUpdates";
import { useTrendLines, withTrend } from "@/custom/radar/client/TrendLines";
import {
  KIND_COLOR,
  KIND_SHORT,
  updatesBetween,
  type GoogleUpdate,
} from "@/custom/radar/googleUpdates";
import { OngoingTag, UpdateBadge } from "@/custom/radar/client/UpdateBadge";

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
  comparable = true,
}: {
  daily: DailyPoint[];
  note?: ReactNode;
  /** False when there is no period to compare with: only this period is drawn. */
  comparable?: boolean;
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
  const googleUpdates = useGoogleUpdates();
  const first = data[0]?.date;
  const last = data[data.length - 1]?.date;
  // The updates that overlap the days of the chart, each clamped to days the
  // chart has (its x axis is made of those dates).
  const marks = useMemo(() => {
    if (!first || !last) return [];
    const dates = data.map((point) => point.date);
    return updatesBetween(googleUpdates.data ?? [], first, last).map(
      (update) => ({
        update,
        from: dates.find((date) => date >= update.begin) ?? first,
        // Near the right edge the label is drawn to the left of its line.
        late:
          dates.indexOf(dates.find((date) => date >= update.begin) ?? first) >
          dates.length * 0.85,
        to:
          [...dates].reverse().find((date) => date <= (update.end ?? last)) ??
          last,
      }),
    );
  }, [googleUpdates.data, data, first, last]);

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
            {comparable ? (
              <Line
                dataKey="prev"
                stroke="var(--color-prev)"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            ) : null}
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
            {lines.showUpdates
              ? marks.map(({ update, from, to }) => (
                  <ReferenceArea
                    key={`area-${update.id}`}
                    x1={from}
                    x2={to}
                    fill={KIND_COLOR[update.kind]}
                    fillOpacity={0.13}
                    stroke="none"
                    ifOverflow="hidden"
                  />
                ))
              : null}
            {lines.showUpdates
              ? marks.map(({ update, from, late }) => (
                  <ReferenceLine
                    key={`line-${update.id}`}
                    x={from}
                    stroke={KIND_COLOR[update.kind]}
                    strokeWidth={2}
                    label={{
                      value: KIND_SHORT[update.kind],
                      position: late ? "insideTopRight" : "insideTopLeft",
                      fontSize: 10,
                      fontWeight: 700,
                      fill: KIND_COLOR[update.kind],
                    }}
                  />
                ))
              : null}
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
          <LineSwitch
            on={lines.showUpdates}
            onClick={lines.toggleUpdates}
            color="var(--foreground)"
            marker
            label="Google Updates"
            value={marks.length > 0 ? String(marks.length) : undefined}
            hint="Marca en el gráfico los días en que Google lanzó actualizaciones de su algoritmo (fuente: status.search.google.com, al día)."
          />
        </div>
        {lines.showUpdates && marks.length > 0 ? (
          <UpdatesList updates={marks.map((mark) => mark.update)} />
        ) : null}
      </CardContent>
    </Card>
  );
}

const rangeFormat = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** The updates drawn on the chart: kind, name, dates and a link to Google. */
function UpdatesList({ updates }: { updates: GoogleUpdate[] }) {
  const day = (iso: string) => rangeFormat.format(new Date(`${iso}T00:00:00Z`));
  return (
    <ul className="space-y-1.5 text-xs text-muted-foreground">
      {updates.map((update) => (
        <li
          key={update.id}
          className="grid grid-cols-[4rem_1fr] items-baseline gap-x-2 sm:grid-cols-[4rem_1fr_auto]"
        >
          <UpdateBadge kind={update.kind} />
          <a
            href={update.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground hover:underline"
          >
            {update.label}
          </a>
          <span className="col-start-2 sm:col-start-3">
            {day(update.begin)}
            {" – "}
            {update.end ? day(update.end) : <OngoingTag />}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A switch for one reference line: its own colour sample, name and, when on,
 *  its figure. Deliberately unlike the metric tabs above the chart. */
function LineSwitch({
  on,
  onClick,
  color,
  dashed,
  marker,
  label,
  value,
  hint,
}: {
  on: boolean;
  onClick: () => void;
  color: string;
  dashed?: boolean;
  /** Draw a vertical mark instead of a line sample. */
  marker?: boolean;
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
          ? "border-foreground/40 bg-foreground/5 shadow-xs"
          : "border-dashed border-border text-muted-foreground hover:bg-muted/50"
      }`}
    >
      <svg width="22" height="10" aria-hidden>
        {marker ? (
          <>
            <rect
              x="6"
              y="0"
              width="10"
              height="10"
              fill={color}
              opacity={on ? 0.15 : 0.08}
            />
            <line
              x1="6"
              y1="0"
              x2="6"
              y2="10"
              stroke={color}
              strokeWidth="2"
              opacity={on ? 1 : 0.45}
            />
          </>
        ) : (
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
        )}
      </svg>
      {label}
      {on && value ? (
        <strong className="tabular-nums text-foreground">{value}</strong>
      ) : null}
    </button>
  );
}
