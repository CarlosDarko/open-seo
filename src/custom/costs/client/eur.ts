import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_COST_SETTINGS,
  FALLBACK_USD_EUR,
  formatEur,
  usdToEur,
} from "@/custom/costs/shared";
import { costSettingsQuery } from "@/custom/costs/client/queries";

/**
 * Cost formatting for any component that shows a price. Amounts computed in
 * USD (DataForSEO's currency) are converted with the ECB rate and shown in
 * euros. While the rate loads, an approximate rate is used.
 */
export function useEuros() {
  const { data } = useQuery(costSettingsQuery());
  const rate = data?.fx.rate ?? FALLBACK_USD_EUR;
  const settings = data?.settings ?? DEFAULT_COST_SETTINGS;

  return {
    rate,
    settings,
    /** "0,73 €" from a USD amount. */
    fromUsd: (usd: number) => formatEur(usdToEur(usd, rate)),
    /** Amount in euros from a USD amount. */
    toEur: (usd: number) => usdToEur(usd, rate),
    format: formatEur,
  };
}
