// Reads the Markdown report that Microaudit (https://microaudit.page/mcp)
// returns for a URL and keeps what a client report shows: the overall score,
// the score of each category and EVERY issue with its explanation, the points
// it would add, the elements that show it and the official documentation
// Microaudit links to. Pure and forgiving: a line that does not match is
// skipped, never an error.
import type {
  AuditCategory,
  AuditIssue,
  AuditPage,
} from "@/custom/reporting/types";

const MAX_ISSUES = 40;
const MAX_ELEMENTS = 8;
const MAX_SOURCES = 4;

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

type Open = {
  kind: AuditIssue["kind"];
  title: string;
  category: string;
  points: number | null;
  detail: string[];
  evidence: string[];
  elements: AuditIssue["elements"];
  sources: { label: string; url: string }[];
};

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

  const lines = markdown.split("\n");
  const categories: AuditCategory[] = [];
  for (const line of lines) {
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
      passed: 0,
    });
  }

  const issues: AuditIssue[] = [];
  let category = "";
  let categoryId = 0;
  let inCode = false;
  let open: Open | null = null;
  const finish = () => {
    if (open && issues.length < MAX_ISSUES) {
      issues.push({
        kind: open.kind,
        title: open.title,
        category: open.category,
        points: open.points,
        detail: open.detail.join(" ").slice(0, 900),
        evidence: open.evidence.join(" · ").slice(0, 200),
        elements: open.elements.slice(0, MAX_ELEMENTS),
        sources: open.sources.slice(0, MAX_SOURCES),
      });
    }
    open = null;
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      if (open && line.trim()) open.evidence.push(line.trim());
      continue;
    }
    // ## 6. Rendimiento y Core Web Vitals — 35/100
    const section = /^##\s+(\d+)\.\s+(.+?)\s+—\s+/.exec(line);
    if (section) {
      finish();
      categoryId = Number.parseInt(section[1], 10);
      category = cleanCategory(`${section[1]}. ${section[2]}`);
      continue;
    }
    if (/^##\s/.test(line)) {
      finish();
      category = "";
      continue;
    }
    // ### Imágenes con dimensiones reservadas [Fallo]
    const head = /^###\s+(.+?)\s+\[(Fallo|Mejorable)\]\s*$/.exec(line);
    if (head && category) {
      finish();
      open = {
        kind: head[2] === "Fallo" ? "fail" : "warn",
        title: head[1].trim(),
        category,
        points: null,
        detail: [],
        evidence: [],
        elements: [],
        sources: [],
      };
      continue;
    }
    if (/^###\s/.test(line)) {
      finish();
      continue;
    }
    const passed = /^Correctos \((\d+)\)/.exec(line);
    if (passed) {
      finish();
      const found = categories.find((item) => item.id === categoryId);
      if (found) found.passed = Number.parseInt(passed[1], 10);
      continue;
    }
    if (/^No evaluables \(/.test(line)) {
      finish();
      continue;
    }
    if (!open) continue;
    const impact = /Impacto estimado[^≈]*≈\s*\+?([\d.,]+)/.exec(line);
    if (impact) {
      open.points = number(impact[1]);
      continue;
    }
    const source = /^-\s*Fuente:\s*\[(.+?)\]\((https?:\/\/[^)\s]+)\)/.exec(
      line,
    );
    if (source) {
      open.sources.push({ label: source[1].trim(), url: source[2] });
      continue;
    }
    const element = /^-\s*\[(fail|warning|warn|pass|info)\]\s*(.+)$/i.exec(
      line,
    );
    if (element) {
      // "logo.svg: https://…" is a name and its address.
      const found = element[1].toLowerCase();
      const status: AuditIssue["elements"][number]["status"] =
        found === "pass" || found === "fail" || found === "info"
          ? found
          : "warn";
      const [name, ...rest] = element[2].split(/:\s+(?=https?:\/\/)/);
      const label = name.trim();
      const link = rest.join(": ").trim();
      if (label) {
        open.elements.push({
          label: label.slice(0, 120),
          url: /^https?:\/\/\S+$/.test(link) ? link : null,
          status,
        });
      }
      continue;
    }
    if (line.trim() && !line.startsWith("- ")) open.detail.push(line.trim());
  }
  finish();

  return {
    version: 3,
    type,
    url,
    score: number(score[1]),
    rating: score[2]?.trim() ?? "",
    checkedAt: new Date().toISOString(),
    categories,
    issues,
  };
}
