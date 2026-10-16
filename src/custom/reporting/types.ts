// Shapes shared by the client-report builder, the renderer and the MCP tools.
// A report is a frozen snapshot of the Search Console analysis (so the link
// the client holds never changes under their feet) plus what the consultant
// writes and what gets ticked.
import type { DailyPoint } from "@/custom/radar/radarAnalysis";
import type { Action } from "@/custom/radar/actions";
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

export type ChangeLine = {
  key: string;
  clicks: number;
  prevClicks: number;
  clicksDelta: number;
  position: number | null;
  prevPosition: number | null;
  cause?: string;
  status: "new" | "lost" | "changed";
};

export type BandLine = {
  label: string;
  queries: number;
  prevQueries: number;
  clicks: number;
  prevClicks: number;
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

/** One thing to do, with the steps, as the client sees it in the checklist. */
export type ReportTask = {
  id: string;
  kind: Action["kind"];
  title: string;
  subtitle: string;
  stats: { label: string; value: string }[];
  lines: string[];
  steps: string[];
  gain: number | null;
  effort: Action["effort"];
  page: string | null;
  query: string | null;
};

export type ReportSnapshot = {
  version: 1;
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
  topQueries: {
    query: string;
    clicks: number;
    impressions: number;
    position: number;
  }[];
  topPages: { url: string; clicks: number; position: number }[];
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
  tasks: ReportTask[];
  updates: GoogleUpdate[];
};

/** What the consultant adds on top of the numbers. */
export type ReportNotes = {
  /** Personal message at the top, in the consultant's voice. */
  message: string;
  /** Free text under a section, by section id. */
  sectionNotes: Record<string, string>;
  /** Sections left out of the document. */
  hidden: string[];
  /** Tasks added by hand (they go after the automatic ones). */
  extraTasks: { id: string; title: string; detail: string }[];
  /** Next steps in plain text, one per line. */
  nextSteps: string;
};

export const EMPTY_NOTES: ReportNotes = {
  message: "",
  sectionNotes: {},
  hidden: [],
  extraTasks: [],
  nextSteps: "",
};

/** Task id → who ticked it and when. */
export type ReportChecks = Record<
  string,
  { at: string; by: "cliente" | "consultor" }
>;

/** The sections a report can show, in order. */
export const REPORT_SECTIONS = [
  { id: "resumen", label: "Resumen ejecutivo" },
  { id: "evolucion", label: "Evolución" },
  { id: "cambios", label: "Qué ha subido y qué ha bajado" },
  { id: "posiciones", label: "Dónde posicionas" },
  { id: "segmentos", label: "Quién te trae el tráfico" },
  { id: "oportunidades", label: "Oportunidades" },
  { id: "tareas", label: "Plan de acción" },
  { id: "google", label: "Cambios de Google en el periodo" },
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
  tasksTotal: number;
  tasksDone: number;
};

export type ReportFull = ReportSummary & {
  snapshot: ReportSnapshot;
  notes: ReportNotes;
  checks: ReportChecks;
};
