import { describe, expect, it } from "vitest";
import {
  buildAlertMessage,
  isSafeWebhookUrl,
  isValidEmail,
  webhookBody,
} from "@/custom/radar/alertMessages";

const message = buildAlertMessage({
  ruleName: "Caída de clics",
  summary: "2 páginas con cambio en los clics en los últimos 7 días.",
  hits: [
    { label: "/a", url: null, before: 100, after: 40, changePct: -60 },
    { label: "/b", url: null, before: 50, after: 30, changePct: -40 },
  ],
  site: "x.com",
  link: "https://app.example/p/1/alerts",
});

describe("buildAlertMessage", () => {
  it("writes a subject, a text with the items and a link", () => {
    expect(message.subject).toBe("Alerta SEO · x.com: Caída de clics");
    expect(message.text).toContain("• /a: 100 → 40 (-60 %)");
    expect(message.text).toContain("https://app.example/p/1/alerts");
  });

  it("escapes HTML coming from queries and pages", () => {
    const risky = buildAlertMessage({
      ruleName: "x",
      summary: "<script>alert(1)</script>",
      hits: [],
      site: null,
      link: null,
    });
    expect(risky.html).not.toContain("<script>");
    expect(risky.html).toContain("&lt;script&gt;");
  });
});

describe("webhookBody", () => {
  it("uses the field each service expects", () => {
    expect(webhookBody("https://hooks.slack.com/services/T/B/x", message)).toHaveProperty("text");
    expect(webhookBody("https://discord.com/api/webhooks/1/x", message)).toHaveProperty("content");
    expect(webhookBody("https://example.com/hook", message)).toHaveProperty("subject");
  });
});

describe("isSafeWebhookUrl", () => {
  it("accepts public https URLs only", () => {
    expect(isSafeWebhookUrl("https://hooks.slack.com/services/x")).toBe(true);
    expect(isSafeWebhookUrl("http://hooks.slack.com/x")).toBe(false);
    expect(isSafeWebhookUrl("https://127.0.0.1/x")).toBe(false);
    expect(isSafeWebhookUrl("https://localhost/x")).toBe(false);
    expect(isSafeWebhookUrl("https://[::1]/x")).toBe(false);
    expect(isSafeWebhookUrl("https://intranet/x")).toBe(false);
    expect(isSafeWebhookUrl("https://server.internal/x")).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("recognises an address", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
  });
});
