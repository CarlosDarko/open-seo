import { env } from "cloudflare:workers";
import {
  EMPTY_NOTES,
  type ReportFull,
  type ReportNotes,
  type ReportSnapshot,
  type ReportSummary,
} from "@/custom/reporting/types";

// Storage of the client reports (migration 0904_client_reports.sql). Reads
// that only list reports leave the snapshot column alone, and every query
// that takes a report id also takes the project id, so a report is never
// reachable through another project.

type Row = {
  id: string;
  project_id: string;
  token: string;
  title: string;
  client_name: string | null;
  shared: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  snapshot_json: string;
  notes_json: string;
  checks_json: string;
  ai_cost_eur: number | null;
  ai_calls: number | null;
};

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function summaryOf(row: Row, snapshot: ReportSnapshot): ReportSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    token: row.token,
    title: row.title,
    clientName: row.client_name,
    shared: row.shared === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    range: snapshot.range,
    aiCostEur: row.ai_cost_eur ?? 0,
    aiCalls: row.ai_calls ?? 0,
  };
}

/** Reports saved by an earlier version lack some fields: fill them in so the
 *  current design can always draw them (a refresh brings the real data). */
export function normalizeSnapshot(
  raw: Partial<ReportSnapshot>,
): ReportSnapshot {
  const empty = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return {
    version: 3,
    generatedAt: raw.generatedAt ?? new Date().toISOString(),
    siteUrl: raw.siteUrl ?? "",
    range: raw.range ?? { startDate: "2000-01-01", endDate: "2000-01-01" },
    period: raw.period ?? {
      compare: "previous",
      comparable: false,
      days: 28,
      prevStartDate: "",
      prevEndDate: "",
    },
    scope: raw.scope ?? "todo",
    totals: raw.totals ?? empty,
    prevTotals: raw.prevTotals ?? empty,
    daily: raw.daily ?? [],
    brand: raw.brand ?? {
      hasBrand: false,
      clicks: 0,
      prevClicks: 0,
      otherClicks: 0,
      prevOtherClicks: 0,
    },
    topQueries: raw.topQueries ?? [],
    topPages: (raw.topPages ?? []).map((page) => ({
      ...page,
      prevClicks: page.prevClicks ?? 0,
    })),
    pageClicksTotal: raw.pageClicksTotal ?? 0,
    pageWinners: raw.pageWinners ?? [],
    pageLosers: raw.pageLosers ?? [],
    queryWinners: raw.queryWinners ?? [],
    queryLosers: raw.queryLosers ?? [],
    newQueries: raw.newQueries ?? 0,
    lostQueries: raw.lostQueries ?? 0,
    bands: (raw.bands ?? []).map((band) => ({
      ...band,
      entered: band.entered ?? [],
      left: band.left ?? [],
    })),
    segments: {
      device: raw.segments?.device ?? [],
      pageType: raw.segments?.pageType ?? [],
      intent: raw.segments?.intent ?? [],
    },
    opportunities: raw.opportunities ?? [],
    updates: raw.updates ?? [],
    topics: raw.topics ?? [],
    health: raw.health ?? null,
    discover: raw.discover ?? null,
  };
}

function fullOf(row: Row): ReportFull {
  const snapshot = normalizeSnapshot(
    parseJson<Partial<ReportSnapshot>>(row.snapshot_json, {}),
  );
  const notes = {
    ...EMPTY_NOTES,
    ...parseJson<ReportNotes>(row.notes_json, EMPTY_NOTES),
  };
  return { ...summaryOf(row, snapshot), snapshot, notes };
}

/** 32 URL-safe characters: the same shape upstream uses for share tokens. */
export function mintToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function insertReport(input: {
  projectId: string;
  title: string;
  clientName: string | null;
  createdBy: string | null;
  snapshot: ReportSnapshot;
  notes: ReportNotes;
}): Promise<ReportFull> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const token = mintToken();
  await env.DB.prepare(
    `INSERT INTO client_reports
      (id, project_id, token, title, client_name, shared, created_at, updated_at, created_by, snapshot_json, notes_json, checks_json)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, '{}')`,
  )
    .bind(
      id,
      input.projectId,
      token,
      input.title,
      input.clientName,
      now,
      now,
      input.createdBy,
      JSON.stringify(input.snapshot),
      JSON.stringify(input.notes),
    )
    .run();
  const created = await getReport(input.projectId, id);
  if (!created) throw new Error("No se pudo guardar el informe");
  return created;
}

export async function listReports(projectId: string): Promise<ReportSummary[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM client_reports WHERE project_id = ? ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(projectId)
    .all<Row>();
  return results.map((row) =>
    summaryOf(
      row,
      normalizeSnapshot(
        parseJson<Partial<ReportSnapshot>>(row.snapshot_json, {}),
      ),
    ),
  );
}

export async function getReport(
  projectId: string,
  id: string,
): Promise<ReportFull | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM client_reports WHERE project_id = ? AND id = ?`,
  )
    .bind(projectId, id)
    .first<Row>();
  return row ? fullOf(row) : null;
}

export async function getReportByToken(
  token: string,
): Promise<ReportFull | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM client_reports WHERE token = ?`,
  )
    .bind(token)
    .first<Row>();
  return row ? fullOf(row) : null;
}

export async function getReportById(id: string): Promise<ReportFull | null> {
  const row = await env.DB.prepare(`SELECT * FROM client_reports WHERE id = ?`)
    .bind(id)
    .first<Row>();
  return row ? fullOf(row) : null;
}

export async function updateReport(
  projectId: string,
  id: string,
  patch: {
    title?: string;
    clientName?: string | null;
    notes?: ReportNotes;
    shared?: boolean;
  },
): Promise<boolean> {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    values.push(patch.title);
  }
  if (patch.clientName !== undefined) {
    sets.push("client_name = ?");
    values.push(patch.clientName);
  }
  if (patch.notes !== undefined) {
    sets.push("notes_json = ?");
    values.push(JSON.stringify(patch.notes));
  }
  if (patch.shared !== undefined) {
    sets.push("shared = ?");
    values.push(patch.shared ? 1 : 0);
  }
  if (sets.length === 0) return true;
  sets.push("updated_at = ?");
  values.push(new Date().toISOString());
  const result = await env.DB.prepare(
    `UPDATE client_reports SET ${sets.join(", ")} WHERE project_id = ? AND id = ?`,
  )
    .bind(...values, projectId, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Replaces the numbers of a report with a fresh snapshot; notes and the link stay. */
export async function replaceSnapshot(
  projectId: string,
  id: string,
  snapshot: ReportSnapshot,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE client_reports SET snapshot_json = ?, updated_at = ? WHERE project_id = ? AND id = ?`,
  )
    .bind(JSON.stringify(snapshot), new Date().toISOString(), projectId, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function deleteReport(
  projectId: string,
  id: string,
): Promise<boolean> {
  const result = await env.DB.prepare(
    `DELETE FROM client_reports WHERE project_id = ? AND id = ?`,
  )
    .bind(projectId, id)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** Adds what an AI call cost to the report's running total. */
export async function addAiCost(
  reportId: string,
  costEur: number,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE client_reports SET ai_cost_eur = ai_cost_eur + ?, ai_calls = ai_calls + 1 WHERE id = ?`,
  )
    .bind(costEur, reportId)
    .run();
}
