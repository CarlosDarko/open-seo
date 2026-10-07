import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  buildAlertMessage,
  isSafeWebhookUrl,
  isValidEmail,
  webhookBody,
  type AlertMessage,
} from "@/custom/radar/alertMessages";
import type { Rule, Triggered } from "@/custom/radar/alertRules";

// How alerts leave the tool. Webhooks (Slack, Discord, Teams or any URL) need
// nothing else. E-mail goes through Resend: the user enters their Resend API
// key and the sender address ONCE for the whole tool (stored in KV, never
// shown again), valid for every project and user. Nothing is sent unless a
// rule asks for it.
const SETTINGS_KEY = "radar:notify:global";
const ORIGIN_KEY = "radar:origin";

const settingsSchema = z.object({
  fromEmail: z.string().max(200).nullable().default(null),
  resendKey: z.string().max(300).nullable().default(null),
});

type NotifySettings = z.infer<typeof settingsSchema>;

async function readSettings(): Promise<NotifySettings> {
  try {
    const raw = await env.KV.get(SETTINGS_KEY);
    if (!raw) return { fromEmail: null, resendKey: null };
    return settingsSchema.parse(JSON.parse(raw));
  } catch {
    return { fromEmail: null, resendKey: null };
  }
}

/** What the screen may know: the sender and whether a key is stored, never the key. */
export async function getNotifyInfo() {
  const settings = await readSettings();
  return { fromEmail: settings.fromEmail, hasKey: Boolean(settings.resendKey) };
}

/** `resendKey` undefined keeps the stored key; null removes it. */
export async function saveNotifySettings(input: {
  fromEmail: string | null;
  resendKey?: string | null;
}): Promise<void> {
  const current = await readSettings();
  const next: NotifySettings = {
    fromEmail: input.fromEmail?.trim() || null,
    resendKey:
      input.resendKey === undefined ? current.resendKey : input.resendKey?.trim() || null,
  };
  if (next.fromEmail === null && next.resendKey === null) {
    await env.KV.delete(SETTINGS_KEY);
  } else {
    await env.KV.put(SETTINGS_KEY, JSON.stringify(next));
  }
}

/** The app's address, remembered from any request, to put links in messages. */
export async function rememberOrigin(origin: string): Promise<void> {
  await env.KV.put(ORIGIN_KEY, origin);
}

export async function alertsLink(projectId: string): Promise<string | null> {
  const origin = await env.KV.get(ORIGIN_KEY);
  return origin ? `${origin}/p/${projectId}/alerts` : null;
}

export type SendResult = { channel: string; ok: boolean; error?: string };

async function sendWebhook(url: string, message: AlertMessage): Promise<SendResult> {
  if (!isSafeWebhookUrl(url)) {
    return { channel: url, ok: false, error: "Dirección de webhook no permitida" };
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(webhookBody(url, message)),
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    return response.ok
      ? { channel: url, ok: true }
      : { channel: url, ok: false, error: `Respondió ${response.status}` };
  } catch {
    return { channel: url, ok: false, error: "No se pudo conectar" };
  }
}

async function sendEmail(
  emails: string[],
  message: AlertMessage,
): Promise<SendResult> {
  const settings = await readSettings();
  if (!settings.resendKey || !settings.fromEmail) {
    return {
      channel: "correo",
      ok: false,
      error: "Falta configurar el envío de correo (clave de Resend y remitente)",
    };
  }
  const to = emails.filter(isValidEmail);
  if (to.length === 0) return { channel: "correo", ok: false, error: "Sin destinatarios válidos" };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${settings.resendKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: settings.fromEmail,
        to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return { channel: "correo", ok: true };
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    return {
      channel: "correo",
      ok: false,
      error: body.message ?? `Resend respondió ${response.status}`,
    };
  } catch {
    return { channel: "correo", ok: false, error: "No se pudo conectar con Resend" };
  }
}

/** Sends an alert to the e-mail addresses and webhooks of its rule. */
export async function sendAlertNotifications(input: {
  projectId: string;
  rule: Rule;
  summary: string;
  hits: Triggered[];
  site: string | null;
}): Promise<SendResult[]> {
  const { emails = [], webhooks = [] } = input.rule.notify ?? {};
  if (emails.length === 0 && webhooks.length === 0) return [];
  const message = buildAlertMessage({
    ruleName: input.rule.name,
    summary: input.summary,
    hits: input.hits,
    site: input.site,
    link: await alertsLink(input.projectId),
  });
  const results: SendResult[] = [];
  if (emails.length > 0) results.push(await sendEmail(emails, message));
  for (const url of webhooks) results.push(await sendWebhook(url, message));
  return results;
}

/** A harmless message to check that a channel works. */
export async function sendTestNotification(input: {
  projectId: string;
  emails: string[];
  webhook: string | null;
  site: string | null;
}): Promise<SendResult[]> {
  const message = buildAlertMessage({
    ruleName: "Mensaje de prueba",
    summary: "Si lees esto, este canal de avisos funciona.",
    hits: [],
    site: input.site,
    link: await alertsLink(input.projectId),
  });
  const results: SendResult[] = [];
  if (input.emails.length > 0) results.push(await sendEmail(input.emails, message));
  if (input.webhook) results.push(await sendWebhook(input.webhook, message));
  return results;
}
