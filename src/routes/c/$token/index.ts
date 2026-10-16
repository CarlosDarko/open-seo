import { createFileRoute } from "@tanstack/react-router";
import { renderPublicReport } from "@/custom/reporting/server/reportRoutes";

// The client's view of a report: a raw-Response route (no app shell, no
// sign-in), reached through an Access bypass for /c/*. Anyone holding the
// 32-character token can read it while sharing is on.
export const Route = createFileRoute("/c/$token/")({
  server: {
    handlers: {
      GET: ({ params }) => renderPublicReport(params.token),
    },
  },
});
