// Shapes shared by the client-report builder, the renderer and the MCP tools.
// A report is a frozen snapshot of the Search Console analysis (so the link
// the client holds never changes under their feet) plus what the consultant
// writes on top.
import type { DailyPoint } from "@/custom/radar/radarAnalysis";
import type { GoogleUpdate } from "@/custom/radar/googleUpdates";

export type Totals = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SegmentLine = {
  label: string;
  clicks: number;
  prevClicks: number;
  impressions: number;
  share: number;
};

export type QueryMove = {
  query: string;
  clicksDelta: number;
  position: number | null;
  prevPosition: number | null;
};

export type ChangeLine = {
  key: string;
  clicks: number;
  prevClicks: number;
  clicksDelta: number;
  position: number | null;
  prevPosition: number | null;
  cause?: string;
  /** The queries that explain most of a page's change. */
  queries?: QueryMove[];
  status: "new" | "lost" | "changed";
};

export type BandMove = {
  query: string;
  position: number | null;
  prevPosition: number | null;
  impressions: number;
};

/** One search with its figures, to list it in a table. */
export type QueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  position: number | null;
  prevClicks: number;
  prevPosition: number | null;
};

/** A page with the figures of both periods, to list and sort it. */
export type PageRow = {
  url: string;
  clicks: number;
  prevClicks: number;
  impressions: number;
  prevImpressions: number;
  position: number | null;
  prevPosition: number | null;
};

/** A search with the figures of both periods, to list and sort it. */
export type QueryTableRow = {
  query: string;
  brand: boolean;
  clicks: number;
  prevClicks: number;
  impressions: number;
  prevImpressions: number;
  position: number | null;
  prevPosition: number | null;
};

/** The score of one category of a Microaudit audit. */
export type AuditCategory = {
  id: number;
  name: string;
  score: number | null;
  fails: number;
  warns: number;
  /** How many checks of the category passed. */
  passed: number;
};

/** One thing Microaudit says to fix, with the points it would add. */
export type AuditIssue = {
  kind: "fail" | "warn";
  title: string;
  category: string;
  points: number | null;
  /** What Microaudit explains about it. */
  detail: string;
  /** The measured evidence ("palabras/frase: 26.5"). */
  evidence: string;
  /** Elements that show the problem (image names, bots, pages…). */
  elements: string[];
  /** Official documentation Microaudit links to. */
  sources: { label: string; url: string }[];
};

/** Microaudit's audit of one example page of a page type (home, category,
 *  product, blog…). */
export type AuditPage = {
  type: string;
  url: string;
  score: number | null;
  rating: string;
  checkedAt: string;
  categories: AuditCategory[];
  issues: AuditIssue[];
};

export type BandLine = {
  label: string;
  queries: number;
  prevQueries: number;
  clicks: number;
  prevClicks: number;
  /** How many searches entered / left the band, and the biggest of each. */
  enteredCount: number;
  leftCount: number;
  entered: BandMove[];
  left: BandMove[];
};

export type OpportunityLine = {
  query: string;
  page: string | null;
  position: number;
  impressions: number;
  clicks: number;
  potentialClicks: number;
  kind: "snippet" | "push";
};

export type PageLine = {
  url: string;
  clicks: number;
  prevClicks: number;
};

export type TopicLine = {
  label: string;
  clicks: number;
  prevClicks: number;
  impressions: number;
  position: number;
  queries: number;
  /** Share of the topic that sits in positions 4 to 20 (within reach). */
  nearTopShare: number;
  topQueries: { query: string; clicks: number; position: number }[];
};

export type ReportSnapshot = {
  version: 4;
  generatedAt: string;
  siteUrl: string;
  range: { startDate: string; endDate: string };
  period: {
    compare: "previous" | "year";
    comparable: boolean;
    days: number;
    prevStartDate: string;
    prevEndDate: string;
  };
  scope: "sin marca" | "todo";
  totals: Totals;
  prevTotals: Totals;
  daily: DailyPoint[];
  /** Brand vs everything else, in clicks. */
  brand: {
    hasBrand: boolean;
    clicks: number;
    prevClicks: number;
    otherClicks: number;
    prevOtherClicks: number;
  };
  topQueries: {
    query: string;
    clicks: number;
    impressions: number;
    position: number;
  }[];
  /** The pages with most clicks (all queries) and the clicks of every page. */
  topPages: PageLine[];
  pageClicksTotal: number;
  /** The 60 pages with most clicks, with the previous period's figures. */
  pages: PageRow[];
  /** How many different pages received clicks. */
  pageCount: number;
  /** The 120 searches with most clicks (brand included, flagged). */
  queryRows: QueryTableRow[];
  /** How many different searches showed the site. */
  queryCount: number;
  /** Microaudit audits of the example pages of each page type. */
  audits: AuditPage[];
  pageWinners: ChangeLine[];
  pageLosers: ChangeLine[];
  queryWinners: ChangeLine[];
  queryLosers: ChangeLine[];
  /** How many searches appeared / disappeared, and the biggest of each. */
  newQueries: number;
  lostQueries: number;
  newQueriesList: QueryRow[];
  lostQueriesList: QueryRow[];
  /** The main searches of each position band, in the order of `bands`. */
  queriesByBand: QueryRow[][];
  bands: BandLine[];
  segments: {
    device: SegmentLine[];
    pageType: SegmentLine[];
    intent: SegmentLine[];
  };
  opportunities: OpportunityLine[];
  updates: GoogleUpdate[];
  topics: TopicLine[];
  /** Sitemap against Google; null when it could not be read. */
  health: {
    inSitemap: number;
    pagesWithImpressions: number;
    unseen: number;
    notInSitemap: number;
    sitemapErrors: number;
  } | null;
  /** Google Discover traffic; null when the site gets none. */
  discover: {
    clicks: number;
    prevClicks: number;
    impressions: number;
    topPages: PageLine[];
  } | null;
};

/** A page that lost traffic, explained by the AI after reading it. */
export type Diagnosis = {
  url: string;
  /** What is most likely going on, in plain Spanish. */
  text: string;
  /** Concrete things to change. */
  fixes: string[];
};

/** New title and description ideas for a search that is seen but not clicked. */
export type TitleIdea = {
  query: string;
  url: string | null;
  current: string | null;
  options: { title: string; description: string }[];
};

/** The AI's reading of one opportunity: what is going on and what to do. */
export type OpportunityIdea = {
  query: string;
  analysis: string;
  actions: string[];
};

/** A piece of content worth creating, with the reason. */
export type ContentIdea = { title: string; reason: string };

/** What the consultant adds on top of the numbers. */
export type ReportNotes = {
  /** Personal message after the cover, in the consultant's voice. */
  message: string;
  /** Free text under a section, by section id. */
  sectionNotes: Record<string, string>;
  /** Sections left out of the document. */
  hidden: string[];
  /** Next steps in plain text, one per line. */
  nextSteps: string;
  /** AI diagnoses of the pages that fell (reviewed by the consultant). */
  diagnoses: Diagnosis[];
  /** AI title and description ideas (reviewed by the consultant). */
  titleIdeas: TitleIdea[];
  /** AI reading of the opportunities (reviewed by the consultant). */
  opportunityIdeas: OpportunityIdea[];
  /** AI ideas for new content (reviewed by the consultant). */
  contentIdeas: ContentIdea[];
};

export const EMPTY_NOTES: ReportNotes = {
  message: "",
  sectionNotes: {},
  hidden: [],
  nextSteps: "",
  diagnoses: [],
  titleIdeas: [],
  opportunityIdeas: [],
  contentIdeas: [],
};

/** The sections a report can show, in order. */
export const REPORT_SECTIONS = [
  { id: "hallazgos", label: "Conclusiones detalladas" },
  { id: "evolucion", label: "Evolución y actualizaciones de Google" },
  { id: "origen", label: "Páginas" },
  { id: "posiciones", label: "Posicionamiento" },
  { id: "temas", label: "Temas" },
  { id: "consultas", label: "Búsquedas" },
  { id: "reparto", label: "De dónde vienen los clics" },
  { id: "semana", label: "Distribución semanal" },
  { id: "oportunidades", label: "Oportunidades de crecimiento" },
  { id: "titulos", label: "Propuestas de títulos (IA)" },
  { id: "diagnostico", label: "Diagnóstico de páginas (IA)" },
  { id: "auditoria", label: "Auditoría técnica de páginas tipo (Microaudit)" },
  { id: "tecnico", label: "Cobertura del sitemap" },
  { id: "discover", label: "Google Discover" },
  { id: "proximos", label: "Próximos pasos" },
] as const;

export type SectionId = (typeof REPORT_SECTIONS)[number]["id"];

export type ReportSummary = {
  id: string;
  projectId: string;
  token: string;
  title: string;
  clientName: string | null;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  range: { startDate: string; endDate: string };
  /** What the AI has cost for this report, in euros, and how many calls. */
  aiCostEur: number;
  aiCalls: number;
};

export type ReportFull = ReportSummary & {
  snapshot: ReportSnapshot;
  notes: ReportNotes;
};
