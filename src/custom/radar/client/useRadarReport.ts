import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  periodInput,
  useRadarFilters,
} from "@/custom/radar/client/useRadarFilters";
import { getRadarReport } from "@/serverFunctions/radar";

/** The Radar report for the chosen period, shared by the Radar and the action
 *  plan so switching between them reuses the same data. */
export function useRadarReport(projectId: string) {
  const { filters, update, ready } = useRadarFilters();
  const input = { ...periodInput(filters), includeBrand: filters.includeBrand };
  const hasDates =
    filters.range !== "custom" || Boolean(filters.startDate && filters.endDate);
  const query = useQuery({
    queryKey: ["radar", projectId, input],
    queryFn: () => getRadarReport({ data: { projectId, ...input } }),
    enabled: ready && hasDates,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  return {
    filters,
    update,
    query,
    report: query.data?.connected ? query.data : null,
  };
}
