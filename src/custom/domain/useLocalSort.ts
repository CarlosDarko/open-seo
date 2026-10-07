// Domain overview tables are sorted by DataForSEO, one paid request per sort
// order, per page. When a result already holds every row (one page, nothing
// more to load) re-sorting is pointless to pay for: keep that snapshot and
// sort it in the browser instead.
import { useCallback, useState } from "react";

type Snapshot<T> = { key: string; rows: T[]; totalCount: number | null };

type CompleteResult<T> = {
  rows: T[];
  hasMore: boolean;
  totalCount: number | null;
};

/**
 * `key` must identify everything except the sort (domain, scope, location,
 * filters, page size). Returns the complete snapshot for that key, or null
 * while the full set has not been loaded yet.
 */
export function useCompleteSnapshot<T>(key: string, page: number) {
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(null);

  const remember = useCallback(
    (result: CompleteResult<T> | undefined) => {
      if (!result || page !== 1 || result.hasMore || result.rows.length === 0) {
        return;
      }
      setSnapshot((prev) =>
        prev?.key === key
          ? prev
          : { key, rows: result.rows, totalCount: result.totalCount },
      );
    },
    [key, page],
  );

  return {
    snapshot: snapshot?.key === key && page === 1 ? snapshot : null,
    remember,
  };
}

/** Sorts a copy of the rows; empty values always go last, like DataForSEO. */
export function sortRows<T>(
  rows: readonly T[],
  pick: (row: T) => number | null,
  order: "asc" | "desc",
): T[] {
  const direction = order === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: pick(row) }))
    .sort((a, b) => {
      if (a.value == null && b.value == null) return a.index - b.index;
      if (a.value == null) return 1;
      if (b.value == null) return -1;
      return a.value === b.value
        ? a.index - b.index
        : (a.value - b.value) * direction;
    })
    .map((entry) => entry.row);
}
