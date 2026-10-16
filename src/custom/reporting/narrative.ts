// The plain-Spanish reading of a report's numbers: a verdict, the points worth
// saying out loud and the one thing to do first. Pure, so it can be tested and
// reused by the MCP tools (an agent can start from these lines and rewrite them).
import { integer } from "@/custom/radar/format";
import type { ReportSnapshot } from "@/custom/reporting/types";

const oneDecimal = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const num = (value: number) => integer.format(Math.round(value));

/** Change in percent, or null when there is nothing to compare with. */
export function percentChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return (now - before) / before;
}

export function signedPercent(value: number): string {
  const text = oneDecimal.format(Math.abs(value * 100));
  return `${value < 0 ? "−" : "+"}${text} %`;
}

export type Verdict = {
  tone: "good" | "warn" | "bad" | "flat";
  /** One sentence: how the period went. */
  headline: string;
  /** Facts that back it up, most important first. */
  points: string[];
  /** The first thing to do, when there is one. */
  firstAction: string | null;
};

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search || "/";
  } catch {
    return url;
  }
}

export function buildVerdict(snapshot: ReportSnapshot): Verdict {
  const { totals, prevTotals, period } = snapshot;
  const comparable = period.comparable && prevTotals.impressions > 0;
  const clicks = comparable
    ? percentChange(totals.clicks, prevTotals.clicks)
    : null;
  const impressions = comparable
    ? percentChange(totals.impressions, prevTotals.impressions)
    : null;

  let tone: Verdict["tone"] = "flat";
  let headline = `En estos ${period.days} días tu web recibió ${num(totals.clicks)} clics desde Google y se mostró ${num(totals.impressions)} veces.`;
  if (clicks !== null) {
    const when =
      period.compare === "year"
        ? "el mismo periodo del año pasado"
        : "el periodo anterior";
    if (clicks >= 0.05) {
      tone = "good";
      headline = `Buen periodo: ${num(totals.clicks)} clics, un ${oneDecimal.format(clicks * 100)} % más que ${when}.`;
    } else if (clicks <= -0.05) {
      tone = Math.abs(clicks) >= 0.2 ? "bad" : "warn";
      headline = `Los clics han bajado un ${oneDecimal.format(Math.abs(clicks) * 100)} % frente a ${when}: ${num(totals.clicks)} frente a ${num(prevTotals.clicks)}.`;
    } else {
      headline = `Periodo estable: ${num(totals.clicks)} clics, casi igual que ${when} (${signedPercent(clicks)}).`;
    }
  }

  const points: string[] = [];
  if (impressions !== null && Math.abs(impressions) >= 0.05) {
    points.push(
      impressions > 0
        ? `Google te enseña más: las impresiones suben un ${oneDecimal.format(impressions * 100)} %.`
        : `Google te enseña menos: las impresiones bajan un ${oneDecimal.format(Math.abs(impressions) * 100)} %.`,
    );
  }
  if (comparable && totals.position > 0 && prevTotals.position > 0) {
    const diff = prevTotals.position - totals.position;
    if (Math.abs(diff) >= 0.3) {
      points.push(
        diff > 0
          ? `La posición media mejora: de ${oneDecimal.format(prevTotals.position)} a ${oneDecimal.format(totals.position)}.`
          : `La posición media empeora: de ${oneDecimal.format(prevTotals.position)} a ${oneDecimal.format(totals.position)}.`,
      );
    }
  }
  const winner = snapshot.pageWinners[0];
  if (winner && winner.clicksDelta > 0) {
    points.push(
      `La página que más sube es ${pathOf(winner.key)} (+${num(winner.clicksDelta)} clics).`,
    );
  }
  const loser = snapshot.pageLosers[0];
  if (loser && loser.clicksDelta < 0) {
    points.push(
      `La que más baja es ${pathOf(loser.key)} (${num(loser.clicksDelta)} clics): conviene revisarla.`,
    );
  }
  const potential = snapshot.opportunities.reduce(
    (sum, item) => sum + item.potentialClicks,
    0,
  );
  if (potential >= 10) {
    points.push(
      `Hay unas ${num(potential)} visitas más al alcance trabajando las oportunidades de abajo.`,
    );
  }
  if (snapshot.updates.length > 0) {
    const names = snapshot.updates.map((update) => update.label);
    points.push(
      `Google desplegó ${snapshot.updates.length === 1 ? "un cambio" : `${snapshot.updates.length} cambios`} en estas fechas (${names.slice(0, 2).join(", ")}): puede explicar parte de los movimientos.`,
    );
  }

  const first = snapshot.tasks[0];
  return {
    tone,
    headline,
    points: points.slice(0, 5),
    firstAction: first ? first.title : null,
  };
}
