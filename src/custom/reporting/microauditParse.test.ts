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
| 6. Rendimiento y Core Web Vitals | 35/100 | 1 | 3 | +8.9 |
| 10. AI SEO (optimización para asistentes de IA) | 35/100 | 1 | 1 | +9.6 |

## Prioridades: qué corregir primero

### A corregir (fallos)

1. **Sin bloqueo por firewall/WAF a bots de IA** — 10. AI SEO (optimización para asistentes de IA) · ≈ +7.4 pts — Devuelven 403 (Forbidden) a la petición directa: Bytespider.
2. **Imágenes con dimensiones reservadas** — 6. Rendimiento y Core Web Vitals · ≈ +5.1 pts — 16 de 29 imágenes no declaran width/height.

### A mejorar (mejorables)

1. **Archivo llms.txt** — 10. AI SEO (optimización para asistentes de IA) · ≈ +2.2 pts — No se ha encontrado https://carlosortega.page/llms.txt.
- …y 2 más (todos figuran en el detalle).

## 1. Rastreo e indexación — 91.7/100
`;

describe("parseMicroaudit", () => {
  const audit = parseMicroaudit(SAMPLE, "Inicio", "https://carlosortega.page/");

  it("reads the score, the rating and the category table", () => {
    expect(audit?.score).toBe(70.5);
    expect(audit?.rating).toBe("Mejorable");
    expect(audit?.categories).toEqual([
      { id: 1, name: "Rastreo e indexación", score: 91.7, fails: 0, warns: 1 },
      {
        id: 6,
        name: "Rendimiento y Core Web Vitals",
        score: 35,
        fails: 1,
        warns: 3,
      },
      { id: 10, name: "AI SEO", score: 35, fails: 1, warns: 1 },
    ]);
  });

  it("reads the issues in the order Microaudit ranks them, fails first", () => {
    expect(audit?.issues.map((issue) => issue.kind)).toEqual([
      "fail",
      "fail",
      "warn",
    ]);
    expect(audit?.issues[0]).toMatchObject({
      title: "Sin bloqueo por firewall/WAF a bots de IA",
      category: "AI SEO",
      points: 7.4,
    });
  });

  it("gives up on text that is not an audit", () => {
    expect(
      parseMicroaudit("Límite de auditorías alcanzado", "x", "u"),
    ).toBeNull();
  });
});
