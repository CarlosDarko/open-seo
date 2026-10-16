import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { SHARE_TOKEN_PATTERN } from "@/server/features/reports/shareAccess";
import { asAppError } from "@/server/lib/errors";
import { textResponse } from "@/shared/report-sandbox";
import { renderReportDocument } from "@/custom/reporting/render";
import {
  getReportById,
  getReportByToken,
  setCheck,
} from "@/custom/reporting/server/reportingDb";
import { z } from "zod";

// The three raw routes of the client reports: the public page (/c/<token>), the
// tick endpoint it posts to, and the consultant's preview (/rv/<id>).

const NOT_FOUND = "Este informe no existe o ya no está disponible.";

// The document runs its own inline script and talks only to this origin. It
// may be framed by the app (the editor's preview) and by nobody else.
const CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "img-src data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join("; ");

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": CSP,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function renderPublicReport(token: string): Promise<Response> {
  if (!SHARE_TOKEN_PATTERN.test(token)) return textResponse(NOT_FOUND, 404);
  const report = await getReportByToken(token);
  if (!report || !report.shared) return textResponse(NOT_FOUND, 404);
  return htmlResponse(renderReportDocument(report, "public"));
}

const checkBody = z.object({
  task: z.string().min(1).max(200),
  done: z.boolean(),
  by: z.enum(["cliente", "consultor"]).default("cliente"),
});

export async function handleCheck(
  token: string,
  request: Request,
): Promise<Response> {
  if (!SHARE_TOKEN_PATTERN.test(token)) return textResponse(NOT_FOUND, 404);
  // Only same-origin pages may tick: a page on another site cannot do it.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return textResponse("Origen no permitido", 403);
  }
  const report = await getReportByToken(token);
  if (!report) return textResponse(NOT_FOUND, 404);
  const parsed = checkBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return textResponse("Petición no válida", 400);
  const checks = await setCheck(
    report,
    parsed.data.task,
    parsed.data.done,
    parsed.data.by,
  );
  if (!checks) return textResponse("Tarea desconocida", 404);
  return Response.json({ ok: true });
}

export async function renderReportPreview(
  reportId: string,
  request: Request,
): Promise<Response> {
  let context;
  try {
    context = await resolveUserContextFromHeaders(request.headers);
  } catch (error) {
    if (asAppError(error)?.code !== "UNAUTHENTICATED") throw error;
    return textResponse("Inicia sesión para ver este informe.", 401);
  }
  const report = await getReportById(reportId);
  if (!report) return textResponse(NOT_FOUND, 404);
  const project = await ProjectRepository.getProjectForOrganization(
    report.projectId,
    context.organizationId,
  );
  if (!project) return textResponse(NOT_FOUND, 404);
  return htmlResponse(renderReportDocument(report, "preview"));
}
