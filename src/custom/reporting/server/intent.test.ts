import { describe, expect, it } from "vitest";
import { intentFromWording } from "@/custom/reporting/intentWording";

describe("intentFromWording", () => {
  it("settles the intent of searches that carry a tell-tale word", () => {
    expect(intentFromWording("mejores articuladores dentales")).toBe(
      "Comparativa",
    );
    expect(intentFromWording("opalescence go opiniones")).toBe("Comparativa");
    expect(intentFromWording("comprar fresas odontologia")).toBe(
      "Transaccional",
    );
    expect(intentFromWording("prix blanchiment dentaire")).toBe(
      "Transaccional",
    );
    expect(intentFromWording("como funciona un articulador")).toBe(
      "Informativa",
    );
    expect(intentFromWording("tipos de forceps")).toBe("Informativa");
  });

  it("leaves a bare product or topic for the model to decide", () => {
    expect(intentFromWording("articulador semiajustable")).toBeNull();
    expect(intentFromWording("pola night 16")).toBeNull();
  });
});
