import { useEffect } from "react";
import { useAppForm } from "@/client/components/form/useAppForm";
import {
  createFormValidationErrors,
  shouldValidateFieldOnChange,
} from "@/client/lib/forms";
import {
  MAX_KEYWORDS_PER_SUBMIT,
  type KeywordMode,
  type ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import { parseKeywordInput } from "@/client/features/keywords/state/keywordControllerActions";
import type { TermMatch } from "@/custom/keywords/termFilters";

type UseKeywordControlsFormInput = {
  keywordInput: string;
  locationCode: number;
  locationName: string | undefined;
  resultLimit: ResultLimit;
  keywordMode: KeywordMode;
  clickstream: boolean;
  includeTerms: string[];
  excludeTerms: string[];
  includeMatch: TermMatch;
  excludeMatch: TermMatch;
};

export type KeywordControlsValues = {
  keyword: string;
  locationCode: number;
  locationName: string | undefined;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
  includeTerms: string[];
  excludeTerms: string[];
  includeMatch: TermMatch;
  excludeMatch: TermMatch;
};

function getKeywordSearchValidationErrors(
  value: KeywordControlsValues,
  shouldValidateUntouchedField: boolean,
  validateEmptyKeyword: boolean,
) {
  const keywords = parseKeywordInput(value.keyword);

  if (keywords.length === 0) {
    if (!validateEmptyKeyword) return null;
    return createFormValidationErrors({
      fields: {
        keyword: "Please enter at least one keyword.",
      },
    });
  }

  if (!shouldValidateUntouchedField) return null;

  if (keywords.length > MAX_KEYWORDS_PER_SUBMIT) {
    return createFormValidationErrors({
      fields: {
        keyword: `Please enter no more than ${MAX_KEYWORDS_PER_SUBMIT} keywords (one per line).`,
      },
    });
  }

  return null;
}

export function useKeywordControlsForm(
  input: UseKeywordControlsFormInput,
  onSubmit: (value: KeywordControlsValues) => void,
) {
  const form = useAppForm({
    defaultValues: {
      keyword: input.keywordInput,
      locationCode: input.locationCode,
      locationName: input.locationName,
      resultLimit: input.resultLimit,
      mode: input.keywordMode,
      clickstream: input.clickstream,
      includeTerms: input.includeTerms,
      excludeTerms: input.excludeTerms,
      includeMatch: input.includeMatch,
      excludeMatch: input.excludeMatch,
    },
    validators: {
      onChange: ({ formApi, value }) =>
        getKeywordSearchValidationErrors(
          value,
          shouldValidateFieldOnChange(formApi, "keyword"),
          false,
        ),
      onSubmit: ({ value }) =>
        getKeywordSearchValidationErrors(value, true, true),
    },
    onSubmit: ({ value }) => {
      onSubmit(value);
    },
  });

  // The term lists are new arrays on every render; reset only when their content changes.
  const termsKey = JSON.stringify([input.includeTerms, input.excludeTerms]);
  useEffect(() => {
    const [includeTerms, excludeTerms] = JSON.parse(termsKey) as [
      string[],
      string[],
    ];
    form.reset({
      keyword: input.keywordInput,
      locationCode: input.locationCode,
      locationName: input.locationName,
      resultLimit: input.resultLimit,
      mode: input.keywordMode,
      clickstream: input.clickstream,
      includeTerms,
      excludeTerms,
      includeMatch: input.includeMatch,
      excludeMatch: input.excludeMatch,
    });
  }, [
    form,
    input.keywordInput,
    input.keywordMode,
    input.locationCode,
    input.locationName,
    input.resultLimit,
    input.clickstream,
    input.includeMatch,
    input.excludeMatch,
    termsKey,
  ]);

  return form;
}
