import { AlertTriangle } from "lucide-react";
import type { KeywordResearchControllerState } from "@/client/features/keywords/page/types";
import { seedHasNoData, shorterSearchVariants } from "@/custom/keywords/shorterSeeds";

/**
 * Shown when DataForSEO has no data for the exact phrase searched and Auto mode
 * fell back to the broad "ideas" source, whose results can be unrelated to the
 * phrase. Offers shorter versions of the phrase that usually do have data.
 */
export function NoSeedDataNotice({
  controller,
  compact = false,
}: {
  controller: KeywordResearchControllerState;
  compact?: boolean;
}) {
  const {
    controlsForm,
    hasSearched,
    isLoading,
    lastResultSource,
    lastSearchError,
    lastUsedFallback,
    rows,
    searchedKeyword,
  } = controller;

  const noData =
    hasSearched &&
    !isLoading &&
    !lastSearchError &&
    seedHasNoData({
      source: lastResultSource,
      usedFallback: lastUsedFallback,
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
    <div
      className={`rounded-lg border border-warning/40 bg-warning/15 px-3 py-2.5 text-base-content ${
        compact ? "mx-4 mt-2 text-xs" : "text-sm"
      }`}
      role="status"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          <p>
            <span className="font-semibold">
              DataForSEO no tiene datos de «{searchedKeyword}».
            </span>{" "}
            Es una frase demasiado específica, así que estos resultados son ideas de
            temática amplia y pueden no estar relacionados con lo que buscas.
          </p>
          {variants.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-base-content/75">Prueba con una versión más corta:</span>
              {variants.map((variant) => (
                <button
                  key={variant}
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => search(variant)}
                >
                  {variant}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-base-content/75">
              Prueba con una palabra o frase más general.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
