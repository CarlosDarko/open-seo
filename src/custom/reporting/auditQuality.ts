import type { AuditPage } from "@/custom/reporting/types";

/** An audit of a page Microaudit could not really read (a bot block, a
 *  challenge page or an empty JavaScript shell) reports no title and no meta
 *  description at all: no real page lacks both. Showing those failures would
 *  be false, so such audits are left out of the report and of the cache. */
export function looksUnreadable(audit: AuditPage): boolean {
  const fails = (pattern: RegExp) =>
    audit.issues.some(
      (issue) => issue.kind === "fail" && pattern.test(issue.title),
    );
  return (
    fails(/falta la etiqueta <title>/i) && fails(/falta meta description/i)
  );
}

const SIX_HOURS = 6 * 3_600_000;

/** Audits worth asking again when a report opens: the old format, or an
 *  unreadable one that is not from the last few hours (so a page that keeps
 *  blocking Microaudit is not asked again and again). */
export function needsNewAudit(audit: AuditPage, now = Date.now()): boolean {
  if (audit.version !== 3) return true;
  return (
    looksUnreadable(audit) && now - Date.parse(audit.checkedAt) > SIX_HOURS
  );
}
