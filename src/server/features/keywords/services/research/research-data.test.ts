import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: vi.fn(),
}));

import {
  createDataforseoClient,
  type AdsKeywordIdeaItem,
} from "@/server/lib/dataforseo";
import { fetchResearchRowsBySource, mapAdsKeywordItems } from "./research-data";

const customer = { organizationId: "org", userEmail: "a@b.c", userId: "u" };

function mockClient() {
  const calls = {
    related: vi.fn().mockResolvedValue([]),
    suggestions: vi.fn().mockResolvedValue([]),
    ideas: vi.fn().mockResolvedValue([]),
  };
  vi.mocked(createDataforseoClient).mockReturnValue({
    keywords: calls,
  } as unknown as ReturnType<typeof createDataforseoClient>);
  return calls;
}

const base = {
  seedKeyword: "abogado divorcio",
  locationCode: 2724,
  languageCode: "es",
  resultLimit: 150,
};

describe("term filters reach DataForSEO before the result limit", () => {
  const terms = { includeTerms: ["gratis"], excludeTerms: ["madrid"] };

  it("filters suggestions and ideas on the keyword field", async () => {
    const calls = mockClient();
    await fetchResearchRowsBySource({ ...base, ...terms, source: "suggestions" }, customer);
    await fetchResearchRowsBySource({ ...base, ...terms, source: "ideas" }, customer);

    const expected = [
      ["keyword", "like", "%gratis%"],
      "and",
      ["keyword", "not_like", "%madrid%"],
    ];
    expect(calls.suggestions.mock.calls[0][0].filters).toEqual(expected);
    expect(calls.ideas.mock.calls[0][0].filters).toEqual(expected);
  });

  it("filters related keywords on the nested keyword field", async () => {
    const calls = mockClient();
    await fetchResearchRowsBySource({ ...base, ...terms, source: "related" }, customer);

    expect(calls.related.mock.calls[0][0].filters).toEqual([
      ["keyword_data.keyword", "like", "%gratis%"],
      "and",
      ["keyword_data.keyword", "not_like", "%madrid%"],
    ]);
  });

  it("sends no filters when there are no terms", async () => {
    const calls = mockClient();
    await fetchResearchRowsBySource({ ...base, source: "suggestions" }, customer);

    expect(calls.suggestions.mock.calls[0][0].filters).toBeUndefined();
  });
});

describe("mapAdsKeywordItems", () => {
  it("maps Google Ads items to research rows without KD/intent", () => {
    const rows = mapAdsKeywordItems([
      {
        keyword: "Hotel Reykjavik",
        search_volume: 1300,
        cpc: 2.54,
        competition: "HIGH",
        competition_index: 42,
        monthly_searches: [{ year: 2026, month: 5, search_volume: 1300 }],
      },
    ]);

    expect(rows).toEqual([
      {
        keyword: "hotel reykjavik",
        searchVolume: 1300,
        trend: [{ year: 2026, month: 5, searchVolume: 1300 }],
        cpc: 2.54,
        competition: 0.42,
        keywordDifficulty: null,
        intent: "unknown",
      },
    ]);
  });

  it("dedupes case-variant keywords and skips empty ones", () => {
    const items: AdsKeywordIdeaItem[] = [
      { keyword: "northern lights tour", search_volume: 320 },
      { keyword: "Northern Lights Tour", search_volume: 320 },
      { keyword: undefined },
    ];
    const rows = mapAdsKeywordItems(items);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      keyword: "northern lights tour",
      searchVolume: 320,
      competition: null,
      cpc: null,
      trend: [],
    });
  });
});
