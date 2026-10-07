import { describe, expect, it } from "vitest";
import {
  buildLabsTermFilters,
  excludeMatchFromParam,
  excludeMatchToParam,
  includeMatchFromParam,
  includeMatchToParam,
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
    expect(sanitizeTerms(["madrid", "MADRID", "a", "123", ""])).toEqual([
      "madrid",
    ]);
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
      buildLabsTermFilters("keyword", {
        includeTerms: ["gratis"],
        excludeTerms: ["madrid"],
      }),
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
    expect(
      buildLabsTermFilters("keyword_data.keyword", {
        excludeTerms: ["madrid"],
      }),
    ).toEqual([["keyword_data.keyword", "not_like", "%madrid%"]]);
  });
});

describe("Y/O in the DataForSEO filter", () => {
  it("joins required terms with or when any one is enough (O)", () => {
    expect(
      buildLabsTermFilters("keyword", {
        includeTerms: ["barcelona", "madrid"],
        includeMatch: "any",
      }),
    ).toEqual([
      ["keyword", "like", "%barcelona%"],
      "or",
      ["keyword", "like", "%madrid%"],
    ]);
  });

  it("groups an O of required terms before chaining the excluded ones with and", () => {
    expect(
      buildLabsTermFilters("keyword", {
        includeTerms: ["barcelona", "madrid"],
        includeMatch: "any",
        excludeTerms: ["gratis"],
      }),
    ).toEqual([
      [
        ["keyword", "like", "%barcelona%"],
        "or",
        ["keyword", "like", "%madrid%"],
      ],
      "and",
      ["keyword", "not_like", "%gratis%"],
    ]);
  });

  it("drops a keyword only when all excluded terms appear together (Y)", () => {
    expect(
      buildLabsTermFilters("keyword", {
        excludeTerms: ["barcelona", "seo"],
        excludeMatch: "all",
      }),
    ).toEqual([
      ["keyword", "not_like", "%barcelona%"],
      "or",
      ["keyword", "not_like", "%seo%"],
    ]);
  });

  it("groups both when each has several terms", () => {
    expect(
      buildLabsTermFilters("keyword", {
        includeTerms: ["a1", "b2"],
        includeMatch: "any",
        excludeTerms: ["c3", "d4"],
        excludeMatch: "any",
      }),
    ).toEqual([
      [["keyword", "like", "%a1%"], "or", ["keyword", "like", "%b2%"]],
      "and",
      [["keyword", "not_like", "%c3%"], "and", ["keyword", "not_like", "%d4%"]],
    ]);
  });
});

describe("Y/O in the local rule", () => {
  it("accepts any required term when the match is O", () => {
    const filters = {
      includeTerms: ["barcelona", "madrid"],
      includeMatch: "any" as const,
    };
    expect(keywordMatchesTerms("seo madrid", filters)).toBe(true);
    expect(keywordMatchesTerms("seo valencia", filters)).toBe(false);
  });

  it("drops only keywords with every excluded term when the exclude match is Y", () => {
    const filters = {
      excludeTerms: ["barcelona", "seo"],
      excludeMatch: "all" as const,
    };
    expect(keywordMatchesTerms("agencia seo barcelona", filters)).toBe(false);
    expect(keywordMatchesTerms("agencia seo madrid", filters)).toBe(true);
  });
});

describe("Y/O URL params", () => {
  it("stores only the non-default value", () => {
    expect(includeMatchToParam("all")).toBeUndefined();
    expect(includeMatchToParam("any")).toBe("any");
    expect(excludeMatchToParam("any")).toBeUndefined();
    expect(excludeMatchToParam("all")).toBe("all");
  });

  it("reads them back with the defaults", () => {
    expect(includeMatchFromParam(undefined)).toBe("all");
    expect(includeMatchFromParam("any")).toBe("any");
    expect(excludeMatchFromParam(undefined)).toBe("any");
    expect(excludeMatchFromParam("all")).toBe("all");
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
    expect(
      termsCacheKey({ includeTerms: ["a", "b"], includeMatch: "any" }),
    ).not.toBe(
      termsCacheKey({ includeTerms: ["a", "b"], includeMatch: "all" }),
    );
  });
});
