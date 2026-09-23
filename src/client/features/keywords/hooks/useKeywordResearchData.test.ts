import { describe, expect, it, vi } from "vitest";

// The hook module pulls in the server functions it calls, whose graph reaches
// Workers-only bindings that don't resolve outside workerd.
vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  buildKeywordResearchQueryKey,
  buildKeywordResearchRequest,
} from "./useKeywordResearchData";

const baseInput = {
  projectId: "project_1",
  keywordInput: "technical seo",
  locationCode: 2704,
  resultLimit: 150 as const,
  mode: "auto" as const,
  clickstream: false,
  includeTerms: [] as string[],
  excludeTerms: [] as string[],
  includeMatch: "all" as const,
  excludeMatch: "any" as const,
};

describe("buildKeywordResearchRequest", () => {
  it("carries an explicitly selected location without a language", () => {
    const request = buildKeywordResearchRequest(baseInput);

    expect(request).toMatchObject({ locationCode: 2704 });
    expect(request).not.toHaveProperty("languageCode");
  });

  it("leaves the location undefined for the server to resolve", () => {
    const request = buildKeywordResearchRequest({
      ...baseInput,
      locationCode: undefined,
    });

    expect(request).toMatchObject({ locationCode: undefined });
    expect(request).not.toHaveProperty("languageCode");
  });

  it("carries the must-contain and exclude terms", () => {
    const request = buildKeywordResearchRequest({
      ...baseInput,
      includeTerms: ["gratis"],
      excludeTerms: ["madrid", "barcelona"],
    });

    expect(request).toMatchObject({
      includeTerms: ["gratis"],
      excludeTerms: ["madrid", "barcelona"],
    });
  });

  it("keys the query on the terms so a filtered search is a separate result", () => {
    const plain = buildKeywordResearchQueryKey(buildKeywordResearchRequest(baseInput));
    const filtered = buildKeywordResearchQueryKey(
      buildKeywordResearchRequest({ ...baseInput, excludeTerms: ["madrid"] }),
    );

    expect(filtered).not.toEqual(plain);
  });

  it("keys the query on Y/O so the same terms combined differently do not share a result", () => {
    const all = buildKeywordResearchQueryKey(
      buildKeywordResearchRequest({ ...baseInput, includeTerms: ["barcelona", "madrid"] }),
    );
    const any = buildKeywordResearchQueryKey(
      buildKeywordResearchRequest({
        ...baseInput,
        includeTerms: ["barcelona", "madrid"],
        includeMatch: "any",
      }),
    );

    expect(any).not.toEqual(all);
  });
});
