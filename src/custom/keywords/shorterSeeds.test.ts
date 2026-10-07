import { describe, expect, it } from "vitest";
import {
  seedHasNoData,
  shorterSearchVariants,
} from "@/custom/keywords/shorterSeeds";

describe("shorterSearchVariants", () => {
  it("drops the first word and trims trailing connectors", () => {
    expect(shorterSearchVariants("proveedor fruta al por mayor")).toEqual([
      "fruta al por mayor",
      "proveedor fruta",
    ]);
  });

  it("never starts or ends a variant with a connector", () => {
    expect(shorterSearchVariants("abogado de divorcio express")).toEqual([
      "divorcio express",
      "abogado de divorcio",
    ]);
  });

  it("offers nothing for phrases shorter than three words", () => {
    expect(shorterSearchVariants("consultor seo")).toEqual([]);
    expect(shorterSearchVariants("seo")).toEqual([]);
  });

  it("skips variants that are too short to be useful", () => {
    expect(shorterSearchVariants("a b cd")).toEqual([]);
  });

  it("does not repeat the original phrase", () => {
    expect(shorterSearchVariants("x de y")).not.toContain("x de y");
  });
});

describe("seedHasNoData", () => {
  const base = {
    source: "blended",
    filtering: false,
    searchedKeyword: "proveedor fruta al por mayor",
    rowKeywords: ["proveedor ropa vintage", "proveedor carrefour"],
  };

  it("detects an Auto search whose phrase is missing from the results", () => {
    expect(seedHasNoData(base)).toBe(true);
  });

  it("is false when the phrase itself is in the results", () => {
    expect(
      seedHasNoData({
        ...base,
        rowKeywords: ["Proveedor fruta al por mayor", "x"],
      }),
    ).toBe(false);
  });

  it("is false when term filters may have removed the phrase", () => {
    expect(seedHasNoData({ ...base, filtering: true })).toBe(false);
  });

  it("is false for a source the user picked on purpose", () => {
    expect(seedHasNoData({ ...base, source: "ideas" })).toBe(false);
    expect(seedHasNoData({ ...base, source: "suggestions" })).toBe(false);
    expect(seedHasNoData({ ...base, source: undefined })).toBe(false);
  });

  it("is false without results or without a searched phrase", () => {
    expect(seedHasNoData({ ...base, rowKeywords: [] })).toBe(false);
    expect(seedHasNoData({ ...base, searchedKeyword: "" })).toBe(false);
  });
});
