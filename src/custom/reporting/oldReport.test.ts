import { describe, expect, it, vi } from "vitest";

// reportingDb reads Worker bindings; only the pure normalizer is used here.
vi.mock("cloudflare:workers", () => ({ env: {} }));

import { renderReportDocument } from "@/custom/reporting/render";
import { normalizeSnapshot } from "@/custom/reporting/server/reportingDb";
import { EMPTY_NOTES, type ReportFull } from "@/custom/reporting/types";

describe("reports saved by an earlier version", () => {
  it("still draw: missing fields are filled in", () => {
    // What the first version stored: no brand, topics, health or Discover.
    const snapshot = normalizeSnapshot({
      siteUrl: "sc-domain:example.com",
      range: { startDate: "2026-09-18", endDate: "2026-10-15" },
      totals: { clicks: 10, impressions: 100, ctr: 0.1, position: 5 },
      prevTotals: { clicks: 8, impressions: 90, ctr: 0.09, position: 6 },
      daily: [],
      bands: [
        {
          label: "Top 3",
          queries: 1,
          prevQueries: 1,
          clicks: 1,
          prevClicks: 1,
        },
      ] as never,
    });
    const report = {
      id: "r",
      projectId: "p",
      token: "t".repeat(32),
      title: "Informe SEO — Octubre de 2026",
      clientName: null,
      shared: false,
      createdAt: "",
      updatedAt: "",
      createdBy: null,
      range: snapshot.range,
      snapshot,
      notes: EMPTY_NOTES,
    } as ReportFull;
    expect(() => renderReportDocument(report, "preview")).not.toThrow();
  });

  it("shows the AI diagnoses and title ideas once the consultant keeps them", () => {
    const report = {
      id: "r",
      projectId: "p",
      token: "t".repeat(32),
      title: "Informe",
      clientName: null,
      shared: true,
      createdAt: "",
      updatedAt: "",
      createdBy: null,
      range: { startDate: "2026-09-18", endDate: "2026-10-15" },
      snapshot: normalizeSnapshot({ siteUrl: "sc-domain:example.com" }),
      notes: {
        ...EMPTY_NOTES,
        diagnoses: [
          {
            url: "https://example.com/guia/",
            text: "El título no menciona la búsqueda que cae.",
            fixes: ["Añadir la búsqueda al H1"],
          },
        ],
        titleIdeas: [
          {
            query: "seo local",
            url: "https://example.com/guia/",
            current: "Guía",
            options: [
              {
                title: "SEO local: guía 2026",
                description: "Todo lo que necesitas.",
              },
            ],
          },
        ],
      },
    } as ReportFull;
    const html = renderReportDocument(report, "public");
    expect(html).toContain('id="diagnostico"');
    expect(html).toContain('class="serp"');
    expect(html).toContain("El título no menciona");
  });
});
