import { describe, expect, it } from "vitest";
import { parseMicroaudit } from "@/custom/reporting/microauditParse";

// A trimmed answer of Microaudit's audit_url tool.
const SAMPLE = `# Auditoría SEO — https://carlosortega.page/

- **Puntuación:** 70.5/100 (Mejorable)
- **Fecha:** 2026-10-23T09:09:48.534814+00:00

## Resumen por categoría

| Categoría | Nota | Fallos | Mejorables | Si se corrige todo: puntos de nota global |
|---|---|---|---|---|
| 1. Rastreo e indexación | 91.7/100 | 0 | 1 | +1 |
| 6. Rendimiento y Core Web Vitals | 35/100 | 1 | 1 | +8.9 |
| 10. AI SEO (optimización para asistentes de IA) | 35/100 | 1 | 1 | +9.6 |

## Prioridades: qué corregir primero

### A corregir (fallos)

1. **Imágenes con dimensiones reservadas** — 6. Rendimiento y Core Web Vitals · ≈ +5.1 pts — 16 de 29 imágenes no declaran width/height.

## 1. Rastreo e indexación — 91.7/100

### Sitemap declarado e incluye la URL [Mejorable]

No declarado en robots.txt, pero se ha encontrado en la ruta habitual. Decláralo igualmente.

Impacto estimado en la nota global: ≈ +1.0 puntos al resolverlo.

- Fuente: [Google Search Central: Cómo crear un sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?hl=es)

Correctos (8): La URL devuelve 200 directamente; Sin indicios de soft 404

## 6. Rendimiento y Core Web Vitals — 35/100

### Imágenes con dimensiones reservadas [Fallo]

16 de 29 imágenes no declaran width/height ni aspect-ratio: provoca saltos de diseño.

Impacto estimado en la nota global: ≈ +5.1 puntos al resolverlo.

\`\`\`
nodos totales: 1700
\`\`\`

- [fail] iebs-logo.svg: https://carlosortega.page/wp-content/uploads/iebs-logo.svg
- [fail] quondos-logo.svg: https://carlosortega.page/wp-content/uploads/quondos-logo.svg
- [pass] ok-logo.svg: https://carlosortega.page/wp-content/uploads/ok-logo.svg

- Fuente: [web.dev: Establece el tamaño de imágenes y vídeos](https://web.dev/articles/optimize-cls?hl=es#images_without_dimensions)

Correctos (4): Compresión Brotli/Gzip activa

## 10. AI SEO (optimización para asistentes de IA) — 35/100

### Archivo llms.txt [Mejorable]

No se ha encontrado https://carlosortega.page/llms.txt.

Impacto estimado en la nota global: ≈ +2.2 puntos al resolverlo.

- Fuente: [llms.txt: propuesta de estándar](https://llmstxt.org/)

Correctos (3): Acceso de crawlers de IA en robots.txt
`;

describe("parseMicroaudit", () => {
  const audit = parseMicroaudit(SAMPLE, "Inicio", "https://carlosortega.page/");

  it("reads the score, the rating and the category table", () => {
    expect(audit?.score).toBe(70.5);
    expect(audit?.rating).toBe("Mejorable");
    expect(audit?.categories.map((c) => [c.id, c.name, c.score])).toEqual([
      [1, "Rastreo e indexación", 91.7],
      [6, "Rendimiento y Core Web Vitals", 35],
      [10, "AI SEO", 35],
    ]);
    expect(audit?.categories[0].passed).toBe(8);
  });

  it("keeps every issue with its detail, impact, elements and official sources", () => {
    expect(audit?.issues).toHaveLength(3);
    const images = audit?.issues.find((issue) => issue.kind === "fail");
    expect(images).toMatchObject({
      title: "Imágenes con dimensiones reservadas",
      category: "Rendimiento y Core Web Vitals",
      points: 5.1,
      elements: [
        {
          label: "iebs-logo.svg",
          url: "https://carlosortega.page/wp-content/uploads/iebs-logo.svg",
          status: "fail",
        },
        {
          label: "quondos-logo.svg",
          url: "https://carlosortega.page/wp-content/uploads/quondos-logo.svg",
          status: "fail",
        },
        {
          label: "ok-logo.svg",
          url: "https://carlosortega.page/wp-content/uploads/ok-logo.svg",
          status: "pass",
        },
      ],
      evidence: "nodos totales: 1700",
    });
    expect(images?.detail).toContain("saltos de diseño");
    expect(images?.sources[0]).toEqual({
      label: "web.dev: Establece el tamaño de imágenes y vídeos",
      url: "https://web.dev/articles/optimize-cls?hl=es#images_without_dimensions",
    });
    const sitemap = audit?.issues.find((issue) =>
      issue.title.startsWith("Sitemap"),
    );
    expect(sitemap?.kind).toBe("warn");
    expect(sitemap?.detail).not.toContain("Correctos");
  });

  it("gives up on text that is not an audit", () => {
    expect(
      parseMicroaudit("Límite de auditorías alcanzado", "x", "u"),
    ).toBeNull();
  });
});
