import { createFileRoute } from "@tanstack/react-router";
import { handleCheck } from "@/custom/reporting/server/reportRoutes";

export const Route = createFileRoute("/c/$token/check")({
  server: {
    handlers: {
      POST: ({ params, request }) => handleCheck(params.token, request),
    },
  },
});
