import { describe, expect, it } from "vitest";
import {
  looksUnreadable,
  needsNewAudit,
} from "@/custom/reporting/auditQuality";
import type { AuditPage } from "@/custom/reporting/types";

const audit = (titles: string[], checkedAt = new Date().toISOString()) =>
  ({
    version: 3,
    checkedAt,
    issues: titles.map((title) => ({ kind: "fail", title })),
  }) as unknown as AuditPage;

describe("unreadable audits", () => {
  it("flags a page with no title and no meta description, as a bot block gives", () => {
    expect(
      looksUnreadable(
        audit(["Falta la etiqueta <title>", "Falta meta description"]),
      ),
    ).toBe(true);
    expect(looksUnreadable(audit(["Falta meta description"]))).toBe(false);
  });

  it("asks again for an old unreadable audit but not for a fresh one", () => {
    const bad = ["Falta la etiqueta <title>", "Falta meta description"];
    const old = new Date(Date.now() - 8 * 3_600_000).toISOString();
    expect(needsNewAudit(audit(bad, old))).toBe(true);
    expect(needsNewAudit(audit(bad))).toBe(false);
  });
});
