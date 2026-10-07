import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { countUnseenAlerts } from "@/serverFunctions/radarAlerts";

/** A notice for the Radar pages when there are alerts the user has not read. */
export function AlertsBanner({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: ["radar-alerts-unseen", projectId],
    queryFn: () => countUnseenAlerts({ data: { projectId } }),
    staleTime: 60_000,
  });
  const unseen = query.data?.unseen ?? 0;
  if (unseen === 0) return null;
  return (
    <Alert variant="warning">
      <Bell />
      <AlertTitle>
        {unseen === 1 ? "Tienes 1 aviso nuevo" : `Tienes ${unseen} avisos nuevos`}
      </AlertTitle>
      <AlertDescription className="text-foreground/80">
        Alguna de tus reglas de alerta ha saltado.{" "}
        <Link
          to="/p/$projectId/alerts"
          params={{ projectId }}
          className="font-medium underline underline-offset-2"
        >
          Ver los avisos
        </Link>
      </AlertDescription>
    </Alert>
  );
}
