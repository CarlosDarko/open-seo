import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";

// Sorting for the tool's own tables: click a column head to sort by it, click
// again to reverse. Numbers start from the biggest, text from A to Z.

export type SortDir = "asc" | "desc";
export type SortState = { col: number; dir: SortDir } | null;
export type SortValue = string | number | null;

function compare(a: SortValue, b: SortValue, dir: SortDir): number {
  // Rows without a value always go last, whichever way it is sorted.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const order =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "es", { sensitivity: "base" });
  return dir === "asc" ? order : -order;
}

/** Sorts `rows` by the column the user chose. `values(row)` gives, per column,
 *  what that column is sorted by (null for a column that cannot be sorted). */
export function useSort<T>(
  rows: T[],
  values: (row: T) => SortValue[],
  initial: SortState = null,
) {
  const [state, setState] = useState<SortState>(initial);
  const sorted = useMemo(() => {
    if (!state) return rows;
    const { col, dir } = state;
    return [...rows].sort((a, b) =>
      compare(values(a)[col] ?? null, values(b)[col] ?? null, dir),
    );
    // `values` is rebuilt on every render and only reads the row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, state]);
  const toggle = (col: number, text = false) =>
    setState((previous) =>
      previous?.col === col
        ? { col, dir: previous.dir === "asc" ? "desc" : "asc" }
        : { col, dir: text ? "asc" : "desc" },
    );
  return { rows: sorted, state, toggle };
}

/** A table head that sorts its column when clicked, with an arrow that shows
 *  the current direction. */
export function SortableHead({
  col,
  state,
  onToggle,
  text,
  align = "right",
  className = "",
  children,
}: {
  col: number;
  state: SortState;
  onToggle: (col: number, text?: boolean) => void;
  /** A text column: the first click sorts A to Z. */
  text?: boolean;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  const active = state?.col === col;
  const Icon = !active
    ? ArrowUpDown
    : state.dir === "asc"
      ? ArrowUp
      : ArrowDown;
  return (
    <TableHead
      className={`${align === "right" ? "text-right" : ""} ${className}`}
      aria-sort={
        active ? (state.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onToggle(col, text)}
        className={`inline-flex items-center gap-1 rounded hover:text-foreground ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-foreground" : ""}`}
      >
        {children}
        <Icon
          className={`size-3 shrink-0 ${active ? "" : "opacity-40"}`}
          aria-hidden
        />
      </button>
    </TableHead>
  );
}

export type Column<T> = {
  label: string;
  /** What the column is sorted by. */
  value: (row: T) => SortValue;
  render: (row: T) => ReactNode;
  /** A text column: left aligned, first click sorts A to Z. */
  text?: boolean;
  className?: string;
};

/** A table whose columns all sort, described by its columns. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  initial = null,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  initial?: SortState;
}) {
  const sort = useSort(
    rows,
    (row) => columns.map((c) => c.value(row)),
    initial,
  );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column, index) => (
            <SortableHead
              key={column.label}
              col={index}
              state={sort.state}
              onToggle={sort.toggle}
              text={column.text}
              align={column.text ? "left" : "right"}
            >
              {column.label}
            </SortableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && empty ? (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="py-6 text-center text-muted-foreground"
            >
              {empty}
            </TableCell>
          </TableRow>
        ) : null}
        {sort.rows.map((row) => (
          <TableRow key={rowKey(row)}>
            {columns.map((column) => (
              <TableCell
                key={column.label}
                className={
                  column.className ??
                  (column.text ? "min-w-64" : "text-right tabular-nums")
                }
              >
                {column.render(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
