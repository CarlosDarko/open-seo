import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  getCostOverview,
  getCostSettings,
  getCostSummary,
  listCostEvents,
} from "@/serverFunctions/costs";

export const costOverviewQuery = () =>
  queryOptions({
    queryKey: ["costs", "overview"],
    queryFn: () => getCostOverview(),
    staleTime: 30 * 1000,
  });

export const costSummaryQuery = () =>
  queryOptions({
    queryKey: ["costs", "summary"],
    queryFn: () => getCostSummary(),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

export const costSettingsQuery = () =>
  queryOptions({
    queryKey: ["costs", "settings"],
    queryFn: () => getCostSettings(),
    staleTime: 60 * 60 * 1000,
  });

export type CostEventsArgs = {
  feature?: string;
  month?: string;
  limit: number;
  offset: number;
};

export const costEventsQuery = (args: CostEventsArgs) =>
  queryOptions({
    queryKey: ["costs", "events", args],
    queryFn: () => listCostEvents({ data: args }),
    placeholderData: keepPreviousData,
  });
