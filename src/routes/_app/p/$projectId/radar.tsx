import { createFileRoute } from "@tanstack/react-router";
import { RadarPage } from "@/custom/radar/client/RadarPage";

export const Route = createFileRoute("/_app/p/$projectId/radar")({
  head: () => ({ meta: [{ title: "Radar SEO" }] }),
  component: RadarRoute,
});

function RadarRoute() {
  const { projectId } = Route.useParams();
  return <RadarPage projectId={projectId} />;
}
