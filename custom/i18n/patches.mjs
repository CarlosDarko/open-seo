// Source rewrites applied in memory while building, before translating. They
// fix text that cannot be translated as it is written upstream (for example a
// plural built by appending "s"). The upstream files stay untouched; if an
// upstream update changes the code a patch no longer matches and the build
// only prints a warning, leaving the English text in place.
//
// file: path ending of the file; from: RegExp or string; to: replacement.
export const SOURCE_PATCHES = [
  // The AI visibility setup runs as a chain of short Workflow instances
  // (src/custom/ai/researchStaged.ts): on the free Workers plan one invocation
  // (a whole instance, steps included) may make 50 subrequests, and the
  // upstream research went over them.
  {
    file: "src/server/workflows/AiVisibilityWorkflow.ts",
    from: 'import { runAiResearchSetup } from "@/server/features/ai-visibility/services/aiResearchKeywords";',
    to: 'import { runAiResearchSetup } from "@/server/features/ai-visibility/services/aiResearchKeywords";\nimport { runAiResearchSetupStaged, runResearchPhase } from "@/custom/ai/researchStaged";',
  },
  {
    file: "src/server/workflows/AiVisibilityWorkflow.ts",
    from: /return pgStep\(\s*step,\s*"research-setup",[\s\S]*?\{ runSeededTracking: payload\.runSeededTracking \},\s*\),\s*\);/,
    to: "return runAiResearchSetupStaged(step, { projectId: payload.setupProjectId }, payload.customer, { runSeededTracking: payload.runSeededTracking });",
  },
  {
    // A phase instance (one short slice of the research, its own invocation).
    file: "src/server/workflows/AiVisibilityWorkflow.ts",
    from: "const { payload } = event;",
    to: 'const { payload } = event;\n    if ("researchPhase" in payload) return runResearchPhase(payload);',
  },
  {
    // Prompt Research in the project's own language and market
    // (src/custom/ai/promptResearch.ts): OpenSEO's reads DataForSEO data that
    // only exists for US English.
    file: "src/server/features/ai-visibility/services/AiVisibilityService.ts",
    from: 'import { listAiResearchKeywords, researchAiPrompts } from "./aiPromptResearch";',
    to: 'import { listAiResearchKeywords } from "./aiPromptResearch";\nimport { researchAiPromptsLocal as researchAiPrompts } from "@/custom/ai/promptResearch";',
  },
  {
    // Our Prompt Research (src/custom/ai/promptResearch.ts) has not asked any
    // AI: the "brand not mentioned" badge and "answered from memory" line of
    // the original would be false. Tracking the prompt is what measures it.
    file: "src/client/features/ai-visibility/PromptResearchTable.tsx",
    from: /<Badge variant=\{prompt\.brandMentioned \? "success" : "outline"\}>[\s\S]*?<\/Badge>/,
    to: "",
  },
  {
    file: "src/client/features/ai-visibility/PromptResearchTable.tsx",
    from: "The AI answered from memory and cited no sources.",
    to: "Suggested prompt: no AI has been asked yet. Tracking it shows in which answers your brand appears and which sources they cite.",
  },
  // A city for the Prompt Research ("topic · city" travels in the keyword).
  {
    file: "src/client/features/ai-visibility/PromptResearchPage.tsx",
    from: 'import { PromptResearchKeyword } from "./PromptResearchKeyword";',
    to: 'import { Input } from "@/client/components/ui/input";\nimport { PromptResearchKeyword } from "./PromptResearchKeyword";',
  },
  {
    file: "src/client/features/ai-visibility/PromptResearchPage.tsx",
    from: 'const [draft, setDraft] = useState(keyword ?? "");',
    to: 'const [draft, setDraft] = useState((keyword ?? "").split(/ · ?/)[0]);\n  const [city, setCity] = useState((keyword ?? "").split(/ · ?/)[1] ?? "");',
  },
  {
    file: "src/client/features/ai-visibility/PromptResearchPage.tsx",
    from: "search: { q: draft.trim() },",
    to: 'search: { q: city.trim() ? draft.trim() + " · " + city.trim() : draft.trim() },',
  },
  {
    file: "src/client/features/ai-visibility/PromptResearchPage.tsx",
    from: /secondRow=\{\s*<p\s+id="ai-keyword-research-cost"[\s\S]*?<\/p>\s*\}/,
    to: 'secondRow={<div className="flex flex-wrap items-center gap-3"><Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City or area (optional)" aria-label="City or area" maxLength={60} className="h-8 w-72" /><p id="ai-keyword-research-cost" className="text-xs text-muted-foreground">About $0.25 in credits per keyword.</p></div>}',
  },
  {
    file: "src/client/features/ai-visibility/PromptResearchKeyword.tsx",
    from: "normalizeAiSuggestion(name) === normalizeAiSuggestion(keyword),",
    to: "normalizeAiSuggestion(name) === normalizeAiSuggestion(keyword.split(/ · ?/)[0]),",
  },
  {
    file: "src/client/features/ai-visibility/PromptResearchKeyword.tsx",
    from: ") ?? keyword,",
    to: ") ?? keyword.split(/ · ?/)[0],",
  },
  {
    // The research works without a tracker (nothing is created on its own now).
    file: "src/client/features/ai-visibility/PromptResearchPage.tsx",
    from: "{!state?.configured ? (",
    to: "{false ? (",
  },
  {
    file: "src/client/features/ai-visibility/PromptResearchKeyword.tsx",
    from: "<TableBulkActionBar",
    to: '{!state.configured && <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground border-border">Prompt tracking does not exist yet. Tracking your first prompt creates it: weekly checks, the first one in 7 days, so nothing is charged until then.</p>}\n      <TableBulkActionBar',
  },
  {
    file: "src/client/features/ai-visibility/PromptResearchPage.tsx",
    from: "search: { q: keyword },",
    to: 'search: { q: keyword + " · " },',
  },
  {
    file: "src/client/features/ai-visibility/PromptResearchPage.tsx",
    from: "search={{ q: keyword }}",
    to: 'search={{ q: keyword + " · " }}',
  },
  {
    file: "src/client/features/ai-visibility/PromptResearchKeyword.tsx",
    from: "staleTime: 60 * 60 * 1000,",
    to: "enabled: !/ ·( )*$/.test(keyword),\n    staleTime: 60 * 60 * 1000,",
  },
  {
    file: "src/client/features/ai-visibility/PromptResearchKeyword.tsx",
    from: "isLoading={research.isPending}",
    to: "isLoading={research.isPending && !/ ·( )*$/.test(keyword)}",
  },
  {
    file: "src/client/features/ai-visibility/PromptResearchKeyword.tsx",
    from: "title: `No prompts found for “${keyword}”`,",
    to: 'title: / ·( )*$/.test(keyword) ? "Add a city if you want, then press Search" : `No prompts found for “${keyword}”`,',
  },
  {
    file: "src/client/features/ai-visibility/PromptResearchKeyword.tsx",
    from: 'description: "Try a shorter, broader term.",',
    to: 'description: / ·( )*$/.test(keyword) ? "Nothing is searched until you press Search, so it is not charged twice." : "Try a shorter, broader term.",',
  },
  {
    // Almost no prompt has sources here: the Sources column and its
    // expander only said "No sources", so the table keeps just the prompt.
    file: "src/client/features/ai-visibility/PromptResearchTable.tsx",
    from: "...promptColumns,",
    to: "...promptColumns.slice(0, 1),",
  },
  {
    // The page types of the client (examples audited by the reports).
    file: "src/client/features/projects/project-context/ProjectContextPage.tsx",
    from: 'import { KeyPagesSection } from "./KeyPagesSection";',
    to: 'import { KeyPagesSection } from "./KeyPagesSection";\nimport { PageTypesSection } from "@/custom/reporting/client/PageTypesSection";',
  },
  {
    // The page types of the client (examples audited by the reports).
    file: "src/client/features/projects/project-context/ProjectContextPage.tsx",
    from: "<KeyPagesSection projectId={projectId} keyPages={context.keyPages} />",
    to: "<KeyPagesSection projectId={projectId} keyPages={context.keyPages} />\n\n          <PageTypesSection projectId={projectId} />",
  },
  {
    // Nothing is tracked on its own: after the brand research OpenSEO used to
    // create the tracker with the first three topics and run a first
    // measurement. Only the prompts picked by hand are tracked.
    file: "src/server/features/ai-visibility/services/websiteTrackingSetup.ts",
    from: "!input.suggestedTopics?.length ||",
    to: "true ||",
  },
  // The brand research of "AI visibility" runs as ONE Workflow step, and the
  // free Workers plan allows 50 subrequests per invocation: reading five
  // competitor sites (each one discovers and fetches several pages) plus the
  // model steps went over and the step failed ("Too many subrequests"). These
  // limits keep one run within it: fewer model steps, three competitor sites,
  // one page each, two pages of the own site.
  {
    file: "src/server/features/projects/services/websiteResearch.ts",
    from: "stopWhen: stepCountIs(7),",
    to: "stopWhen: stepCountIs(5),",
  },
  {
    file: "src/server/features/projects/services/websiteResearch.ts",
    from: "if (sitesRead > 5)",
    to: "if (sitesRead > 3)",
  },
  {
    file: "src/server/features/projects/services/websiteResearch.ts",
    from: "Read at most five businesses in total.",
    to: "Read at most three businesses in total.",
  },
  {
    file: "src/server/features/projects/services/websiteResearch.ts",
    from: "domains: z.array(z.string().min(1).max(255)).min(1).max(5),",
    to: "domains: z.array(z.string().min(1).max(255)).min(1).max(3),",
  },
  {
    file: "src/server/features/projects/services/websiteResearch.ts",
    from: "const pages = (await readSite(candidate, 2)).pages;",
    to: "const pages = (await readSite(candidate, 1)).pages;",
  },
  {
    file: "src/server/features/projects/services/websiteResearch.ts",
    from: "? await readSite(project.domain ? `https://${domain}` : website, 3)",
    to: "? await readSite(project.domain ? `https://${domain}` : website, 2)",
  },
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
