import { Input } from "@/client/components/ui/input";
import type { RadarReport } from "@/custom/radar/actions";
import { BrandDialog } from "@/custom/radar/client/BrandDialog";
import { Label } from "@/client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Switch } from "@/client/components/ui/switch";
import type {
  RadarFilters,
  RadarRange,
} from "@/custom/radar/client/useRadarFilters";

const RANGE_ITEMS = [
  { value: "last_7_days", label: "Últimos 7 días" },
  { value: "last_28_days", label: "Últimos 28 días" },
  { value: "last_3_months", label: "Últimos 3 meses" },
  { value: "last_6_months", label: "Últimos 6 meses" },
  { value: "last_12_months", label: "Últimos 12 meses" },
  { value: "last_16_months", label: "Todo (16 meses)" },
  { value: "custom", label: "Personalizado…" },
];

const COMPARE_ITEMS = [
  { value: "previous", label: "Comparar con el periodo anterior" },
  { value: "year", label: "Comparar con el año anterior" },
];

/** Period, comparison and (when a project is given) brand controls for the
 *  Radar pages. */
export function RadarControls({
  projectId,
  filters,
  onChange,
  brand,
  fellBack,
}: {
  projectId?: string;
  filters: RadarFilters;
  onChange: (patch: Partial<RadarFilters>) => void;
  brand?: RadarReport["brand"];
  /** The year-ago comparison was not possible (data goes back 16 months). */
  fellBack?: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select
          items={RANGE_ITEMS}
          value={filters.range}
          onValueChange={(value) => onChange({ range: value as RadarRange })}
        >
          <SelectTrigger size="sm" aria-label="Periodo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filters.range === "custom" ? (
          <>
            <Input
              type="date"
              aria-label="Desde"
              className="h-8 w-36"
              max={filters.endDate || today}
              value={filters.startDate}
              onChange={(event) => onChange({ startDate: event.target.value })}
            />
            <span className="text-sm text-muted-foreground">a</span>
            <Input
              type="date"
              aria-label="Hasta"
              className="h-8 w-36"
              min={filters.startDate || undefined}
              max={today}
              value={filters.endDate}
              onChange={(event) => onChange({ endDate: event.target.value })}
            />
          </>
        ) : null}
        <Select
          items={COMPARE_ITEMS}
          value={filters.compare}
          onValueChange={(value) =>
            onChange({ compare: value as RadarFilters["compare"] })
          }
        >
          <SelectTrigger size="sm" aria-label="Comparación">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPARE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {brand && projectId ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <BrandDialog projectId={projectId} brand={brand} />
          {brand.hasBrand ? (
            <div className="flex items-center gap-2">
              <Switch
                id="radar-brand"
                checked={filters.includeBrand}
                onCheckedChange={(checked) =>
                  onChange({ includeBrand: checked })
                }
              />
              <Label htmlFor="radar-brand" className="text-sm">
                Incluir marca en el análisis
              </Label>
            </div>
          ) : null}
        </div>
      ) : null}
      {fellBack ? (
        <p className="max-w-sm text-right text-xs text-muted-foreground">
          Search Console solo guarda 16 meses: no hay datos de hace un año para
          este periodo, así que se compara con el periodo anterior.
        </p>
      ) : null}
    </div>
  );
}
