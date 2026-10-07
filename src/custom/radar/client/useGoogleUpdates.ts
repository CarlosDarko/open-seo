import { useQuery } from "@tanstack/react-query";
import { listGoogleUpdates } from "@/serverFunctions/googleUpdates";

/** Google's ranking updates; they change a few times a year, so a long cache.
 *  `enabled` waits for the session where the caller can run before it. */
export function useGoogleUpdates(enabled = true) {
  return useQuery({
    queryKey: ["google-updates"],
    queryFn: () => listGoogleUpdates(),
    staleTime: 6 * 60 * 60_000,
    retry: false,
    enabled,
  });
}
