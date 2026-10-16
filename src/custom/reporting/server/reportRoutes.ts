import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { SHARE_TOKEN_PATTERN } from "@/server/features/reports/shareAccess";
import { asAppError } from "@/server/lib/errors";
import { textResponse } from "@/shared/report-sandbox";
import { renderReportDocument } from "@/custom/reporting/render";
import {
  getReportById,
  getReportByToken,
} from "@/custom/reporting/server/reportingDb";

// The two raw routes of the client reports: the public page (/c/<token>) and
// the consultant's preview (/rv/<id>).

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
