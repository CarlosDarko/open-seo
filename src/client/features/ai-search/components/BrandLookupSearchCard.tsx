import { useRef, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { CostConfirmModal } from "@/custom/costs/client/CostConfirmModal";
import { useEuros } from "@/custom/costs/client/eur";
import { applyBillingMarkupUsd } from "@/shared/billing";
import { ResearchScopeSelect } from "@/client/components/ResearchScopeSelect";
import type { ResearchScope } from "@/shared/researchScope";
import { BRAND_LOOKUP_MAX_INPUT_LENGTH } from "@/types/schemas/ai-search";

type Props = {
  query: string;
  onQueryChange: (next: string) => void;
  scope: ResearchScope;
  onScopeChange: (next: ResearchScope) => void;
  scopeDisabledReason: string | undefined;
  competitors: string;
  onCompetitorsChange: (next: string) => void;
  onSubmit: (event: FormEvent) => void;
  isLoading: boolean;
  validationError: { field: "query" | "competitors"; message: string } | null;
};

/**
 * One brand lookup = 6 DataForSEO calls (aggregated_metrics + top_pages +
 * mentions_search × 2 platforms). Rounded up with headroom because
 * mentions_search is row-priced at the full 100-row sample per platform.
 */
const BRAND_LOOKUP_RAW_COST_USD = 0.85;

/**
 * Adding competitors triggers 2 extra cross_aggregated_metrics calls (one per
 * platform). Measured live (Jun 2026) at $0.101 each — $0.202 total for a
 * 4-group comparison — via `pnpm billing:brand-lookup --competitors=...`. A
 * fixed estimate, marked up once at module load exactly like the base.
 */
const BRAND_LOOKUP_COMPETITOR_RAW_COST_USD = 0.2;

// Hosted customers are billed the marked-up USD; self-hosted users pay
// DataForSEO directly at the raw rate.
const markup = (rawUsd: number) =>
  isHostedClientAuthMode() ? applyBillingMarkupUsd(rawUsd) : rawUsd;

const BRAND_LOOKUP_DISPLAYED_COST_USD = markup(BRAND_LOOKUP_RAW_COST_USD);
const BRAND_LOOKUP_COMPETITOR_DISPLAYED_COST_USD = markup(
  BRAND_LOOKUP_COMPETITOR_RAW_COST_USD,
);

export function BrandLookupSearchCard({
  query,
  onQueryChange,
  scope,
  onScopeChange,
  scopeDisabledReason,
  competitors,
  onCompetitorsChange,
  onSubmit,
  isLoading,
  validationError,
}: Props) {
  const hasCompetitors = competitors.trim().length > 0;
  const queryError = validationError?.field === "query";
  const competitorsError = validationError?.field === "competitors";

  // Fork: costs are shown in euros, and a lookup above the confirmation
  // threshold (Costes → Presupuesto y avisos) asks before spending.
  const euros = useEuros();
  const pendingEvent = useRef<FormEvent | null>(null);
  const [confirming, setConfirming] = useState(false);
  const estimateUsd =
    BRAND_LOOKUP_DISPLAYED_COST_USD +
    (hasCompetitors ? BRAND_LOOKUP_COMPETITOR_DISPLAYED_COST_USD : 0);
  const needsConfirmation =
    !isHostedClientAuthMode() &&
    query.trim().length > 0 &&
    euros.toEur(estimateUsd) >= euros.settings.confirmAboveEur;

  function handleSubmit(event: FormEvent) {
    if (!needsConfirmation) {
      onSubmit(event);
      return;
    }
    event.preventDefault();
    pendingEvent.current = event;
    setConfirming(true);
  }

  return (
    <div className="card border border-base-300 bg-base-100">
      {confirming ? (
        <CostConfirmModal
          title="Búsqueda de marca en IA"
          estimateEur={euros.toEur(estimateUsd)}
          details={
            hasCompetitors
              ? "Consulta ChatGPT y Google AI Overview e incluye la comparación con competidores."
              : "Consulta ChatGPT y Google AI Overview (6 consultas de pago). Repetir la misma búsqueda no vuelve a cobrar."
          }
          confirmLabel="Buscar"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            if (pendingEvent.current) onSubmit(pendingEvent.current);
          }}
        />
      ) : null}
      <div className="card-body gap-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label
              className={`input input-bordered flex flex-1 items-center gap-2 ${
                queryError ? "input-error" : ""
              }`}
            >
              <Search className="size-4 text-base-content/60" />
              <input
                type="text"
                placeholder="Enter a brand name or domain"
                value={query}
                maxLength={BRAND_LOOKUP_MAX_INPUT_LENGTH}
                onChange={(event) => onQueryChange(event.target.value)}
                aria-invalid={queryError || undefined}
                aria-describedby={
                  queryError ? "brand-lookup-input-error" : undefined
                }
                autoComplete="off"
                spellCheck={false}
                className="grow"
              />
            </label>

            <ResearchScopeSelect
              value={scope}
              onChange={onScopeChange}
              disabledReason={scopeDisabledReason}
            />

            <button
              type="submit"
              className="btn btn-primary shrink-0 px-6"
              disabled={isLoading}
            >
              {isLoading ? "Looking up..." : "Look up"}
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <input
              type="text"
              placeholder="Add competitors (comma-separated)"
              value={competitors}
              onChange={(event) => onCompetitorsChange(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={`input input-bordered w-full ${
                competitorsError ? "input-error" : ""
              }`}
              aria-label="Competitors"
              aria-invalid={competitorsError || undefined}
              aria-describedby={
                competitorsError ? "brand-lookup-input-error" : undefined
              }
            />
            <p className="text-xs text-base-content/60">
              Add up to 5 competitor brands or domains to see your Share of
              Voice.
            </p>
          </div>
        </form>

        {validationError ? (
          <p id="brand-lookup-input-error" className="text-sm text-error">
            {validationError.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 text-xs text-base-content/60">
          <p className="tabular-nums">
            Est.{" "}
            <span className="font-medium text-base-content/80">
              {euros.fromUsd(BRAND_LOOKUP_DISPLAYED_COST_USD)}
            </span>
            {hasCompetitors ? (
              <span>
                {" "}
                más ~{euros.fromUsd(BRAND_LOOKUP_COMPETITOR_DISPLAYED_COST_USD)}{" "}
                por comparar competidores
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}
