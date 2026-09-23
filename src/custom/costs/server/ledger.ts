import { env } from "cloudflare:workers";
import {
  addDays,
  buildCostAlerts,
  costFeatureLabel,
  madridDay,
  monthStartOf,
  previousMonthStart,
  projectMonthEnd,
  usdToEur,
  type CostAlert,
  type CostSettings,
} from "@/custom/costs/shared";
import { getProviderBalance } from "@/custom/costs/server/balance";
import { getUsdEurRate, type UsdEurRate } from "@/custom/costs/server/fx";
import { getCostSettings } from "@/custom/costs/server/settings";

// Ledger of DataForSEO charges. One row per billed API call, stored in USD
// (what DataForSEO charges) and EUR (converted with the ECB rate of that day).

export type CostWho = {
  organizationId: string;
  userEmail: string | null;
  projectId?: string | null;
};

export type CostRecord = CostWho & {
  feature: string;
  endpoint: string;
  costUsd: number;
  outcome: "ok" | "failed_charged";
};

export async function recordCost(record: CostRecord): Promise<void> {
  if (!(record.costUsd > 0)) return;
  const fx = await getUsdEurRate();
  const now = new Date();
  await env.DB.prepare(
    `INSERT INTO cost_ledger
      (id, created_at, day, organization_id, user_email, project_id, feature,
       endpoint, cost_usd, usd_eur_rate, cost_eur, outcome)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      now.toISOString(),
      madridDay(now),
      record.organizationId,
      record.userEmail,
      record.projectId ?? null,
      record.feature,
      record.endpoint,
      record.costUsd,
      fx.rate,
      usdToEur(record.costUsd, fx.rate),
      record.outcome,
    )
    .run();
}

type Sum = { eur: number | null; calls: number | null };

async function sumSince(
  organizationId: string,
  fromDay: string,
  toDayExclusive?: string,
): Promise<Sum> {
  const row = await env.DB.prepare(
    `SELECT SUM(cost_eur) AS eur, COUNT(*) AS calls
       FROM cost_ledger
      WHERE organization_id = ? AND day >= ? AND day < ?`,
  )
    .bind(organizationId, fromDay, toDayExclusive ?? "9999-12-31")
    .first<Sum>();
  return row ?? { eur: 0, calls: 0 };
}

export type CostOverview = {
  fx: UsdEurRate;
  settings: CostSettings;
  day: string;
  totals: {
    today: number;
    last7: number;
    month: number;
    previousMonth: number;
    allTime: number;
  };
  monthCalls: number;
  projectedMonthEur: number;
  daily: { day: string; eur: number }[];
  byFeature: { feature: string; label: string; eur: number; calls: number }[];
  byProject: {
    projectId: string | null;
    name: string;
    eur: number;
    calls: number;
  }[];
  byUser: { email: string; eur: number; calls: number }[];
  balance: {
    eur: number;
    usd: number;
    daysLeft: number | null;
    fetchedAt: number;
  } | null;
  reconciliation: {
    providerSpentEur: number;
    loggedEur: number;
    unattributedEur: number;
  } | null;
  alerts: CostAlert[];
};

export async function getCostOverview(
  organizationId: string,
): Promise<CostOverview> {
  const day = madridDay();
  const monthStart = monthStartOf(day);
  const last7Start = addDays(day, -6);
  const chartStart = addDays(day, -29);
  const recentStart = addDays(day, -14);

  const [
    fx,
    settings,
    balance,
    today,
    last7,
    month,
    previous,
    allTime,
    dailyRows,
    featureRows,
    projectRows,
    userRows,
    recentRow,
    loggedUsdRow,
  ] = await Promise.all([
    getUsdEurRate(),
    getCostSettings(),
    getProviderBalance(),
    sumSince(organizationId, day),
    sumSince(organizationId, last7Start),
    sumSince(organizationId, monthStart),
    sumSince(organizationId, previousMonthStart(day), monthStart),
    sumSince(organizationId, "0000-01-01"),
    env.DB.prepare(
      `SELECT day, SUM(cost_eur) AS eur FROM cost_ledger
        WHERE organization_id = ? AND day >= ? GROUP BY day`,
    )
      .bind(organizationId, chartStart)
      .all<{ day: string; eur: number }>(),
    env.DB.prepare(
      `SELECT feature, SUM(cost_eur) AS eur, COUNT(*) AS calls FROM cost_ledger
        WHERE organization_id = ? AND day >= ? GROUP BY feature ORDER BY eur DESC`,
    )
      .bind(organizationId, monthStart)
      .all<{ feature: string; eur: number; calls: number }>(),
    env.DB.prepare(
      `SELECT l.project_id AS projectId, p.name AS name,
              SUM(l.cost_eur) AS eur, COUNT(*) AS calls
         FROM cost_ledger l LEFT JOIN projects p ON p.id = l.project_id
        WHERE l.organization_id = ? AND l.day >= ?
        GROUP BY l.project_id ORDER BY eur DESC`,
    )
      .bind(organizationId, monthStart)
      .all<{
        projectId: string | null;
        name: string | null;
        eur: number;
        calls: number;
      }>(),
    env.DB.prepare(
      `SELECT COALESCE(user_email, 'Desconocido') AS email,
              SUM(cost_eur) AS eur, COUNT(*) AS calls
         FROM cost_ledger
        WHERE organization_id = ? AND day >= ?
        GROUP BY user_email ORDER BY eur DESC`,
    )
      .bind(organizationId, monthStart)
      .all<{ email: string; eur: number; calls: number }>(),
    env.DB.prepare(
      `SELECT SUM(cost_eur) AS eur FROM cost_ledger
        WHERE organization_id = ? AND day >= ? AND day < ?`,
    )
      .bind(organizationId, recentStart, day)
      .first<{ eur: number | null }>(),
    env.DB.prepare(`SELECT SUM(cost_usd) AS usd FROM cost_ledger`).first<{
      usd: number | null;
    }>(),
  ]);

  const byDay = new Map(dailyRows.results.map((row) => [row.day, row.eur]));
  const daily = Array.from({ length: 30 }, (_, index) => {
    const d = addDays(chartStart, index);
    return { day: d, eur: byDay.get(d) ?? 0 };
  });

  const monthEur = month.eur ?? 0;
  const todayEur = today.eur ?? 0;
  const recentAverage = (recentRow?.eur ?? 0) / 14;

  const balanceInfo = balance
    ? {
        eur: usdToEur(balance.balanceUsd, fx.rate),
        usd: balance.balanceUsd,
        daysLeft:
          recentAverage > 0
            ? Math.floor(usdToEur(balance.balanceUsd, fx.rate) / recentAverage)
            : null,
        fetchedAt: balance.fetchedAt,
      }
    : null;

  const loggedUsd = loggedUsdRow?.usd ?? 0;
  const reconciliation = balance
    ? {
        providerSpentEur: usdToEur(
          balance.depositedUsd - balance.balanceUsd,
          fx.rate,
        ),
        loggedEur: usdToEur(loggedUsd, fx.rate),
        unattributedEur: usdToEur(
          balance.depositedUsd - balance.balanceUsd - loggedUsd,
          fx.rate,
        ),
      }
    : null;

  return {
    fx,
    settings,
    day,
    totals: {
      today: todayEur,
      last7: last7.eur ?? 0,
      month: monthEur,
      previousMonth: previous.eur ?? 0,
      allTime: allTime.eur ?? 0,
    },
    monthCalls: month.calls ?? 0,
    projectedMonthEur: projectMonthEnd(monthEur, day),
    daily,
    byFeature: featureRows.results.map((row) => ({
      feature: row.feature,
      label: costFeatureLabel(row.feature),
      eur: row.eur,
      calls: row.calls,
    })),
    byProject: projectRows.results.map((row) => ({
      projectId: row.projectId,
      name: row.name ?? "Sin proyecto",
      eur: row.eur,
      calls: row.calls,
    })),
    byUser: userRows.results,
    balance: balanceInfo,
    reconciliation,
    alerts: buildCostAlerts({
      day,
      settings,
      monthSpentEur: monthEur,
      todaySpentEur: todayEur,
      recentDailyAverageEur: recentAverage,
      balanceEur: balanceInfo?.eur ?? null,
    }),
  };
}

/** Lighter than the overview: only what the sidebar and banners need. */
export async function getCostSummary(organizationId: string) {
  const day = madridDay();
  const [fx, settings, balance, month, today, recent] = await Promise.all([
    getUsdEurRate(),
    getCostSettings(),
    getProviderBalance(),
    sumSince(organizationId, monthStartOf(day)),
    sumSince(organizationId, day),
    env.DB.prepare(
      `SELECT SUM(cost_eur) AS eur FROM cost_ledger
        WHERE organization_id = ? AND day >= ? AND day < ?`,
    )
      .bind(organizationId, addDays(day, -14), day)
      .first<{ eur: number | null }>(),
  ]);
  const balanceEur = balance ? usdToEur(balance.balanceUsd, fx.rate) : null;
  const monthEur = month.eur ?? 0;
  return {
    fx,
    settings,
    monthEur,
    balanceEur,
    alerts: buildCostAlerts({
      day,
      settings,
      monthSpentEur: monthEur,
      todaySpentEur: today.eur ?? 0,
      recentDailyAverageEur: (recent?.eur ?? 0) / 14,
      balanceEur,
    }),
  };
}

export type CostEventRow = {
  id: string;
  createdAt: string;
  userEmail: string | null;
  projectName: string | null;
  feature: string;
  featureLabel: string;
  endpoint: string;
  costUsd: number;
  costEur: number;
  outcome: string;
};

type EventFilter = {
  feature?: string;
  /** YYYY-MM */
  month?: string;
};

function eventWhere(organizationId: string, filter: EventFilter) {
  const clauses = ["l.organization_id = ?"];
  const args: unknown[] = [organizationId];
  if (filter.feature) {
    clauses.push("l.feature = ?");
    args.push(filter.feature);
  }
  if (filter.month) {
    clauses.push("l.day >= ? AND l.day < ?");
    const start = `${filter.month}-01`;
    args.push(start, addDays(`${filter.month}-28`, 5).slice(0, 7) + "-01");
  }
  return { where: clauses.join(" AND "), args };
}

export async function listCostEvents(
  organizationId: string,
  filter: EventFilter & { limit: number; offset: number },
): Promise<{ rows: CostEventRow[]; total: number; totalEur: number }> {
  const { where, args } = eventWhere(organizationId, filter);
  const [rows, totals] = await Promise.all([
    env.DB.prepare(
      `SELECT l.id, l.created_at AS createdAt, l.user_email AS userEmail,
              p.name AS projectName, l.feature, l.endpoint,
              l.cost_usd AS costUsd, l.cost_eur AS costEur, l.outcome
         FROM cost_ledger l LEFT JOIN projects p ON p.id = l.project_id
        WHERE ${where}
        ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(...args, filter.limit, filter.offset)
      .all<Omit<CostEventRow, "featureLabel">>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS total, SUM(l.cost_eur) AS eur
         FROM cost_ledger l WHERE ${where}`,
    )
      .bind(...args)
      .first<{ total: number; eur: number | null }>(),
  ]);

  return {
    rows: rows.results.map((row) => ({
      ...row,
      featureLabel: costFeatureLabel(row.feature),
    })),
    total: totals?.total ?? 0,
    totalEur: totals?.eur ?? 0,
  };
}

const CSV_HEADER = [
  "Fecha (Madrid)",
  "Usuario",
  "Proyecto",
  "Función",
  "Endpoint",
  "Coste (EUR)",
  "Coste (USD)",
  "Tipo de cambio USD-EUR",
  "Resultado",
];

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const csvNumber = (value: number, digits: number) =>
  value.toFixed(digits).replace(".", ",");

/** Spanish-Excel friendly CSV: `;` separator, decimal comma, UTF-8 BOM. */
export async function exportCostEventsCsv(
  organizationId: string,
  filter: EventFilter,
): Promise<string> {
  const { where, args } = eventWhere(organizationId, filter);
  const result = await env.DB.prepare(
    `SELECT l.created_at AS createdAt, l.user_email AS userEmail,
            p.name AS projectName, l.feature, l.endpoint, l.cost_usd AS costUsd,
            l.usd_eur_rate AS rate, l.cost_eur AS costEur, l.outcome
       FROM cost_ledger l LEFT JOIN projects p ON p.id = l.project_id
      WHERE ${where} ORDER BY l.created_at DESC LIMIT 20000`,
  )
    .bind(...args)
    .all<{
      createdAt: string;
      userEmail: string | null;
      projectName: string | null;
      feature: string;
      endpoint: string;
      costUsd: number;
      rate: number;
      costEur: number;
      outcome: string;
    }>();

  const when = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "short",
    timeStyle: "medium",
  });
  const lines = [CSV_HEADER.join(";")];
  for (const row of result.results) {
    lines.push(
      [
        when.format(new Date(row.createdAt)),
        row.userEmail,
        row.projectName ?? "Sin proyecto",
        costFeatureLabel(row.feature),
        row.endpoint,
        csvNumber(row.costEur, 4),
        csvNumber(row.costUsd, 4),
        csvNumber(row.rate, 5),
        row.outcome === "ok" ? "Correcto" : "Fallida pero cobrada",
      ]
        .map(csvCell)
        .join(";"),
    );
  }
  return `﻿${lines.join("\r\n")}`;
}
