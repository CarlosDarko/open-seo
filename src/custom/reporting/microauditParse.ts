// Reads the Markdown report that Microaudit (https://microaudit.page/mcp)
// returns for a URL and keeps what a client report shows: the overall score,
// the score of each category and the issues to fix first. Pure and
// forgiving: a line that does not match is skipped, never an error.
import type {
  AuditCategory,
  AuditIssue,
  AuditPage,
} from "@/custom/reporting/types";

const MAX_ISSUES = 14;

const number = (value: string): number | null => {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

/** "10. AI SEO (optimización para asistentes de IA)" → "AI SEO". */
function cleanCategory(raw: string): string {
  return raw
    .replace(/^\d+\.\s*/, "")
    .replace(/\s*\(.*\)\s*$/, "")
    .trim();
}

export function parseMicroaudit(
  markdown: string,
  type: string,
  url: string,
): AuditPage | null {
  const score =
    /\*\*Puntuación:\*\*\s*([\d.,]+)\s*\/\s*100(?:\s*\(([^)]*)\))?/.exec(
      markdown,
    );
  if (!score) return null;

  const categories: AuditCategory[] = [];
  for (const line of markdown.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    // | 1. Rastreo e indexación | 91.7/100 | 0 | 1 | +1 |
    if (cells.length < 6) continue;
    const head = /^(\d+)\.\s*(.+)$/.exec(cells[1]);
    if (!head) continue;
    categories.push({
      id: Number.parseInt(head[1], 10),
      name: cleanCategory(cells[1]),
      score: number(cells[2].replace("/100", "")),
      fails: Number.parseInt(cells[3], 10) || 0,
      warns: Number.parseInt(cells[4], 10) || 0,
    });
  }

  const issues: AuditIssue[] = [];
  let kind: AuditIssue["kind"] | null = null;
  for (const line of markdown.split("\n")) {
    if (/^###\s+A corregir/i.test(line)) kind = "fail";
    else if (/^###\s+A mejorar/i.test(line)) kind = "warn";
    else if (/^##\s/.test(line)) kind = null;
    if (!kind) continue;
    // 1. **Title** — 10. AI SEO (...) · ≈ +7.4 pts — Detail
    const match =
      /^\d+\.\s+\*\*(.+?)\*\*\s+[—-]\s+(.+?)\s+·\s+≈\s*\+?([\d.,]+)\s*pts\s+[—-]\s+(.*)$/.exec(
        line,
      );
    if (!match || issues.length >= MAX_ISSUES * 2) continue;
    issues.push({
      kind,
      title: match[1].trim(),
      category: cleanCategory(match[2]),
      points: number(match[3]),
      detail: match[4].trim().slice(0, 280),
    });
  }

  return {
    type,
    url,
    score: number(score[1]),
    rating: score[2]?.trim() ?? "",
    checkedAt: new Date().toISOString(),
    categories,
    issues: issues.slice(0, MAX_ISSUES),
  };
}
