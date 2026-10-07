import { describe, expect, it, vi } from "vitest";

// The hook module pulls in the server functions it calls, whose graph reaches
// Workers-only bindings that don't resolve outside workerd.
vi.mock("cloudflare:workers", () => ({ env: {} }));

import { EMPTY_TERM_FILTERS } from "@/custom/keywords/termFilters";
import {
  buildKeywordResearchRequest,
  buildKeywordResearchQueryKey,
} from "./useKeywordResearchData";

const baseInput = {
  projectId: "project_1",
  keywordInput: "technical seo",
  locationCode: 2704,
  locationName: undefined,
  resultLimit: 150 as const,
  mode: "auto" as const,
  clickstream: false,
  groupKeywords: false,
  termFilters: EMPTY_TERM_FILTERS,
};

describe("buildKeywordResearchRequest", () => {
  it("never serves a national or ungrouped result for a local or grouped search", () => {
    const national = buildKeywordResearchRequest(baseInput);
    const local = buildKeywordResearchRequest({
      ...baseInput,
      locationName: "Hanoi,Hanoi,Vietnam",
    });
    const grouped = buildKeywordResearchRequest({
      ...baseInput,
      groupKeywords: true,
    });

    expect(local).toMatchObject({ locationName: "Hanoi,Hanoi,Vietnam" });
    expect(buildKeywordResearchQueryKey(local)).not.toEqual(
      buildKeywordResearchQueryKey(national),
    );
    expect(buildKeywordResearchQueryKey(grouped)).not.toEqual(
      buildKeywordResearchQueryKey(national),
    );
  });

  it("never serves an unfiltered result for a filtered search, or one filter mode for the other", () => {
    const plain = buildKeywordResearchRequest(baseInput);
    const excluded = buildKeywordResearchRequest({
      ...baseInput,
      termFilters: { ...EMPTY_TERM_FILTERS, excludeTerms: ["madrid"] },
    });
    const any = buildKeywordResearchRequest({
      ...baseInput,
      termFilters: {
        ...EMPTY_TERM_FILTERS,
        includeTerms: ["barcelona", "madrid"],
        includeMatch: "any",
      },
    });
    const all = buildKeywordResearchRequest({
      ...baseInput,
      termFilters: {
        ...EMPTY_TERM_FILTERS,
        includeTerms: ["barcelona", "madrid"],
        includeMatch: "all",
      },
    });

    expect(buildKeywordResearchQueryKey(excluded)).not.toEqual(
      buildKeywordResearchQueryKey(plain),
    );
    expect(buildKeywordResearchQueryKey(any)).not.toEqual(
      buildKeywordResearchQueryKey(all),
    );
  });
});
