// The messages an alert sends outside the tool: e-mail and webhooks. Pure
// text building and validation; the sending is in server/notify.ts.
import type { Triggered } from "@/custom/radar/alertRules";

export type AlertMessage = { subject: string; text: string; html: string };

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function number(value: number): string {
  return (Math.round(value * 10) / 10).toLocaleString("es-ES");
}

function hitLine(hit: Triggered): string {
  const change =
    hit.changePct === null
      ? ""
      : ` (${hit.changePct > 0 ? "+" : ""}${hit.changePct.toFixed(0)} %)`;
  return `${hit.label}: ${number(hit.before)} → ${number(hit.after)}${change}`;
}

export function buildAlertMessage(input: {
  ruleName: string;
  summary: string;
  hits: Triggered[];
  /** The site's name (its domain), when known. */
  site: string | null;
  /** Link to the alerts page, when known. */
  link: string | null;
}): AlertMessage {
  const lines = input.hits.slice(0, 10).map(hitLine);
  const subject = `Alerta SEO${input.site ? ` · ${input.site}` : ""}: ${input.ruleName}`;
  const text = [
    input.summary,
    ...(lines.length > 1 ? ["", ...lines.map((line) => `• ${line}`)] : []),
    ...(input.link ? ["", `Ver los avisos: ${input.link}`] : []),
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">
<p><strong>${escapeHtml(subject)}</strong></p>
<p>${escapeHtml(input.summary)}</p>
${
  lines.length > 1
    ? `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
    : ""
}
${input.link ? `<p><a href="${escapeHtml(input.link)}">Ver los avisos</a></p>` : ""}
</div>`;
  return { subject, text, html };
}

/** The JSON body a webhook expects: Slack, Discord and Teams each want their
 *  own field; any other URL gets a generic body. */
export function webhookBody(url: string, message: AlertMessage): unknown {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  const full = `*${message.subject}*\n${message.text}`;
  if (host === "hooks.slack.com") return { text: full };
  if (host === "discord.com" || host === "discordapp.com") {
    return { content: full.replace(/\*/g, "**").slice(0, 1900) };
  }
  if (host.endsWith("webhook.office.com") || host === "outlook.office.com") {
    return { text: full.replace(/\n/g, "\n\n") };
  }
  return { subject: message.subject, text: message.text };
}

/** Webhooks must be https and point at a public hostname: never an IP address
 *  or an internal name. */
export function isSafeWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (!host.includes(".")) return false;
    if (/^[0-9.]+$/.test(host) || host.includes(":")) return false;
    return !(
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}
