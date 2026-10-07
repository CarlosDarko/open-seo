import { describe, expect, it } from "vitest";
import {
  languageClassifier,
  pageKindOf,
  buildPageTypes,
  pageTypeClassifier,
  queryIntent,
  segmentRows,
} from "@/custom/radar/radarSegments";

const urls = [
  "https://x.com/es/blog/a",
  "https://x.com/es/blog/b",
  "https://x.com/fr/blog/c",
  "https://x.com/en/blog/d",
  "https://x.com/es/servicios/divorcio",
  "https://x.com/fr/servicios/divorce",
  "https://x.com/es/",
  "https://x.com/fr",
  "https://x.com/es/contacto",
  "https://x.com/",
];

describe("pageTypeClassifier", () => {
  it("ignores the language folder so every language shares the same types", () => {
    const classify = pageTypeClassifier(urls);
    expect(classify("https://x.com/es/blog/a")).toBe("/blog/");
    expect(classify("https://x.com/fr/blog/c")).toBe("/blog/");
    expect(classify("https://x.com/fr/servicios/divorce")).toBe("/servicios/");
    expect(classify("https://x.com/es/")).toBe("Inicio");
    expect(classify("https://x.com/fr")).toBe("Inicio");
    expect(classify("https://x.com/es/contacto")).toBe("Páginas en la raíz");
  });

  it("merges folders that are the same word in other languages", () => {
    const classify = pageTypeClassifier([
      "https://x.com/services/a",
      "https://x.com/services/b",
      "https://x.com/servicios/c",
      "https://x.com/dienstleistungen/d",
      "https://x.com/dienstleistungen/e",
      "https://x.com/diensten/f",
    ]);
    expect(classify("https://x.com/servicios/c")).toBe("/servicios/");
    expect(classify("https://x.com/dienstleistungen/d")).toBe("/servicios/");
    expect(classify("https://x.com/diensten/f")).toBe("/servicios/");
  });

  it("reports which folders were merged, and keeps a lone spelling as it is", () => {
    const { merged, classify } = buildPageTypes([
      "https://x.com/services/a",
      "https://x.com/services/b",
      "https://x.com/servicios/c",
      "https://x.com/products/p",
      "https://x.com/products/q",
    ]);
    expect(merged).toEqual([
      { label: "/servicios/", folders: ["/services/", "/servicios/"] },
    ]);
    expect(classify("https://x.com/products/p")).toBe("/products/");
  });

  it("keeps working on sites without language folders", () => {
    const plain = [
      "https://x.com/blog/a",
      "https://x.com/blog/b",
      "https://x.com/precios",
    ];
    const classify = pageTypeClassifier(plain);
    expect(classify("https://x.com/blog/a")).toBe("/blog/");
    expect(classify("https://x.com/precios")).toBe("Páginas en la raíz");
  });

  it("does not mistake a real folder for a language", () => {
    const classify = pageTypeClassifier([
      "https://x.com/us/a",
      "https://x.com/us/b",
    ]);
    expect(classify("https://x.com/us/a")).toBe("/us/");
  });
});

describe("languageClassifier", () => {
  it("counts languages and labels each page by its language folder", () => {
    const result = languageClassifier(urls);
    expect(result.count).toBe(3);
    expect(result.classify("https://x.com/fr/blog/c")).toBe("/fr/");
    expect(result.classify("https://x.com/")).toBe("Sin prefijo de idioma");
  });

  it("recognises regional variants", () => {
    const result = languageClassifier([
      "https://x.com/pt-br/a",
      "https://x.com/es-es/a",
    ]);
    expect(result.count).toBe(2);
    expect(result.classify("https://x.com/pt-br/a")).toBe("/pt-br/");
  });
});

describe("queryIntent", () => {
  it("uses the landing page when the query has no intent words", () => {
    expect(
      queryIntent(
        "divorcio express",
        [],
        "https://x.com/es/servicios/divorcio",
      ),
    ).toBe("Quieren comprar o contratar");
    expect(
      queryIntent("herencia hacienda", [], "https://x.com/es/blog/herencia"),
    ).toBe("Quieren informarse");
    expect(
      queryIntent("herencia hacienda", [], "https://x.com/es/otra/herencia"),
    ).toBe("Sin intención clara");
  });

  it("lets the words of the query win over the page", () => {
    expect(queryIntent("precio divorcio", [], "https://x.com/blog/a")).toBe(
      "Quieren comprar o contratar",
    );
  });

  it("reads the kind of page from its first folder", () => {
    expect(pageKindOf("https://x.com/blog/a")).toBe("content");
    expect(
      pageKindOf("https://x.com/servicios-para-particulares/familia"),
    ).toBe("service");
    expect(pageKindOf("https://x.com/precios")).toBeNull();
  });
});

describe("segmentRows members", () => {
  it("lists the pages of each segment with their figures and changes", () => {
    const row = (
      key: string,
      clicks: number,
      impressions: number,
      position: number,
    ) => ({
      keys: [key],
      clicks,
      impressions,
      ctr: clicks / impressions,
      position,
    });
    const segments = segmentRows(
      [
        row("https://x.com/blog/a", 10, 100, 3),
        row("https://x.com/blog/b", 4, 80, 6),
      ],
      [
        row("https://x.com/blog/a", 6, 90, 4),
        row("https://x.com/blog/lost", 5, 50, 8),
      ],
      () => "/blog/",
    );
    const [blog] = segments;
    expect(blog.members.map((m) => m.key)).toEqual([
      "https://x.com/blog/a",
      "https://x.com/blog/b",
      "https://x.com/blog/lost",
    ]);
    expect(blog.members[0]).toMatchObject({ clicks: 10, prevClicks: 6 });
    // A page that no longer brings clicks still shows what it lost.
    expect(blog.members[2]).toMatchObject({ clicks: 0, prevClicks: 5 });
  });
});
