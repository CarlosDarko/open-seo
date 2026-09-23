import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, X, XCircle } from "lucide-react";
import { costSummaryQuery } from "@/custom/costs/client/queries";
import { madridDay } from "@/custom/costs/shared";

// A dismissed alert stays hidden for the rest of the day (Madrid time). Errors
// (budget exceeded, balance almost gone) come back on the next page load.

const STORAGE_KEY = "costs:dismissed-alerts";

function readDismissed(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeDismissed(value: Record<string, string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode: the banner just reappears next time.
  }
}

export function CostAlertBanner() {
  const { data } = useQuery(costSummaryQuery());
  const [dismissed, setDismissed] = useState<Record<string, string>>(() =>
    readDismissed(),
  );
  const today = madridDay();

  const visible = (data?.alerts ?? []).filter(
    (alert) => alert.level === "error" || dismissed[alert.id] !== today,
  );
  if (visible.length === 0) return null;

  function dismiss(id: string) {
    const next = { ...dismissed, [id]: today };
    setDismissed(next);
    writeDismissed(next);
  }

  return (
    <div className="shrink-0 space-y-2 px-4 py-2.5 md:px-6">
      <div className="mx-auto max-w-7xl space-y-2">
        {visible.map((alert) => {
          const Icon = alert.level === "error" ? XCircle : AlertTriangle;
          return (
            <div
              key={alert.id}
              className={`alert ${alert.level === "error" ? "alert-error" : "alert-warning"}`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="text-sm">
                <span className="font-medium">{alert.title}.</span> {alert.detail}{" "}
                <Link to="/costs" className="link font-medium">
                  Ver costes
                </Link>
              </span>
              {alert.level !== "error" ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-circle"
                  aria-label="Ocultar hasta mañana"
                  onClick={() => dismiss(alert.id)}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
