import { TermChipsField } from "@/custom/keywords/client/TermChipsField";
import type { TermFilters, TermMatch } from "@/custom/keywords/termFilters";

/**
 * The "Filtrar antes de buscar" row under the keyword search bar: two chip
 * fields ("Debe contener" / "Excluir"), each with its own Y | O switch.
 * Controlled; the search bar keeps the values in its form.
 */
export function TermFiltersBlock({
  filters,
  onIncludeTerms,
  onIncludeMatch,
  onExcludeTerms,
  onExcludeMatch,
}: {
  filters: TermFilters;
  onIncludeTerms: (terms: string[]) => void;
  onIncludeMatch: (match: TermMatch) => void;
  onExcludeTerms: (terms: string[]) => void;
  onExcludeMatch: (match: TermMatch) => void;
}) {
  const includeMany = filters.includeTerms.length > 1;
  const excludeMany = filters.excludeTerms.length > 1;

  return (
    <div className="mt-1 space-y-3 border-t border-border pt-3">
      <div>
        <p className="text-sm font-semibold">
          Filtrar antes de buscar{" "}
          <span className="font-normal text-muted-foreground">(opcional)</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Se aplican en DataForSEO antes del límite de resultados: tus 150, 300
          o 500 resultados salen ya filtrados.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TermChipsField
          tone="include"
          label="Debe contener"
          help={
            !includeMany
              ? "Solo palabras clave que incluyan esta palabra."
              : filters.includeMatch === "any"
                ? "Palabras clave que incluyan al menos una de estas palabras (O)."
                : "Solo palabras clave que incluyan todas estas palabras a la vez (Y)."
          }
          placeholder="p. ej. gratis, precio"
          value={filters.includeTerms}
          onChange={onIncludeTerms}
          match={filters.includeMatch}
          onMatchChange={onIncludeMatch}
          matchTitles={{
            all: "Y: deben aparecer todas las palabras",
            any: "O: basta con que aparezca una",
          }}
        />
        <TermChipsField
          tone="exclude"
          label="Excluir"
          help={
            !excludeMany
              ? "Se descartan las que incluyan esta palabra."
              : filters.excludeMatch === "all"
                ? "Se descartan solo las que incluyan todas estas palabras a la vez (Y)."
                : "Se descartan las que incluyan cualquiera de estas palabras (O)."
          }
          placeholder="p. ej. madrid, barcelona"
          value={filters.excludeTerms}
          onChange={onExcludeTerms}
          match={filters.excludeMatch}
          onMatchChange={onExcludeMatch}
          matchTitles={{
            all: "Y: se descarta solo si aparecen todas juntas",
            any: "O: se descarta si aparece cualquiera",
          }}
        />
      </div>
    </div>
  );
}
