import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Coins } from "lucide-react";
import { costSummaryQuery } from "@/custom/costs/client/queries";
import { formatEur } from "@/custom/costs/shared";

/**
 * Small "spent this month" card at the bottom of the sidebar. It shows the
 * month's spend against the budget and the DataForSEO balance, always in
 * euros, and links to the full Costes page.
 */
export function SidebarCostMeter({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useQuery(costSummaryQuery());
  if (!data) return null;

  const budget = data.settings.monthlyBudgetEur;
  const pct = budget > 0 ? (data.monthEur / budget) * 100 : 0;
  const hasError = data.alerts.some((alert) => alert.level === "error");
  const hasWarning = data.alerts.length > 0;
  const barClass = hasError
    ? "progress-error"
    : hasWarning
      ? "progress-warning"
      : "progress-primary";

  return (
    <Link
      to="/costs"
      onClick={onNavigate}
      className="mb-1 block rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-xs transition-colors hover:border-primary/60"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium text-base-content/80">
          <Coins className="size-3.5" />
          Gasto del mes
        </span>
        <span className="tabular-nums font-semibold">{formatEur(data.monthEur)}</span>
      </div>
      {budget > 0 ? (
        <progress
          className={`progress ${barClass} mt-1.5 h-1.5 w-full`}
          value={Math.min(pct, 100)}
          max={100}
        />
      ) : null}
      <div className="mt-1 flex justify-between text-base-content/50">
        <span>{budget > 0 ? `de ${formatEur(budget)}` : "sin presupuesto"}</span>
        {data.balanceEur !== null ? (
          <span>Saldo {formatEur(data.balanceEur)}</span>
        ) : null}
      </div>
    </Link>
  );
}
