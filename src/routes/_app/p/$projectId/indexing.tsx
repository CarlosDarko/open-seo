import { createFileRoute } from "@tanstack/react-router";
import { IndexingPage } from "@/custom/radar/client/IndexingPage";

export const Route = createFileRoute("/_app/p/$projectId/indexing")({
  head: () => ({ meta: [{ title: "Indexación" }] }),
  component: IndexingPageRoute,
});

function IndexingPageRoute() {
  const { projectId } = Route.useParams();
  return <IndexingPage projectId={projectId} />;
}
