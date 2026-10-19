import { describe, expect, it } from "vitest";
import { REPORT_SCRIPT } from "@/custom/reporting/renderScript";
import { renderReportDocument } from "@/custom/reporting/render";
import {
  EMPTY_NOTES,
  type ReportFull,
  type ReportSnapshot,
} from "@/custom/reporting/types";

const daily = Array.from({ length: 28 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 8, 18 + index)).toISOString().slice(0, 10),
  clicks: 40 + index,
  impressions: 1400 + index * 10,
  position: 11,
  prevClicks: 35 + index,
  prevImpressions: 1300,
  prevPosition: 12,
}));

const snapshot = {
  version: 3,
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
  daily,
  brand: {
    hasBrand: true,
    clicks: 300,
    prevClicks: 280,
    otherClicks: 900,
    prevOtherClicks: 720,
  },
  topQueries: [
    { query: "seo local", clicks: 90, impressions: 2000, position: 4.2 },
  ],
  topPages: [
    { url: "https://example.com/a/", clicks: 400, prevClicks: 300 },
    { url: "https://example.com/b/", clicks: 200, prevClicks: 210 },
    { url: "https://example.com/c/", clicks: 100, prevClicks: 90 },
  ],
  pageClicksTotal: 1100,
  pageWinners: [
    {
      key: "https://example.com/a/",
      clicks: 400,
      prevClicks: 300,
      clicksDelta: 100,
      position: 5,
      prevPosition: 7,
      status: "changed",
      queries: [
        { query: "seo local", clicksDelta: 60, position: 4, prevPosition: 6 },
      ],
    },
  ],
  pageLosers: [],
  queryWinners: [],
  queryLosers: [],
  newQueries: 12,
  lostQueries: 3,
  newQueriesList: [
    {
      query: "seo para dentistas",
      clicks: 4,
      impressions: 300,
      position: 8,
      prevClicks: 0,
      prevPosition: null,
    },
  ],
  lostQueriesList: [],
  queriesByBand: [
    [
      {
        query: "seo local",
        clicks: 40,
        impressions: 900,
        position: 2.1,
        prevClicks: 0,
        prevPosition: null,
      },
    ],
    [],
    [],
    [],
  ],
  bands: [
    {
      label: "Posiciones 1-3",
      queries: 30,
      prevQueries: 24,
      clicks: 600,
      prevClicks: 500,
      entered: [{ query: "seo madrid", position: 2.8, prevPosition: 5.1 }],
      left: [],
    },
  ],
  segments: {
    device: [
      {
        label: "Móvil",
        clicks: 800,
        prevClicks: 650,
        impressions: 30000,
        share: 0.67,
      },
      {
        label: "Ordenador",
        clicks: 400,
        prevClicks: 350,
        impressions: 10000,
        share: 0.33,
      },
    ],
    pageType: [],
    intent: [],
  },
  opportunities: [
    {
      query: "agencia seo",
      page: "https://example.com/servicios/",
      position: 5,
      impressions: 4000,
      clicks: 80,
      potentialClicks: 150,
      kind: "push",
    },
  ],
  updates: [
    {
      id: "u1",
      kind: "core",
      label: "Core update (septiembre de 2026)",
      title: "Core",
      begin: "2026-09-24",
      end: "2026-10-06",
      url: "https://status.search.google.com",
    },
  ],
  topics: [
    {
      label: "seo local",
      clicks: 500,
      prevClicks: 400,
      impressions: 9000,
      position: 6,
      queries: 40,
      nearTopShare: 0.5,
      topQueries: [{ query: "seo local madrid", clicks: 50, position: 3 }],
    },
  ],
  health: {
    inSitemap: 100,
    pagesWithImpressions: 120,
    unseen: 10,
    notInSitemap: 5,
    sitemapErrors: 0,
  },
  discover: null,
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
  aiCostEur: 0,
  aiCalls: 0,
  range: snapshot.range,
  snapshot,
  notes: { ...EMPTY_NOTES, message: "Hola </script><b>x</b>" },
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
    expect(data.daily).toHaveLength(28);
    expect(data.updates[0].short).toBe("Core");
  });

  it("builds the findings, topics and technical sections and the brand", () => {
    for (const id of [
      "trafico",
      "posiciones",
      "busquedas",
      "temas",
      "tecnico",
    ]) {
      expect(html).toContain(`data-panel="${id}"`);
    }
    expect(html).toContain("Resumen ejecutivo");
    expect(html).toContain("<svg");
    expect(html).toContain("carlosortega.page");
  });

  it("opens every page link in a new tab and lists the searches behind a figure", () => {
    expect(html).toContain(
      'href="https://example.com/a/" target="_blank" rel="noopener noreferrer"',
    );
    expect(html).toContain("seo para dentistas");
    expect(html).toContain("google.com/search?q=seo%20para%20dentistas");
  });

  it("always shows an encouraging reading under each finding", () => {
    expect(html).toContain('class="up2"');
  });

  it("leaves out the sections the consultant hides", () => {
    const hidden = renderReportDocument(
      { ...report, notes: { ...report.notes, hidden: ["temas", "reparto"] } },
      "public",
    );
    expect(hidden).not.toContain('data-panel="temas"');
    expect(html).toContain('data-panel="temas"');
  });

  it("ships a browser script that is valid JavaScript", () => {
    expect(() => new Function(REPORT_SCRIPT)).not.toThrow();
  });
});
