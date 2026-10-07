import { describe, expect, it } from "vitest";
import {
  languageClassifier,
  pageKindOf,
  pageTypeClassifier,
  queryIntent,
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
    expect(classify("https://x.com/servicios/c")).toBe("/services/");
    expect(classify("https://x.com/dienstleistungen/d")).toBe("/services/");
    expect(classify("https://x.com/diensten/f")).toBe("/services/");
  });

  it("keeps working on sites without language folders", () => {
    const plain = ["https://x.com/blog/a", "https://x.com/blog/b", "https://x.com/precios"];
    const classify = pageTypeClassifier(plain);
    expect(classify("https://x.com/blog/a")).toBe("/blog/");
    expect(classify("https://x.com/precios")).toBe("Páginas en la raíz");
  });

  it("does not mistake a real folder for a language", () => {
    const classify = pageTypeClassifier(["https://x.com/us/a", "https://x.com/us/b"]);
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
    const result = languageClassifier(["https://x.com/pt-br/a", "https://x.com/es-es/a"]);
    expect(result.count).toBe(2);
    expect(result.classify("https://x.com/pt-br/a")).toBe("/pt-br/");
  });
});

describe("queryIntent", () => {
  it("uses the landing page when the query has no intent words", () => {
    expect(queryIntent("divorcio express", [], "https://x.com/es/servicios/divorcio")).toBe(
      "Quieren comprar o contratar",
    );
    expect(queryIntent("herencia hacienda", [], "https://x.com/es/blog/herencia")).toBe(
      "Quieren informarse",
    );
    expect(queryIntent("herencia hacienda", [], "https://x.com/es/otra/herencia")).toBe(
      "Sin intención clara",
    );
  });

  it("lets the words of the query win over the page", () => {
    expect(queryIntent("precio divorcio", [], "https://x.com/blog/a")).toBe(
      "Quieren comprar o contratar",
    );
  });

  it("reads the kind of page from its first folder", () => {
    expect(pageKindOf("https://x.com/blog/a")).toBe("content");
    expect(pageKindOf("https://x.com/servicios-para-particulares/familia")).toBe("service");
    expect(pageKindOf("https://x.com/precios")).toBeNull();
  });
});
