import { env } from "cloudflare:workers";

// Storage for the Radar follow-up (migration 0901_radar.sql): actions marked
// as done, alert rules and the alerts they raised.

// ---------------------------------------------------------------- actions

export type ActionRow = {
  id: string;
  project_id: string;
  action_key: string;
  kind: string;
  title: string | null;
  page: string | null;
  query: string | null;
  done_at: string;
  done_by: string | null;
  note: string | null;
  baseline_json: string;
};

export async function insertAction(row: ActionRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO radar_actions
      (id, project_id, action_key, kind, title, page, query, done_at, done_by, note, baseline_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, action_key) DO UPDATE SET
      done_at = excluded.done_at, done_by = excluded.done_by,
      note = excluded.note, baseline_json = excluded.baseline_json,
      title = excluded.title`,
  )
    .bind(
      row.id,
      row.project_id,
      row.action_key,
      row.kind,
      row.title,
      row.page,
      row.query,
      row.done_at,
      row.done_by,
      row.note,
      row.baseline_json,
    )
    .run();
}

export async function listActions(
  projectId: string,
  limit = 60,
): Promise<ActionRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM radar_actions WHERE project_id = ? ORDER BY done_at DESC LIMIT ?`,
  )
    .bind(projectId, limit)
    .all<ActionRow>();
  return results;
}

export async function deleteAction(
  projectId: string,
  id: string,
): Promise<void> {
  await env.DB.prepare(
    `DELETE FROM radar_actions WHERE project_id = ? AND id = ?`,
  )
    .bind(projectId, id)
    .run();
}

// ------------------------------------------------------------ alert rules

export type RuleRow = {
  id: string;
  project_id: string;
  name: string;
  scope: string;
  target: string | null;
  metric: string;
  condition: string;
  threshold: number;
  window_days: number;
  min_value: number;
  enabled: number;
  created_at: string;
  created_by: string | null;
  /** JSON list of extra conditions, or null. */
  filters_json: string | null;
  /** JSON {emails, webhooks}, or null. */
  notify_json: string | null;
};

export async function listRules(projectId: string): Promise<RuleRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM radar_alert_rules WHERE project_id = ? ORDER BY created_at`,
  )
    .bind(projectId)
    .all<RuleRow>();
  return results;
}

export async function insertRule(row: RuleRow): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO radar_alert_rules
      (id, project_id, name, scope, target, metric, condition, threshold,
       window_days, min_value, enabled, created_at, created_by, filters_json, notify_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      row.id,
      row.project_id,
      row.name,
      row.scope,
      row.target,
      row.metric,
      row.condition,
      row.threshold,
      row.window_days,
      row.min_value,
      row.enabled,
      row.created_at,
      row.created_by,
      row.filters_json,
      row.notify_json,
    )
    .run();
}

export async function setRuleEnabled(
  projectId: string,
  id: string,
  enabled: boolean,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE radar_alert_rules SET enabled = ? WHERE project_id = ? AND id = ?`,
  )
    .bind(enabled ? 1 : 0, projectId, id)
    .run();
}

export async function deleteRule(projectId: string, id: string): Promise<void> {
  await env.DB.prepare(
    `DELETE FROM radar_alert_rules WHERE project_id = ? AND id = ?`,
  )
    .bind(projectId, id)
    .run();
}

/** Projects that have at least one enabled rule: what the daily check covers. */
export async function projectsWithRules(): Promise<string[]> {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT project_id FROM radar_alert_rules WHERE enabled = 1`,
  ).all<{ project_id: string }>();
  return results.map((row) => row.project_id);
}

// ----------------------------------------------------------- alert events

export type EventRow = {
  id: string;
  project_id: string;
  rule_id: string;
  rule_name: string;
  day: string;
  created_at: string;
  summary: string;
  details_json: string;
  seen: number;
};

/** One alert per rule per day: a repeated check the same day is ignored. */
export async function insertEvent(row: EventRow): Promise<boolean> {
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO radar_alert_events
      (id, project_id, rule_id, rule_name, day, created_at, summary, details_json, seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  )
    .bind(
      row.id,
      row.project_id,
      row.rule_id,
      row.rule_name,
      row.day,
      row.created_at,
      row.summary,
      row.details_json,
    )
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function listEvents(
  projectId: string,
  limit = 100,
): Promise<EventRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM radar_alert_events WHERE project_id = ?
     ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(projectId, limit)
    .all<EventRow>();
  return results;
}

export async function countUnseenEvents(projectId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM radar_alert_events WHERE project_id = ? AND seen = 0`,
  )
    .bind(projectId)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

export async function markEventsSeen(projectId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE radar_alert_events SET seen = 1 WHERE project_id = ? AND seen = 0`,
  )
    .bind(projectId)
    .run();
}

export async function deleteEventsOlderThan(isoDate: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM radar_alert_events WHERE created_at < ?`)
    .bind(isoDate)
    .run();
}
