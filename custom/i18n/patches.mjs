// Source rewrites applied in memory while building, before translating. They
// fix text that cannot be translated as it is written upstream (for example a
// plural built by appending "s"). The upstream files stay untouched; if an
// upstream update changes the code a patch no longer matches and the build
// only prints a warning, leaving the English text in place.
//
// file: path ending of the file; from: RegExp or string; to: replacement.
export const SOURCE_PATCHES = [
  {
    // The project home is our own page (src/custom/dashboard/HomePage.tsx),
    // which reuses OpenSEO's onboarding and cards.
    file: "src/routes/_app/p/$projectId/index.tsx",
    from: 'import { DashboardPage } from "@/client/features/dashboard/DashboardPage";',
    to: 'import { HomePage as DashboardPage } from "@/custom/dashboard/HomePage";',
  },
  {
    // Inside a project the audit starts from the project's own domain
    // instead of asking for a URL (src/custom/audit/ProjectLaunchView.tsx).
    file: "src/routes/_app/p/$projectId/audit/index.tsx",
    from: 'import { LaunchView } from "@/client/features/audit/launch/LaunchView";',
    to: 'import { ProjectLaunchView as LaunchView } from "@/custom/audit/ProjectLaunchView";',
  },
  {
    // The landing page is the projects hub (src/custom/hub/HubPage.tsx)
    // instead of a redirect to the last project.
    file: "src/routes/_app/index.tsx",
    from: 'import { SUBSCRIBE_ROUTE } from "@/shared/billing";',
    to: 'import { SUBSCRIBE_ROUTE } from "@/shared/billing";\nimport { HubPage } from "@/custom/hub/HubPage";',
  },
  {
    file: "src/routes/_app/index.tsx",
    from: "component: IndexRedirect,",
    to: "component: HubPage,",
  },
  {
    // A red strip on every page while Google rolls out a ranking update
    // (src/custom/radar/client/GoogleUpdateBanner.tsx).
    file: "src/client/layout/AppShell.tsx",
    from: 'import { Sidebar } from "@/client/components/Sidebar";',
    to: 'import { Sidebar } from "@/client/components/Sidebar";\nimport { GoogleUpdateBanner } from "@/custom/radar/client/GoogleUpdateBanner";',
  },
  {
    file: "src/client/layout/AppShell.tsx",
    from: "        {banner}",
    to: "        <GoogleUpdateBanner ready={ready} />\n        {banner}",
  },
  {
    // On the projects hub (no sidebar) the content reaches the top and the
    // edges: no margin, rounded corner or border meant for the sidebar layout.
    file: "src/client/layout/AppShell.tsx",
    from: '<SidebarInset className="min-h-0 overflow-hidden md:!m-0 md:!mt-2 md:!rounded-none md:!rounded-tl-lg md:border-l md:border-t md:border-sidebar-border md:!shadow-none">',
    to: '<SidebarInset className={location.pathname === "/" ? "min-h-0 overflow-hidden md:!m-0 md:!rounded-none md:!shadow-none" : "min-h-0 overflow-hidden md:!m-0 md:!mt-2 md:!rounded-none md:!rounded-tl-lg md:border-l md:border-t md:border-sidebar-border md:!shadow-none"}>',
  },
  {
    // The projects hub (the "/" page) has no project menu: no sidebar.
    file: "src/client/layout/AppShell.tsx",
    from: /<Sidebar\s+projectId=\{sidebarProjectId\}\s+projectPending=\{sidebarProjectPending\}\s+ready=\{ready\}\s+\/>/,
    to: '{location.pathname === "/" ? null : <Sidebar projectId={sidebarProjectId} projectPending={sidebarProjectPending} ready={ready} />}',
  },
  {
    file: "src/client/layout/AppShell.tsx",
    from: "<MobileTopBar />",
    to: '{location.pathname === "/" ? null : <MobileTopBar />}',
  },
  {
    // Projects in the dropdown are listed alphabetically.
    file: "src/client/features/projects/ProjectSwitcher.tsx",
    from: "const projects = projectsQuery.data ?? [];",
    to: 'const projects = [...(projectsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));',
  },
  {
    // The project dropdown filters its list with the combobox's internal
    // text, which can keep the name of the previously selected project: the
    // list then shows only some projects, or none. With few projects there is
    // no search box, so nothing should filter.
    file: "src/client/features/projects/ProjectSwitcher.tsx",
    from: "filter={matchesProject}",
    to: "filter={projects.length > SEARCH_THRESHOLD ? matchesProject : null}",
  },
  {
    // "+ N more issue" + "s" would become "problema máss": give each plural
    // form its own whole string.
    file: "src/client/features/dashboard/DashboardCards.tsx",
    from: /\+ \{([^}]+)\} more issue\s*\{\1 === 1 \? "" : "s"\}/,
    to: '+ {$1}{" "}{$1 === 1 ? "more issue" : "more issues"}',
  },
];

export function applySourcePatches(code, file) {
  let out = code;
  for (const patch of SOURCE_PATCHES) {
    if (!file.replaceAll("\\", "/").endsWith(`/${patch.file}`)) continue;
    const hit =
      typeof patch.from === "string"
        ? out.includes(patch.from)
        : patch.from.test(out);
    if (hit) out = out.replace(patch.from, patch.to);
    else
      console.warn(
        `[i18n] Parche sin efecto en ${patch.file}: el código original cambió.`,
      );
  }
  return out;
}
