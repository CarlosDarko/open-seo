// "Auto" keyword research tries related keywords, then suggestions, then ideas.
// Without filters it stops at the first source that looks sufficient.
//
// With term filters two things change:
//  * "ideas" is skipped. It expands to whole topic areas around the seed rather
//    than to keywords close to it, so a filter like "barcelona" would fill the
//    results with unrelated things (informática, padrón, farmacias). It stays
//    available by choosing the Ideas mode explicitly.
//  * the coverage shortcut is not used: related and suggestions are both close
//    to the seed, so both are collected before stopping.

const BROAD_SOURCE = "ideas";

export function autoSourcesFor<T extends string>(
  sources: readonly T[],
  filtering: boolean,
): T[] {
  return filtering ? sources.filter((source) => source !== BROAD_SOURCE) : [...sources];
}

export function shouldStopAutoFetch(input: {
  filtering: boolean;
  collected: number;
  resultLimit: number;
  hasSufficientCoverage: boolean;
}): boolean {
  return input.filtering
    ? input.collected >= input.resultLimit
    : input.hasSufficientCoverage;
}
