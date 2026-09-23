// When a long, very specific phrase has no data in DataForSEO, the shorter
// version usually does ("proveedor fruta al por mayor" has none, "fruta al por
// mayor" has hundreds of related keywords). These helpers propose those shorter
// versions.

const STOPWORDS = new Set([
  "a", "al", "ante", "con", "de", "del", "el", "en", "es", "la", "las", "lo",
  "los", "para", "por", "sin", "sobre", "un", "una", "unos", "unas", "y", "o",
  "e", "u", "que", "se", "su", "sus", "mi", "tu", "the", "of", "and", "for",
  "to", "in", "on", "with", "a", "an",
]);

const MIN_VARIANT_LENGTH = 8;
const MAX_VARIANTS = 3;

function stripEdgeStopwords(tokens: string[]): string[] {
  let start = 0;
  let end = tokens.length;
  while (start < end && STOPWORDS.has(tokens[start].toLowerCase())) start += 1;
  while (end > start && STOPWORDS.has(tokens[end - 1].toLowerCase())) end -= 1;
  return tokens.slice(start, end);
}

/**
 * Shorter versions of a phrase: without its first word, and without its last
 * word, never starting or ending on a connector ("al", "por", "de"...).
 * Phrases of fewer than three words have no useful shorter version.
 */
export function shorterSearchVariants(seed: string): string[] {
  const tokens = seed.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return [];

  const candidates = [tokens.slice(1), tokens.slice(0, -1)];
  const variants: string[] = [];
  for (const candidate of candidates) {
    const text = stripEdgeStopwords(candidate).join(" ");
    if (
      text.length >= MIN_VARIANT_LENGTH &&
      text.toLowerCase() !== seed.trim().toLowerCase() &&
      !variants.some((variant) => variant.toLowerCase() === text.toLowerCase())
    ) {
      variants.push(text);
    }
  }
  return variants.slice(0, MAX_VARIANTS);
}

/**
 * True when Auto mode had to fall back to the broad "ideas" source (related
 * keywords and suggestions were empty) and the searched phrase is not among the
 * results: the phrase has no data of its own.
 */
export function seedHasNoData(input: {
  source: string;
  usedFallback: boolean;
  searchedKeyword: string;
  rowKeywords: readonly string[];
}): boolean {
  const seed = input.searchedKeyword.trim().toLowerCase();
  if (!seed || input.rowKeywords.length === 0) return false;
  if (input.source !== "ideas" || !input.usedFallback) return false;
  return !input.rowKeywords.some((keyword) => keyword.trim().toLowerCase() === seed);
}
