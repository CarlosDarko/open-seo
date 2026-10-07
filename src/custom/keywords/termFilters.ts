// "Must contain" / "exclude" terms for keyword research (fork feature).
//
// The terms are sent to DataForSEO as filters, so they are applied BEFORE the
// result limit: the 150/300/500 slots fill with keywords that match instead of
// being spent on ones the user does not want (for example every "madrid").

/** DataForSEO allows 8 filter conditions per request; we split them 4 + 4. */
export const MAX_TERMS_PER_KIND = 4;
export const MIN_TERM_LENGTH = 2;
export const MAX_TERM_LENGTH = 40;

/**
 * How the terms of one field combine:
 *  - "all": every term counts together (Y)
 *  - "any": one term is enough (O)
 * For "Debe contener" the default is all (Y): the keyword needs every term.
 * For "Excluir" the default is any (O): one excluded term drops the keyword.
 * "Excluir" with all (Y) drops a keyword only when all its terms appear.
 */
export type TermMatch = "all" | "any";

export type TermFilters = {
  includeTerms: string[];
  excludeTerms: string[];
  includeMatch: TermMatch;
  excludeMatch: TermMatch;
};

export const DEFAULT_INCLUDE_MATCH: TermMatch = "all";
export const DEFAULT_EXCLUDE_MATCH: TermMatch = "any";

export const EMPTY_TERM_FILTERS: TermFilters = {
  includeTerms: [],
  excludeTerms: [],
  includeMatch: DEFAULT_INCLUDE_MATCH,
  excludeMatch: DEFAULT_EXCLUDE_MATCH,
};

/** URL form: only the non-default value is stored. */
export function includeMatchToParam(match: TermMatch): "any" | undefined {
  return match === "any" ? "any" : undefined;
}

export function includeMatchFromParam(value: string | undefined): TermMatch {
  return value === "any" ? "any" : DEFAULT_INCLUDE_MATCH;
}

export function excludeMatchToParam(match: TermMatch): "all" | undefined {
  return match === "all" ? "all" : undefined;
}

export function excludeMatchFromParam(value: string | undefined): TermMatch {
  return value === "all" ? "all" : DEFAULT_EXCLUDE_MATCH;
}

export function normalizeTerm(raw: string): string {
  return raw
    .toLocaleLowerCase()
    .replaceAll("%", "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isUsableTerm(term: string): boolean {
  return (
    term.length >= MIN_TERM_LENGTH &&
    term.length <= MAX_TERM_LENGTH &&
    /\p{L}/u.test(term)
  );
}

/** Cleans a list of terms: lowercase, no duplicates, usable ones only, capped. */
export function sanitizeTerms(terms: readonly string[]): string[] {
  const clean: string[] = [];
  for (const raw of terms) {
    const term = normalizeTerm(raw);
    if (!isUsableTerm(term) || clean.includes(term)) continue;
    clean.push(term);
    if (clean.length === MAX_TERMS_PER_KIND) break;
  }
  return clean;
}

/** URL form: terms joined by commas (a term never contains a comma). */
export function termsToParam(terms: readonly string[]): string | undefined {
  const clean = sanitizeTerms(terms);
  return clean.length > 0 ? clean.join(",") : undefined;
}

export function termsFromParam(value: string | undefined): string[] {
  return value ? sanitizeTerms(value.split(",")) : [];
}

type LabsCondition = [string, string, string];
type LabsGroup = (LabsCondition | LabsGroup | "and" | "or")[];
type LabsFilters = LabsGroup;

// Conditions joined by one operator. A single condition stays as it is.
function join(
  items: (LabsCondition | LabsGroup)[],
  operator: "and" | "or",
): LabsCondition | LabsGroup {
  if (items.length === 1) return items[0];
  return items.flatMap((item, index) =>
    index === 0 ? [item] : [operator, item],
  );
}

/**
 * DataForSEO Labs `filters` value.
 *  - required terms: "like %term%", joined with and (all) or or (any)
 *  - excluded terms: "not_like %term%", joined with and (any of them drops the
 *    keyword) or or (dropped only when all of them appear)
 * The two groups are then chained with "and". Returns undefined when there is
 * nothing to filter.
 */
export function buildLabsTermFilters(
  field: string,
  filters: Partial<TermFilters>,
): LabsFilters | undefined {
  const include = (filters.includeTerms ?? []).slice(0, MAX_TERMS_PER_KIND);
  const exclude = (filters.excludeTerms ?? []).slice(0, MAX_TERMS_PER_KIND);

  const groups: (LabsCondition | LabsGroup)[] = [];
  if (include.length > 0) {
    groups.push(
      join(
        include.map(
          (term): LabsCondition => [field, "like", `%${normalizeTerm(term)}%`],
        ),
        (filters.includeMatch ?? DEFAULT_INCLUDE_MATCH) === "any"
          ? "or"
          : "and",
      ),
    );
  }
  if (exclude.length > 0) {
    groups.push(
      join(
        exclude.map(
          (term): LabsCondition => [
            field,
            "not_like",
            `%${normalizeTerm(term)}%`,
          ],
        ),
        (filters.excludeMatch ?? DEFAULT_EXCLUDE_MATCH) === "all"
          ? "or"
          : "and",
      ),
    );
  }

  if (groups.length === 0) return undefined;
  if (groups.length === 2) return [groups[0], "and", groups[1]];
  const only = groups[0];
  // A lone condition goes in a list; a lone group already is the list.
  return typeof only[0] === "string"
    ? [only as LabsCondition]
    : (only as LabsGroup);
}

/** Same rule applied in code, for data sources that cannot filter remotely. */
export function keywordMatchesTerms(
  keyword: string,
  filters: Partial<TermFilters>,
): boolean {
  const haystack = keyword.toLocaleLowerCase();
  const include = filters.includeTerms ?? [];
  const exclude = filters.excludeTerms ?? [];
  const has = (term: string) => haystack.includes(term);

  const includeOk =
    include.length === 0 ||
    ((filters.includeMatch ?? DEFAULT_INCLUDE_MATCH) === "any"
      ? include.some(has)
      : include.every(has));
  const excluded =
    exclude.length > 0 &&
    ((filters.excludeMatch ?? DEFAULT_EXCLUDE_MATCH) === "all"
      ? exclude.every(has)
      : exclude.some(has));
  return includeOk && !excluded;
}

/** Stable text for cache keys: null when there are no terms. */
export function termsCacheKey(filters: Partial<TermFilters>): string | null {
  const include = [...(filters.includeTerms ?? [])].sort();
  const exclude = [...(filters.excludeTerms ?? [])].sort();
  if (include.length === 0 && exclude.length === 0) return null;
  return JSON.stringify({
    include,
    exclude,
    includeMatch: filters.includeMatch ?? DEFAULT_INCLUDE_MATCH,
    excludeMatch: filters.excludeMatch ?? DEFAULT_EXCLUDE_MATCH,
  });
}

// ---------------------------------------------------------------------------
// Whole-filter helpers. The research code carries the four values as one
// `TermFilters` object, which keeps the edits in upstream files small.
// ---------------------------------------------------------------------------

export function normalizeTermFilters(input: Partial<TermFilters>): TermFilters {
  return {
    includeTerms: sanitizeTerms(input.includeTerms ?? []),
    excludeTerms: sanitizeTerms(input.excludeTerms ?? []),
    includeMatch: input.includeMatch === "any" ? "any" : DEFAULT_INCLUDE_MATCH,
    excludeMatch: input.excludeMatch === "all" ? "all" : DEFAULT_EXCLUDE_MATCH,
  };
}

export function hasTermFilters(filters: TermFilters): boolean {
  return filters.includeTerms.length > 0 || filters.excludeTerms.length > 0;
}

export function termFilterCount(filters: TermFilters): number {
  return filters.includeTerms.length + filters.excludeTerms.length;
}

/** The URL search params of a set of filters (only non-default values). */
export function termFiltersToParams(filters: TermFilters): {
  must: string | undefined;
  not: string | undefined;
  mm: "any" | undefined;
  nm: "all" | undefined;
} {
  return {
    must: termsToParam(filters.includeTerms),
    not: termsToParam(filters.excludeTerms),
    mm:
      filters.includeTerms.length > 1
        ? includeMatchToParam(filters.includeMatch)
        : undefined,
    nm:
      filters.excludeTerms.length > 1
        ? excludeMatchToParam(filters.excludeMatch)
        : undefined,
  };
}

export function termFiltersFromParams(params: {
  must?: string;
  not?: string;
  mm?: string;
  nm?: string;
}): TermFilters {
  return normalizeTermFilters({
    includeTerms: termsFromParam(params.must),
    excludeTerms: termsFromParam(params.not),
    includeMatch: includeMatchFromParam(params.mm),
    excludeMatch: excludeMatchFromParam(params.nm),
  });
}

/** Reads filters back from storage (tabs saved before filters existed have none). */
export function parseStoredTermFilters(value: unknown): TermFilters {
  if (typeof value !== "object" || value === null) return EMPTY_TERM_FILTERS;
  const record = value as Record<string, unknown>;
  const strings = (raw: unknown) =>
    Array.isArray(raw)
      ? raw.filter((item): item is string => typeof item === "string")
      : [];
  return normalizeTermFilters({
    includeTerms: strings(record.includeTerms),
    excludeTerms: strings(record.excludeTerms),
    includeMatch: record.includeMatch === "any" ? "any" : "all",
    excludeMatch: record.excludeMatch === "all" ? "all" : "any",
  });
}

/** The research request fields for a set of filters (omitted when empty). */
export function termFiltersToResearchInput(filters: TermFilters): {
  includeTerms?: string[];
  excludeTerms?: string[];
  includeMatch?: TermMatch;
  excludeMatch?: TermMatch;
} {
  return {
    includeTerms:
      filters.includeTerms.length > 0 ? filters.includeTerms : undefined,
    excludeTerms:
      filters.excludeTerms.length > 0 ? filters.excludeTerms : undefined,
    includeMatch:
      filters.includeTerms.length > 0 ? filters.includeMatch : undefined,
    excludeMatch:
      filters.excludeTerms.length > 0 ? filters.excludeMatch : undefined,
  };
}
