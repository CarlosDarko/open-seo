import { describe, expect, it } from "vitest";
import { REPORT_SCRIPT } from "@/custom/reporting/renderScript";
import { renderReportDocument } from "@/custom/reporting/render";
import {
  EMPTY_NOTES,
  type ReportFull,
  type ReportSnapshot,
} from "@/custom/reporting/types";

const snapshot = {
  version: 1,
  generatedAt: "2026-10-16T10:00:00.000Z",
  siteUrl: "sc-domain:example.com",
  range: { startDate: "2026-09-18", endDate: "2026-10-15" },
  period: {
    compare: "previous",
    comparable: true,
    days: 28,
    prevStartDate: "2026-08-21",
    prevEndDate: "2026-09-17",
  },
  scope: "sin marca",
  totals: { clicks: 1200, impressions: 40000, ctr: 0.03, position: 11.2 },
  prevTotals: { clicks: 1000, impressions: 38000, ctr: 0.026, position: 12.4 },
  daily: [
    {
      date: "2026-09-18",
      clicks: 40,
      impressions: 1400,
      position: 11,
      prevClicks: 35,
      prevImpressions: 1300,
      prevPosition: 12,
    },
    {
      date: "2026-09-19",
      clicks: 44,
      impressions: 1500,
      position: 11,
      prevClicks: null,
      prevImpressions: null,
      prevPosition: null,
    },
  ],
  topQueries: [],
  topPages: [],
  pageWinners: [],
  pageLosers: [],
  queryWinners: [],
  queryLosers: [],
  newQueries: 3,
  lostQueries: 1,
  bands: [],
  segments: { device: [], pageType: [], intent: [] },
  opportunities: [],
  tasks: [
    {
      id: "loss:https://example.com/a",
      kind: "loss",
      title: "/a pierde 30 clics",
      subtitle: "Revisa la página",
      stats: [],
      lines: ["Dato"],
      steps: ["Paso uno"],
      gain: 30,
      effort: "medio",
      page: "https://example.com/a",
      query: null,
    },
  ],
  updates: [],
} as unknown as ReportSnapshot;

const report: ReportFull = {
  id: "r1",
  projectId: "p1",
  token: "t".repeat(32),
  title: "Informe <script>alert(1)</script>",
  clientName: 'Cliente "Uno"',
  shared: true,
  createdAt: "2026-10-16T10:00:00.000Z",
  updatedAt: "2026-10-16T10:00:00.000Z",
  createdBy: null,
  range: snapshot.range,
  tasksTotal: 1,
  tasksDone: 0,
  snapshot,
  notes: { ...EMPTY_NOTES, message: "Hola </script><b>x</b>" },
  checks: {},
};

describe("renderReportDocument", () => {
  const html = renderReportDocument(report, "public");

  it("escapes everything that comes from data", () => {
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;alert(1)");
    expect(html).toContain("Hola &lt;/script&gt;");
  });

  it("embeds data that parses and cannot close its own tag", () => {
    const match =
      /<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/.exec(
        html,
      );
    expect(match).not.toBeNull();
    const data = JSON.parse(match?.[1] ?? "{}");
    expect(data.cfg.checkUrl).toBe(`/c/${report.token}/check`);
    expect(data.cfg.by).toBe("cliente");
    expect(data.daily).toHaveLength(2);
  });

  it("marks who ticks in the preview as the consultant", () => {
    expect(renderReportDocument(report, "preview")).toContain(
      '"by":"consultor"',
    );
  });

  it("leaves out the sections the consultant hides", () => {
    const hidden = renderReportDocument(
      { ...report, notes: { ...report.notes, hidden: ["tareas"] } },
      "public",
    );
    expect(hidden).not.toContain('id="tareas"');
    expect(html).toContain('id="tareas"');
  });

  it("ships a browser script that is valid JavaScript", () => {
    expect(() => new Function(REPORT_SCRIPT)).not.toThrow();
  });
});
