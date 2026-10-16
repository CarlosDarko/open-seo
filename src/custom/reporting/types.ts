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
};

export type BandLine = {
  label: string;
  queries: number;
  prevQueries: number;
  clicks: number;
  prevClicks: number;
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
  version: 3;
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
  pageWinners: ChangeLine[];
  pageLosers: ChangeLine[];
  queryWinners: ChangeLine[];
  queryLosers: ChangeLine[];
  newQueries: number;
  lostQueries: number;
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
};

export const EMPTY_NOTES: ReportNotes = {
  message: "",
  sectionNotes: {},
  hidden: [],
  nextSteps: "",
  diagnoses: [],
  titleIdeas: [],
};

/** The sections a report can show, in order. */
export const REPORT_SECTIONS = [
  { id: "hallazgos", label: "Lo esencial (hallazgos)" },
  { id: "evolucion", label: "Evolución y cambios de Google" },
  { id: "origen", label: "De dónde viene el cambio" },
  { id: "posiciones", label: "Posicionamiento" },
  { id: "temas", label: "Temas" },
  { id: "consultas", label: "Búsquedas estrella" },
  { id: "reparto", label: "Quién te trae el tráfico" },
  { id: "semana", label: "Patrón semanal" },
  { id: "oportunidades", label: "Oportunidades" },
  { id: "titulos", label: "Propuestas de títulos (IA)" },
  { id: "diagnostico", label: "Diagnóstico de páginas (IA)" },
  { id: "tecnico", label: "Salud técnica (sitemap e indexación)" },
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
};

export type ReportFull = ReportSummary & {
  snapshot: ReportSnapshot;
  notes: ReportNotes;
};
