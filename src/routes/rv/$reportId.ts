import { createFileRoute } from "@tanstack/react-router";
import { renderReportPreview } from "@/custom/reporting/server/reportRoutes";

// The consultant's preview of a report (works before it is shared). Does its
// own sign-in check, like /r/$reportId, so it stays a raw-Response route.
export const Route = createFileRoute("/rv/$reportId")({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        renderReportPreview(params.reportId, request),
    },
  },
});
