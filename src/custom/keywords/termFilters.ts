// "Must contain" / "exclude" terms for keyword research (fork feature).
//
// The terms are sent to DataForSEO as filters, so they are applied BEFORE the
// result limit: the 150/300/500 slots fill with keywords that match instead of
// being spent on ones the user does not want (for example every "madrid").

/** DataForSEO allows 8 filter conditions per request; we split them 4 + 4. */
export const MAX_TERMS_PER_KIND = 4;
export const MIN_TERM_LENGTH = 2;
export const MAX_TERM_LENGTH = 40;

export type TermFilters = {
  includeTerms: string[];
  excludeTerms: string[];
};

export const EMPTY_TERM_FILTERS: TermFilters = {
  includeTerms: [],
  excludeTerms: [],
};

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

/**
 * DataForSEO Labs `filters` value: every required term must appear
 * ("like %term%") and none of the excluded ones may ("not_like %term%"),
 * chained with "and". Returns undefined when there is nothing to filter.
 */
export function buildLabsTermFilters(
  field: string,
  filters: Partial<TermFilters>,
): (LabsCondition | "and")[] | undefined {
  const conditions: LabsCondition[] = [
    ...(filters.includeTerms ?? []).map(
      (term): LabsCondition => [field, "like", `%${normalizeTerm(term)}%`],
    ),
    ...(filters.excludeTerms ?? []).map(
      (term): LabsCondition => [field, "not_like", `%${normalizeTerm(term)}%`],
    ),
  ].slice(0, MAX_TERMS_PER_KIND * 2);

  if (conditions.length === 0) return undefined;
  return conditions.flatMap((condition, index) =>
    index === 0 ? [condition] : (["and", condition] as const),
  );
}

/** Same rule applied in code, for data sources that cannot filter remotely. */
export function keywordMatchesTerms(
  keyword: string,
  filters: Partial<TermFilters>,
): boolean {
  const haystack = keyword.toLocaleLowerCase();
  const include = filters.includeTerms ?? [];
  const exclude = filters.excludeTerms ?? [];
  return (
    include.every((term) => haystack.includes(term)) &&
    !exclude.some((term) => haystack.includes(term))
  );
}

/** Stable text for cache keys: null when there are no terms. */
export function termsCacheKey(filters: Partial<TermFilters>): string | null {
  const include = [...(filters.includeTerms ?? [])].sort();
  const exclude = [...(filters.excludeTerms ?? [])].sort();
  if (include.length === 0 && exclude.length === 0) return null;
  return JSON.stringify({ include, exclude });
}
