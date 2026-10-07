import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/client/components/ui/skeleton";
import { LaunchView } from "@/client/features/audit/launch/LaunchView";
import { getDashboardActivation } from "@/serverFunctions/dashboard";

type Props = Parameters<typeof LaunchView>[0];

/**
 * OpenSEO's audit launcher asks for a URL every time. Inside a project the
 * site is already known, so the field arrives filled with the project's domain
 * (still editable, e.g. to audit a subfolder). Swapped in at build time by a
 * patch in custom/i18n/patches.mjs.
 */
export function ProjectLaunchView(props: Props) {
  const activation = useQuery({
    queryKey: ["dashboardActivation", props.projectId],
    queryFn: () => getDashboardActivation({ data: { projectId: props.projectId } }),
    staleTime: 5 * 60_000,
  });

  // The form takes its initial value once, so wait for the project's domain.
  if (!props.initialUrl && activation.isPending) {
    return <Skeleton className="mx-auto mt-6 h-40 w-full max-w-5xl" />;
  }

  const domain = activation.data?.domain?.trim();
  const projectUrl = domain
    ? /^https?:\/\//i.test(domain)
      ? domain
      : `https://${domain}`
    : "";

  return <LaunchView {...props} initialUrl={props.initialUrl || projectUrl} />;
}
