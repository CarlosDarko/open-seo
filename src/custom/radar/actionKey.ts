import { canonicalPageKey } from "@/custom/radar/radarAnalysis";

/** A stable identity for an action: its kind plus the page and the query it is
 *  about. URL variants of the same page give the same key, so an action stays
 *  "done" even if Search Console reports the page under another variant. */
export function actionKey(action: {
  kind: string;
  page: string | null;
  query: string | null;
}): string {
  return `${action.kind}:${action.page ? canonicalPageKey(action.page) : ""}|${(action.query ?? "").toLowerCase()}`;
}
