// The one-sentence verdict of a report and the small helpers it shares with
// the renderer. The wording is deliberately constructive: a weak period is
// told as it is, and followed by what can be won back.
import { integer } from "@/custom/radar/format";
import { silverLining } from "@/custom/reporting/insights";
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
  /** The most encouraging fact of the period. */
  lining: string;
};

export function buildVerdict(snapshot: ReportSnapshot): Verdict {
  const { totals, prevTotals, period } = snapshot;
  const comparable = period.comparable && prevTotals.impressions > 0;
  const clicks = comparable
    ? percentChange(totals.clicks, prevTotals.clicks)
    : null;
  const lining = silverLining(snapshot);

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
      headline = `Periodo más flojo: ${num(totals.clicks)} clics (${oneDecimal.format(Math.abs(clicks) * 100)} % menos que ${when}), con margen claro de recuperación.`;
    } else {
      headline = `Periodo estable y sólido: ${num(totals.clicks)} clics, casi igual que ${when} (${signedPercent(clicks)}).`;
    }
  }
  return { tone, headline, lining };
}
