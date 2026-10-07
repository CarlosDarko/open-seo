import { createServerFn } from "@tanstack/react-start";
import { getGoogleUpdates } from "@/custom/radar/server/googleUpdatesStore";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

/** Google's ranking updates (core, spam, Discover...), to mark on the charts. */
export const listGoogleUpdates = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(() => getGoogleUpdates());
