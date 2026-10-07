// Drop-in replacements for useDomainKeywordsQuery / useDomainPagesQuery that
// stop paying DataForSEO for re-sorting a table that is already fully loaded.
// The Top Keywords / Top Pages tabs only swap the hook they call.
import { useEffect, useMemo } from "react";
import { useDomainKeywordsQuery } from "@/client/features/domain/hooks/useDomainKeywordsQuery";
import { useDomainPagesQuery } from "@/client/features/domain/hooks/useDomainPagesQuery";
import type { KeywordRow, PageRow } from "@/client/features/domain/types";
import { sortRows, useCompleteSnapshot } from "@/custom/domain/useLocalSort";

type KeywordsInput = Parameters<typeof useDomainKeywordsQuery>[0];
type PagesInput = Parameters<typeof useDomainPagesQuery>[0];

// Everything that changes the result except the sort order.
function snapshotKey(input: KeywordsInput | PagesInput) {
  return JSON.stringify([
    input.projectId,
    input.domain,
    input.scope,
    input.locationCode,
    input.pageSize,
    input.appliedFilters,
  ]);
}

const KEYWORD_SORT_VALUE: Record<
  KeywordsInput["sortMode"],
  (row: KeywordRow) => number | null
> = {
  rank: (row) => row.position,
  traffic: (row) => row.traffic,
  volume: (row) => row.searchVolume,
  score: (row) => row.keywordDifficulty,
  cpc: (row) => row.cpc,
};

export function useSortedDomainKeywordsQuery(input: KeywordsInput) {
  const { snapshot, remember } = useCompleteSnapshot<KeywordRow>(
    snapshotKey(input),
    input.page,
  );
  const query = useDomainKeywordsQuery({
    ...input,
    enabled: input.enabled && !snapshot,
  });

  useEffect(() => {
    remember(
      query.data && {
        rows: query.data.keywords,
        hasMore: query.data.hasMore,
        totalCount: query.data.totalCount,
      },
    );
  }, [query.data, remember]);

  const data = useMemo(
    () =>
      snapshot
        ? {
            domain: input.domain,
            page: 1,
            pageSize: input.pageSize,
            totalCount: snapshot.totalCount ?? snapshot.rows.length,
            hasMore: false,
            keywords: sortRows(
              snapshot.rows,
              KEYWORD_SORT_VALUE[input.sortMode],
              input.sortOrder,
            ),
            fetchedAt: "",
          }
        : query.data,
    [
      snapshot,
      query.data,
      input.domain,
      input.pageSize,
      input.sortMode,
      input.sortOrder,
    ],
  );

  return {
    data,
    isFetching: snapshot ? false : query.isFetching,
    isError: snapshot ? false : query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useSortedDomainPagesQuery(input: PagesInput) {
  const { snapshot, remember } = useCompleteSnapshot<PageRow>(
    snapshotKey(input),
    input.page,
  );
  const query = useDomainPagesQuery({
    ...input,
    enabled: input.enabled && !snapshot,
  });

  useEffect(() => {
    remember(
      query.data && {
        rows: query.data.pages,
        hasMore: query.data.hasMore,
        totalCount: query.data.totalCount,
      },
    );
  }, [query.data, remember]);

  const data = useMemo(
    () =>
      snapshot
        ? {
            domain: input.domain,
            page: 1,
            pageSize: input.pageSize,
            totalCount: snapshot.totalCount ?? snapshot.rows.length,
            hasMore: false,
            pages: sortRows(
              snapshot.rows,
              input.sortMode === "volume"
                ? (row: PageRow) => row.keywords
                : (row: PageRow) => row.organicTraffic,
              input.sortOrder,
            ),
            fetchedAt: "",
          }
        : query.data,
    [
      snapshot,
      query.data,
      input.domain,
      input.pageSize,
      input.sortMode,
      input.sortOrder,
    ],
  );

  return {
    data,
    isFetching: snapshot ? false : query.isFetching,
    isError: snapshot ? false : query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
