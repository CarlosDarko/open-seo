// "Prepare the report": the AI writes the summary and the analysis of every
// tab and reads the pages, and everything is saved here, in one operation on
// the server. (Saving from the browser after two long AI calls failed without
// a trace, and two open tabs paid for the same text twice.) A lock keeps a
// report from being prepared twice at once.
import { env } from "cloudflare:workers";
import {
  analyzeWithAi,
  draftWithAi,
  type AiWho,
} from "@/custom/reporting/server/aiDraft";
import { getReport, updateReport } from "@/custom/reporting/server/reportingDb";
import type { ReportNotes } from "@/custom/reporting/types";

const LOCK_SECONDS = 600;
const lockKey = (reportId: string) => `report:prepare:${reportId}`;

export type PrepareResult =
  | { ok: true; notes: ReportNotes; costEur: number }
  | { ok: false; reason: "missing" | "busy" | "no_key" | "failed" };

export async function prepareReportWithAi(
  projectId: string,
  reportId: string,
  who: AiWho,
): Promise<PrepareResult> {
  const report = await getReport(projectId, reportId);
  if (!report) return { ok: false, reason: "missing" };
  if (await env.KV.get(lockKey(reportId))) return { ok: false, reason: "busy" };
  await env.KV.put(lockKey(reportId), String(Date.now()), {
    expirationTtl: LOCK_SECONDS,
  });
  try {
    // Independent of each other: the summary reads the figures, the analysis
    // reads the pages. Run together to halve the wait.
    const [drafted, analysed] = await Promise.all([
      draftWithAi(report, who),
      analyzeWithAi(report, report.snapshot.siteUrl, who),
    ]);
    if (!drafted.ok && !analysed.ok) {
      console.error("[report-prepare] both AI calls failed", {
        draft: drafted.reason,
        analysis: analysed.reason,
      });
      return {
        ok: false,
        reason: drafted.reason === "no_key" ? "no_key" : "failed",
      };
    }
    let notes: ReportNotes = report.notes;
    let costEur = 0;
    if (drafted.ok) {
      costEur += drafted.costEur;
      notes = {
        ...notes,
        message: drafted.draft.message || notes.message,
        sectionNotes: { ...notes.sectionNotes, ...drafted.draft.sectionNotes },
        nextSteps: drafted.draft.nextSteps || notes.nextSteps,
      };
    }
    if (analysed.ok) {
      costEur += analysed.costEur;
      notes = {
        ...notes,
        diagnoses: analysed.diagnoses,
        titleIdeas: analysed.titleIdeas,
        opportunityIdeas: analysed.opportunityIdeas,
        contentIdeas: analysed.contentIdeas,
        hidden: notes.hidden.filter(
          (id) => id !== "diagnostico" && id !== "titulos",
        ),
      };
    }
    const saved = await updateReport(projectId, reportId, { notes });
    if (!saved) return { ok: false, reason: "failed" };
    return { ok: true, notes, costEur };
  } catch (error) {
    console.error("[report-prepare] failed", error);
    return { ok: false, reason: "failed" };
  } finally {
    await env.KV.delete(lockKey(reportId)).catch(() => undefined);
  }
}
