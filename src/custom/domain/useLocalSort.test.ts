import { describe, expect, it } from "vitest";
import { sortRows } from "@/custom/domain/useLocalSort";

const rows = [
  { id: "a", value: 5 },
  { id: "b", value: null },
  { id: "c", value: 20 },
  { id: "d", value: 5 },
];
const pick = (row: { value: number | null }) => row.value;

describe("sortRows", () => {
  it("sorts descending and keeps empty values last", () => {
    expect(sortRows(rows, pick, "desc").map((r) => r.id)).toEqual([
      "c",
      "a",
      "d",
      "b",
    ]);
  });

  it("sorts ascending and still keeps empty values last", () => {
    expect(sortRows(rows, pick, "asc").map((r) => r.id)).toEqual([
      "a",
      "d",
      "c",
      "b",
    ]);
  });
});
