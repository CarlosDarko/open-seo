import { useCallback, useEffect, useState } from "react";
import { RADAR_RANGES } from "@/custom/radar/periods";

export type RadarRange = (typeof RADAR_RANGES)[number];

export type RadarFilters = {
  range: RadarRange;
  startDate: string;
  endDate: string;
  compare: "previous" | "year";
  includeBrand: boolean;
};

const STORAGE_KEY = "radar-filters-v1";

const DEFAULTS: RadarFilters = {
  range: "last_28_days",
  startDate: "",
  endDate: "",
  compare: "previous",
  includeBrand: false,
};

function readStored(): RadarFilters {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<RadarFilters>;
    return {
      range: RADAR_RANGES.includes(parsed.range as RadarRange)
        ? (parsed.range as RadarRange)
        : DEFAULTS.range,
      startDate: typeof parsed.startDate === "string" ? parsed.startDate : "",
      endDate: typeof parsed.endDate === "string" ? parsed.endDate : "",
      compare: parsed.compare === "year" ? "year" : "previous",
      includeBrand: parsed.includeBrand === true,
    };
  } catch {
    return DEFAULTS;
  }
}

/**
 * The period, comparison and brand choices, shared by the Radar, the action
 * plan and Discover and remembered in this browser. `ready` turns true once
 * the stored choice has been read, so queries never run with the defaults
 * first and then again with the stored values.
 */
export function useRadarFilters() {
  const [filters, setFilters] = useState<RadarFilters>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setFilters(readStored());
    setReady(true);
  }, []);

  const update = useCallback((patch: Partial<RadarFilters>) => {
    setFilters((previous) => {
      const next = { ...previous, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage can be blocked; the choice then lasts for this visit only.
      }
      return next;
    });
  }, []);

  return { filters, update, ready };
}

/** The input every report function takes for the chosen period. A custom
 *  range without both dates falls back to the default preset. */
export function periodInput(filters: RadarFilters) {
  const custom =
    filters.range === "custom" && filters.startDate && filters.endDate;
  return {
    range: custom
      ? ("custom" as const)
      : filters.range === "custom"
        ? ("last_28_days" as const)
        : filters.range,
    ...(custom
      ? { startDate: filters.startDate, endDate: filters.endDate }
      : {}),
    compare: filters.compare,
  };
}
