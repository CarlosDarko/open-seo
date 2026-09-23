// "Auto" keyword research tries related keywords, then suggestions, then ideas.
// Without filters it stops at the first source that looks sufficient. With
// term filters that rule is wrong: the first source can return only a handful
// of matches (16 "barcelona" keywords) while the next one holds thousands, so
// it must keep going until the result limit is filled or the sources run out.

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
