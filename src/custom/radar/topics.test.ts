import { describe, expect, it } from "vitest";
import { buildTopics } from "@/custom/radar/topics";

const row = (
  query: string,
  clicks: number,
  impressions: number,
  position = 8,
) => ({
  keys: [query],
  clicks,
  impressions,
  ctr: impressions ? clicks / impressions : 0,
  position,
});

const queries = [
  row("impuesto herencia", 10, 800),
  row("que impuesto se paga en una herencia", 6, 500),
  row("impuestos herencia andalucia", 3, 300),
  row("adjudicacion de herencia", 8, 700),
  row("adjudicacion de herencia notario", 2, 200),
  row("como adjudicar una herencia", 1, 150),
  row("incapacidad temporal cuanto se cobra", 9, 900),
  row("cuanto paga el inss incapacidad temporal", 4, 600),
  row("incapacidad temporal duracion", 3, 400),
  row("baja por incapacidad temporal autonomo", 2, 350),
  row("fruta al por mayor barcelona", 5, 300),
  row("proveedor fruta al por mayor", 2, 200),
  row("fruta por mayor mercabarna", 1, 120),
  row("precio gratis", 0, 90),
  row("zapatillas rojas", 0, 5),
];

describe("buildTopics", () => {
  const result = buildTopics({ current: queries, previous: [] });
  const labels = result.topics.map((topic) => topic.label.toLowerCase());

  it("names topics the way a person would", () => {
    expect(labels.some((label) => label.includes("incapacidad temporal"))).toBe(
      true,
    );
    expect(labels.some((label) => label.includes("herencia"))).toBe(true);
    expect(labels.some((label) => label.includes("fruta"))).toBe(true);
  });

  it("never makes a topic out of a generic word like 'precio'", () => {
    expect(labels).not.toContain("precio");
    expect(labels).not.toContain("gratis");
  });

  it("groups the inheritance queries together, plural or singular", () => {
    const inheritance = result.topics.find((topic) =>
      topic.label.toLowerCase().includes("herencia"),
    );
    expect(inheritance).toBeDefined();
    expect(inheritance!.queries).toBeGreaterThanOrEqual(5);
  });

  it("keeps queries that fit nothing as 'Otros temas' instead of forcing them", () => {
    const others = result.topics.find((topic) => topic.label === "Otros temas");
    expect(others?.topQueries.map((q) => q.query)).toContain(
      "zapatillas rojas",
    );
  });

  it("measures the previous period with the same topics", () => {
    const withPrev = buildTopics({
      current: queries,
      previous: [row("incapacidad temporal requisitos", 5, 500)],
    });
    const topic = withPrev.topics.find((t) =>
      t.label.toLowerCase().includes("incapacidad"),
    );
    expect(topic?.prev).toMatchObject({
      queries: 1,
      clicks: 5,
      impressions: 500,
    });
  });

  it("gives the user's own topics priority and their name", () => {
    const custom = buildTopics({
      current: queries,
      previous: [],
      custom: [{ name: "Mercados mayoristas", terms: ["mercabarna", "mayor"] }],
    });
    const own = custom.topics.find(
      (topic) => topic.label === "Mercados mayoristas",
    );
    expect(own?.custom).toBe(true);
    expect(own?.topQueries.map((q) => q.query)).toContain(
      "fruta por mayor mercabarna",
    );
  });

  it("tells which topic a query belongs to", () => {
    const id = result.topicOf("incapacidad temporal prorroga");
    const topic = result.topics.find((t) => t.id === id);
    expect(topic?.label.toLowerCase()).toContain("incapacidad temporal");
  });
});
