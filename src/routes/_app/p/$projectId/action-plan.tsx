import { createFileRoute } from "@tanstack/react-router";
import { ActionPlanPage } from "@/custom/radar/client/ActionPlanPage";

export const Route = createFileRoute("/_app/p/$projectId/action-plan")({
  head: () => ({ meta: [{ title: "Plan de acción" }] }),
  component: ActionPlanRoute,
});

function ActionPlanRoute() {
  const { projectId } = Route.useParams();
  return <ActionPlanPage projectId={projectId} />;
}
