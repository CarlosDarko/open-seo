import { AlertTriangle } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import type { KeywordResearchControllerState } from "@/client/features/keywords/page/types";
import {
  seedHasNoData,
  shorterSearchVariants,
} from "@/custom/keywords/shorterSeeds";
import { hasTermFilters } from "@/custom/keywords/termFilters";

/**
 * Shown when DataForSEO has no data for the exact phrase searched, so Auto mode
 * could only return category-level ideas, which can be unrelated to the
 * phrase. Offers shorter versions of the phrase that usually do have data.
 */
export function NoSeedDataNotice({
  controller,
}: {
  controller: KeywordResearchControllerState;
}) {
  const {
    controlsForm,
    hasSearched,
    isLoading,
    researchError,
    researchSource,
    rows,
    searchedKeyword,
    termFilters,
  } = controller;

  const noData =
    hasSearched &&
    !isLoading &&
    !researchError &&
    seedHasNoData({
      source: researchSource,
      filtering: hasTermFilters(termFilters),
      searchedKeyword,
      rowKeywords: rows.map((row) => row.keyword),
    });
  if (!noData) return null;

  const variants = shorterSearchVariants(searchedKeyword);

  function search(keyword: string) {
    controlsForm.setFieldValue("keyword", keyword);
    void controlsForm.handleSubmit();
  }

  return (
    <Alert variant="warning" role="status">
      <AlertTriangle />
      <AlertTitle>DataForSEO no tiene datos de «{searchedKeyword}».</AlertTitle>
      <AlertDescription className="text-foreground/80">
        <p>
          Es una frase demasiado específica, así que estos resultados son ideas
          de temática amplia y pueden no estar relacionados con lo que buscas.
        </p>
        {variants.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span>Prueba con una versión más corta:</span>
            {variants.map((variant) => (
              <Button
                key={variant}
                variant="outline"
                size="sm"
                onClick={() => search(variant)}
              >
                {variant}
              </Button>
            ))}
          </div>
        ) : (
          <p className="mt-1">Prueba con una palabra o frase más general.</p>
        )}
      </AlertDescription>
    </Alert>
  );
}
