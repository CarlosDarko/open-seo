import { createFileRoute } from "@tanstack/react-router";
import { DiscoverPage } from "@/custom/radar/client/DiscoverPage";

export const Route = createFileRoute("/_app/p/$projectId/discover")({
  head: () => ({ meta: [{ title: "Discover" }] }),
  component: DiscoverRoute,
});

function DiscoverRoute() {
  const { projectId } = Route.useParams();
  return <DiscoverPage projectId={projectId} />;
}
