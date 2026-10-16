import { createFileRoute } from "@tanstack/react-router";
import { ReportingPage } from "@/custom/reporting/client/ReportingPage";

export const Route = createFileRoute("/_app/p/$projectId/reporting/")({
  head: () => ({ meta: [{ title: "Reporting" }] }),
  component: ReportingRoute,
});

function ReportingRoute() {
  const { projectId } = Route.useParams();
  return <ReportingPage key={projectId} projectId={projectId} />;
}
