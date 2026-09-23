// Cost tracking, shared by server and client (no Cloudflare imports here).
// Everything is shown in euros. DataForSEO bills in USD, so each spend is
// converted with the ECB rate of the day and both amounts are kept.

export const COST_TIMEZONE = "Europe/Madrid";

// Only used when the ECB rate cannot be fetched and nothing is cached.
export const FALLBACK_USD_EUR = 0.88;

export type CostSettings = {
  /** Monthly spend limit that drives the progress bar and alerts. */
  monthlyBudgetEur: number;
  /** Percentage of the monthly budget at which a warning appears. */
  warnAtPercent: number;
  /** Ask for confirmation before an action estimated above this amount. */
  confirmAboveEur: number;
  /** Warn when the DataForSEO balance falls under this amount. */
  lowBalanceEur: number;
};

export const DEFAULT_COST_SETTINGS: CostSettings = {
  monthlyBudgetEur: 30,
  warnAtPercent: 80,
  confirmAboveEur: 0.5,
  lowBalanceEur: 10,
};

const FEATURE_LABELS_ES: Record<string, string> = {
  keyword_research: "Palabras clave y SERP",
  domain_overview: "Resumen de dominio",
  backlinks: "Backlinks",
  site_audit: "Auditoría del sitio",
  rank_tracking: "Seguimiento de posiciones",
  ai_citations: "Búsqueda de marca en IA",
  ai_prompt_responses: "Explorador de prompts (IA)",
  local_seo: "SEO local",
  agent: "Agente SAM",
};

export function costFeatureLabel(feature: string): string {
  return FEATURE_LABELS_ES[feature] ?? "Otros";
}

export const COST_FEATURES = Object.keys(FEATURE_LABELS_ES);

const eurStandard = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});
const eurFine = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 3,
  maximumFractionDigits: 4,
});

/** Euros with 2 decimals, or up to 4 for amounts under one cent. */
export function formatEur(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  const abs = Math.abs(amount);
  return abs > 0 && abs < 0.01
    ? eurFine.format(amount)
    : eurStandard.format(amount);
}

export function usdToEur(usd: number, rate: number): number {
  return usd * rate;
}

/** Day in Madrid time as YYYY-MM-DD (the calendar the invoices follow). */
export function madridDay(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: COST_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function monthStartOf(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10);
}

export function previousMonthStart(day: string): string {
  const [y, m] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 2, 1));
  return date.toISOString().slice(0, 10);
}

export function daysInMonthOf(day: string): number {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Linear projection of the month's spend from the days elapsed so far. */
export function projectMonthEnd(spentEur: number, day: string): number {
  const elapsed = Number(day.slice(8, 10));
  if (elapsed <= 0) return spentEur;
  return (spentEur / elapsed) * daysInMonthOf(day);
}

export type CostAlertLevel = "info" | "warning" | "error";

export type CostAlert = {
  id: string;
  level: CostAlertLevel;
  title: string;
  detail: string;
};

export type AlertInput = {
  day: string;
  settings: CostSettings;
  monthSpentEur: number;
  todaySpentEur: number;
  /** Average daily spend of the previous 14 days (excluding today). */
  recentDailyAverageEur: number;
  balanceEur: number | null;
};

/** Pure function so it can be unit tested. */
export function buildCostAlerts(input: AlertInput): CostAlert[] {
  const { settings, monthSpentEur, todaySpentEur, balanceEur } = input;
  const alerts: CostAlert[] = [];

  if (settings.monthlyBudgetEur > 0) {
    const used = (monthSpentEur / settings.monthlyBudgetEur) * 100;
    if (used >= 100) {
      alerts.push({
        id: "budget-exceeded",
        level: "error",
        title: "Has superado el presupuesto mensual",
        detail: `Llevas ${formatEur(monthSpentEur)} de ${formatEur(settings.monthlyBudgetEur)} este mes.`,
      });
    } else if (used >= settings.warnAtPercent) {
      alerts.push({
        id: "budget-warning",
        level: "warning",
        title: `Has consumido el ${Math.floor(used)} % del presupuesto mensual`,
        detail: `Llevas ${formatEur(monthSpentEur)} de ${formatEur(settings.monthlyBudgetEur)}.`,
      });
    }

    const projected = projectMonthEnd(monthSpentEur, input.day);
    if (
      used < 100 &&
      projected > settings.monthlyBudgetEur &&
      Number(input.day.slice(8, 10)) >= 3
    ) {
      alerts.push({
        id: "budget-projection",
        level: "warning",
        title: "A este ritmo superarás el presupuesto del mes",
        detail: `Proyección a fin de mes: ${formatEur(projected)} (presupuesto: ${formatEur(settings.monthlyBudgetEur)}).`,
      });
    }
  }

  const spikeFloor = Math.max(1, input.recentDailyAverageEur * 3);
  if (todaySpentEur >= spikeFloor && todaySpentEur >= 1) {
    alerts.push({
      id: "spend-spike",
      level: "warning",
      title: "Hoy el gasto es inusualmente alto",
      detail: `Llevas ${formatEur(todaySpentEur)} hoy; tu media diaria reciente es ${formatEur(input.recentDailyAverageEur)}.`,
    });
  }

  if (balanceEur !== null) {
    if (balanceEur <= 3) {
      alerts.push({
        id: "balance-critical",
        level: "error",
        title: "Saldo de DataForSEO casi agotado",
        detail: `Te quedan ${formatEur(balanceEur)}. Las búsquedas fallarán cuando llegue a cero.`,
      });
    } else if (balanceEur <= settings.lowBalanceEur) {
      alerts.push({
        id: "balance-low",
        level: "warning",
        title: "Saldo de DataForSEO bajo",
        detail: `Te quedan ${formatEur(balanceEur)}. Conviene recargar pronto.`,
      });
    }
  }

  return alerts;
}
