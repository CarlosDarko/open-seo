import { createFileRoute } from "@tanstack/react-router";
import { AlertsPage } from "@/custom/radar/client/AlertsPage";

export const Route = createFileRoute("/_app/p/$projectId/alerts")({
  head: () => ({ meta: [{ title: "Alertas" }] }),
  component: AlertsPageRoute,
});

function AlertsPageRoute() {
  const { projectId } = Route.useParams();
  return <AlertsPage projectId={projectId} />;
}
