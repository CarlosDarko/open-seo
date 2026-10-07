import { useQuery } from "@tanstack/react-query";
import { listGoogleUpdates } from "@/serverFunctions/googleUpdates";

/** Google's ranking updates; they change a few times a year, so a long cache. */
export function useGoogleUpdates() {
  return useQuery({
    queryKey: ["google-updates"],
    queryFn: () => listGoogleUpdates(),
    staleTime: 6 * 60 * 60_000,
    retry: false,
  });
}
