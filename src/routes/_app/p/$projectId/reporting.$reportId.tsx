import { createFileRoute } from "@tanstack/react-router";
import { ReportEditor } from "@/custom/reporting/client/ReportEditor";

export const Route = createFileRoute("/_app/p/$projectId/reporting/$reportId")({
  head: () => ({ meta: [{ title: "Editar informe" }] }),
  component: ReportEditorRoute,
});

function ReportEditorRoute() {
  const { projectId, reportId } = Route.useParams();
  return <ReportEditor key={projectId} projectId={projectId} reportId={reportId} />;
}
