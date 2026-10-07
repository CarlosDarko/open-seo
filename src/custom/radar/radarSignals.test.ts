import { describe, expect, it } from "vitest";
import {
  missingLinkSources,
  pushFindings,
  queryWords,
  snippetFindings,
} from "@/custom/radar/diagnostics";
import {
  assertUrlInSite,
  parsePageSignals,
  type PageSignals,
} from "@/custom/radar/pageSignals";
import {
  brandTokens,
  explainChange,
  isBrandQuery,
  ownCtrCurve,
  type ChangeRow,
} from "@/custom/radar/radarAnalysis";

const HTML = `<html><head>
<title>  Herencia &amp; adjudicación: guía  </title>
<meta name="description" content="Qué es la adjudicación de herencia">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://www.x.com/blog/a/">
</head><body><h1>Adjudicación <em>de herencia</em></h1>
<a href="/blog/b/">B</a><a href="https://otra.com/c">fuera</a><a href="#top">ancla</a>
<script>var ignorar = "mucho texto de script";</script>
<p>uno dos tres</p></body></html>`;

const signals = (overrides: Partial<PageSignals> = {}): PageSignals => ({
  url: "https://x.com/blog/a",
  ok: true,
  title: "Adjudicación de herencia: qué es y cómo se hace",
  metaDescription:
    "Te explicamos paso a paso la adjudicación de herencia, los plazos, los impuestos y los documentos que necesitas.",
  h1: ["Adjudicación de herencia"],
  canonical: null,
  noindex: false,
  links: [],
  wordCount: 900,
  ...overrides,
});

describe("parsePageSignals", () => {
  it("reads title, meta, H1, canonical and only internal links", () => {
    const parsed = parsePageSignals(HTML, "https://x.com/blog/a");
    expect(parsed.title).toBe("Herencia & adjudicación: guía");
    expect(parsed.metaDescription).toBe("Qué es la adjudicación de herencia");
    expect(parsed.h1).toEqual(["Adjudicación de herencia"]);
    expect(parsed.canonical).toBe("https://www.x.com/blog/a");
    expect(parsed.noindex).toBe(false);
    expect(parsed.links).toContain("https://x.com/blog/b");
    expect(parsed.links.some((link) => link.includes("otra.com"))).toBe(false);
    expect(parsed.wordCount).toBeLessThan(10);
  });
});

describe("assertUrlInSite", () => {
  it("only accepts URLs of the Search Console property", () => {
    expect(() => assertUrlInSite("https://www.x.com/a", "sc-domain:x.com")).not.toThrow();
    expect(() => assertUrlInSite("https://blog.x.com/a", "sc-domain:x.com")).not.toThrow();
    expect(() => assertUrlInSite("https://x.com/a", "https://x.com/")).not.toThrow();
    expect(() => assertUrlInSite("https://evil.com/a", "sc-domain:x.com")).toThrow();
    expect(() => assertUrlInSite("https://x.com.evil.com/a", "sc-domain:x.com")).toThrow();
    expect(() => assertUrlInSite("http://169.254.169.254/", "sc-domain:x.com")).toThrow();
    expect(() => assertUrlInSite("file:///etc/passwd", "sc-domain:x.com")).toThrow();
  });
});

describe("snippetFindings", () => {
  it("says exactly what is wrong with the title and the meta description", () => {
    const findings = snippetFindings(
      signals({
        title: "Una guía larguísima sobre muchas cosas distintas que no menciona el tema",
        metaDescription: null,
      }),
      "adjudicación de herencia",
    );
    const text = findings.map((f) => f.text).join("\n");
    expect(text).toContain("caracteres y Google lo corta");
    expect(text).toContain("«adjudicacion»");
    expect(text).toContain("Sin meta descripción");
  });

  it("reports a healthy snippet as fine", () => {
    const findings = snippetFindings(signals(), "adjudicación de herencia");
    expect(findings.every((f) => f.level === "ok")).toBe(true);
  });

  it("flags a canonical that points elsewhere and noindex", () => {
    const findings = snippetFindings(
      signals({ canonical: "https://x.com/otra", noindex: true }),
      "herencia",
    );
    expect(findings.filter((f) => f.level === "bad")).toHaveLength(2);
  });
});

describe("pushFindings and links", () => {
  it("asks for a heading with the query and warns about thin content", () => {
    const findings = pushFindings(
      signals({ h1: ["Otra cosa"], wordCount: 120 }),
      "adjudicación de herencia",
    );
    const text = findings.map((f) => f.text).join("\n");
    expect(text).toContain("El H1 actual");
    expect(text).toContain("120 palabras");
  });

  it("lists strong pages that do not link to the target yet", () => {
    const withLink = signals({ url: "https://x.com/s1", links: ["https://x.com/blog/a"] });
    const without = signals({ url: "https://x.com/s2", links: [] });
    expect(missingLinkSources("https://x.com/blog/a", [withLink, without])).toEqual([
      "https://x.com/s2",
    ]);
  });

  it("keeps meaningful query words only", () => {
    expect(queryWords("cuánto paga el inss la incapacidad temporal")).toEqual([
      "cuanto",
      "paga",
      "inss",
      "incapacidad",
      "temporal",
    ]);
  });
});

describe("brand", () => {
  it("detects brand queries however they are typed", () => {
    const tokens = brandTokens("sc-domain:carlosortega.page");
    expect(tokens).toEqual(["carlosortega"]);
    expect(isBrandQuery("Carlos Ortega seo", tokens)).toBe(true);
    expect(isBrandQuery("auditoria seo", tokens)).toBe(false);
    expect(brandTokens("https://www.fruitsrafols.com/")).toEqual(["fruitsrafols"]);
  });
});

describe("explainChange", () => {
  const base: ChangeRow = {
    key: "p",
    clicks: 10,
    prevClicks: 20,
    clicksDelta: -10,
    impressions: 1000,
    prevImpressions: 1000,
    position: 5,
    prevPosition: 5,
    status: "changed",
  };

  it("tells apart position, demand and CTR", () => {
    expect(explainChange({ ...base, position: 8, prevPosition: 4 })).toBe("posicion");
    expect(explainChange({ ...base, impressions: 500 })).toBe("demanda");
    expect(explainChange(base)).toBe("ctr");
    expect(explainChange({ ...base, status: "lost" })).toBe("perdida");
  });
});

describe("ownCtrCurve", () => {
  it("measures the site's own CTR where there is enough data", () => {
    const curve = ownCtrCurve([
      { keys: ["a"], clicks: 20, impressions: 1000, ctr: 0.02, position: 1.2 },
    ]);
    expect(curve[0]).toBeCloseTo(0.02, 5);
    expect(curve[1]).toBeLessThan(0.15);
  });
});
