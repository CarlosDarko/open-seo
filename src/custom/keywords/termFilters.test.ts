import { describe, expect, it } from "vitest";
import {
  buildLabsTermFilters,
  keywordMatchesTerms,
  sanitizeTerms,
  termsCacheKey,
  termsFromParam,
  termsToParam,
} from "@/custom/keywords/termFilters";

describe("sanitizeTerms", () => {
  it("lowercases, trims and drops percent signs", () => {
    expect(sanitizeTerms(["  MaDrid% "])).toEqual(["madrid"]);
  });

  it("removes duplicates, too-short terms and terms without letters", () => {
    expect(sanitizeTerms(["madrid", "MADRID", "a", "123", ""])).toEqual(["madrid"]);
  });

  it("caps the list at four terms", () => {
    expect(sanitizeTerms(["uno", "dos", "tres", "cuatro", "cinco"])).toEqual([
      "uno",
      "dos",
      "tres",
      "cuatro",
    ]);
  });

  it("keeps multi-word phrases", () => {
    expect(sanitizeTerms(["de  oficio"])).toEqual(["de oficio"]);
  });
});

describe("URL param round trip", () => {
  it("joins with commas and reads them back", () => {
    const param = termsToParam(["madrid", "barcelona"]);
    expect(param).toBe("madrid,barcelona");
    expect(termsFromParam(param)).toEqual(["madrid", "barcelona"]);
  });

  it("is undefined when there is nothing to store", () => {
    expect(termsToParam([])).toBeUndefined();
    expect(termsFromParam(undefined)).toEqual([]);
  });
});

describe("buildLabsTermFilters", () => {
  it("chains conditions with and", () => {
    expect(
      buildLabsTermFilters("keyword", { includeTerms: ["gratis"], excludeTerms: ["madrid"] }),
    ).toEqual([
      ["keyword", "like", "%gratis%"],
      "and",
      ["keyword", "not_like", "%madrid%"],
    ]);
  });

  it("returns undefined when there is nothing to filter", () => {
    expect(buildLabsTermFilters("keyword", {})).toBeUndefined();
  });

  it("uses the field it is given", () => {
    expect(buildLabsTermFilters("keyword_data.keyword", { excludeTerms: ["madrid"] })).toEqual([
      ["keyword_data.keyword", "not_like", "%madrid%"],
    ]);
  });
});

describe("keywordMatchesTerms", () => {
  it("requires all included terms and rejects any excluded term", () => {
    const filters = { includeTerms: ["gratis"], excludeTerms: ["madrid"] };
    expect(keywordMatchesTerms("abogado gratis", filters)).toBe(true);
    expect(keywordMatchesTerms("abogado gratis madrid", filters)).toBe(false);
    expect(keywordMatchesTerms("abogado", filters)).toBe(false);
  });
});

describe("termsCacheKey", () => {
  it("is null without terms and order independent otherwise", () => {
    expect(termsCacheKey({})).toBeNull();
    expect(termsCacheKey({ excludeTerms: ["b", "a"] })).toBe(
      termsCacheKey({ excludeTerms: ["a", "b"] }),
    );
  });
});
