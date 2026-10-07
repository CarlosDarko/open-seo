import { createFileRoute } from "@tanstack/react-router";
import { TopicsPage } from "@/custom/radar/client/TopicsPage";

export const Route = createFileRoute("/_app/p/$projectId/topics")({
  head: () => ({ meta: [{ title: "Temas" }] }),
  component: TopicsPageRoute,
});

function TopicsPageRoute() {
  const { projectId } = Route.useParams();
  return <TopicsPage projectId={projectId} />;
}
