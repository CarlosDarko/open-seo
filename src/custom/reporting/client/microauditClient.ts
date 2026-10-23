// Asks Microaudit (https://microaudit.page/mcp) to audit one URL. It runs in
// the consultant's browser on purpose: Microaudit limits audits per IP and the
// consultant's own address is the one that is allowed, while a request from
// the server would come from a shared Cloudflare address. The Markdown it
// returns is sent to the server to be read and stored in the report.
const MICROAUDIT_URL = "https://microaudit.page/mcp";

export type MicroauditResult =
  | { ok: true; markdown: string }
  | { ok: false; message: string };

export async function runMicroaudit(url: string): Promise<MicroauditResult> {
  try {
    const response = await fetch(MICROAUDIT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "audit_url",
          arguments: { url, only_issues: true, include_web_vitals: true },
        },
      }),
      signal: AbortSignal.timeout(150_000),
    });
    const body = await response.text();
    const dataLine = body.split("\n").find((line) => line.startsWith("data:"));
    const json = JSON.parse(dataLine ? dataLine.slice(5) : body) as {
      result?: { isError?: boolean; content?: { text?: string }[] };
      error?: { message?: string };
    };
    const text = json.result?.content?.[0]?.text ?? "";
    if (json.result?.isError || json.error || !text) {
      return {
        ok: false,
        message: (text || json.error?.message || "Sin respuesta").slice(0, 220),
      };
    }
    return { ok: true, markdown: text };
  } catch {
    return {
      ok: false,
      message: "No se pudo conectar con Microaudit. Prueba de nuevo.",
    };
  }
}
