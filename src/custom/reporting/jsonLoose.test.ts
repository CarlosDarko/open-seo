import { describe, expect, it } from "vitest";
import { parseJson } from "@/custom/reporting/jsonLoose";

describe("parseJson", () => {
  it("reads plain JSON surrounded by chatter", () => {
    expect(parseJson<{ a: number }>('Aquí va: {"a": 1} listo')).toEqual({
      a: 1,
    });
  });

  it("accepts real line breaks inside strings, as models write paragraphs", () => {
    const text =
      '{"message": "Primer párrafo.\n\nSegundo párrafo con «comillas».", "nextSteps": "uno\ndos"}';
    expect(parseJson<{ message: string; nextSteps: string }>(text)).toEqual({
      message: "Primer párrafo.\n\nSegundo párrafo con «comillas».",
      nextSteps: "uno\ndos",
    });
  });

  it("keeps escaped quotes and gives up on broken JSON", () => {
    expect(parseJson<{ a: string }>('{"a": "dijo \\"hola\\""}')).toEqual({
      a: 'dijo "hola"',
    });
    expect(parseJson('{"a": "sin cerrar')).toBeNull();
  });
});
