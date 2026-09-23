import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const DEBOUNCE_MS = 3000;
const MIN_GAP_MS = 10000;

/**
 * Re-reads the cost figures shortly after any query or mutation succeeds, so
 * the sidebar meter and the Costes page reflect a search a few seconds after it
 * ran instead of waiting for the next poll. Debounced and rate limited.
 */
export function useRefreshCostsAfterActivity() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastRefresh = 0;

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (Date.now() - lastRefresh < MIN_GAP_MS) return;
        lastRefresh = Date.now();
        void queryClient.invalidateQueries({ queryKey: ["costs"] });
      }, DEBOUNCE_MS);
    };

    const stopQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;
      if (event.query.queryKey[0] === "costs") return;
      schedule();
    });
    const stopMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success") {
        schedule();
      }
    });

    return () => {
      clearTimeout(timer);
      stopQueries();
      stopMutations();
    };
  }, [queryClient]);
}
