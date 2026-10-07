import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, X, XCircle } from "lucide-react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
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

export function CostAlertBanner({ ready }: { ready: boolean }) {
  const { data } = useQuery({ ...costSummaryQuery(), enabled: ready });
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
    <>
      {visible.map((alert) => {
        const isError = alert.level === "error";
        const Icon = isError ? XCircle : AlertTriangle;
        return (
          <Alert
            key={alert.id}
            banner
            variant={isError ? "destructive" : "warning"}
          >
            <Icon />
            <AlertTitle>{alert.title}</AlertTitle>
            <AlertDescription className="text-foreground/80">
              {alert.detail}{" "}
              <Link to="/costs" className="font-medium">
                Ver costes
              </Link>
            </AlertDescription>
            {isError ? null : (
              <AlertAction>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Ocultar hasta mañana"
                  onClick={() => dismiss(alert.id)}
                >
                  <X />
                </Button>
              </AlertAction>
            )}
          </Alert>
        );
      })}
    </>
  );
}
