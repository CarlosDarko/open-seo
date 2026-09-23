// Finds the user-visible English strings in the UI source. Shared by the
// translation plugin and the collect/check tools. Only strings in known UI
// positions are considered (JSX text, text-like props/attributes, toasts).
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

export const TEXT_ATTRS = new Set([
  "placeholder", "title", "aria-label", "alt", "label", "description",
  "tooltip", "helperText", "emptyMessage", "heading", "subtitle", "text",
  "header", "hint", "confirmLabel", "cancelLabel", "submitLabel",
]);
export const TEXT_PROPS = new Set([
  "label", "title", "description", "placeholder", "tooltip", "header",
  "heading", "subtitle", "text", "message", "emptyMessage", "summary", "hint",
  "cta", "helperText", "confirmLabel", "cancelLabel", "buttonLabel",
  "successMessage", "errorMessage", "loadingMessage",
]);
export const TOAST_METHODS = new Set(["success", "error", "info", "warning", "message", "loading"]);

export function isCandidate(s) {
  const t = s.trim();
  if (t.length < 2 || !/[A-Za-z]{2}/.test(t)) return false;
  if (/^[\/.#@]|:\/\/|^[a-z]+[A-Z]\w*$|^[a-z0-9_.-]+$/.test(t) && !/\s/.test(t) && !/^[A-Z]/.test(t)) return false;
  return true;
}

// Calls `found` for every plain string that an expression can render as text:
// "a", `a`, cond ? "a" : "b", cond && "a", x || "a", x ?? "a".
function forEachRenderedString(expr, found) {
  if (ts.isParenthesizedExpression(expr)) {
    forEachRenderedString(expr.expression, found);
  } else if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    if (isCandidate(expr.text)) found(expr);
  } else if (ts.isConditionalExpression(expr)) {
    forEachRenderedString(expr.whenTrue, found);
    forEachRenderedString(expr.whenFalse, found);
  } else if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      forEachRenderedString(expr.right, found);
    } else if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      forEachRenderedString(expr.left, found);
      forEachRenderedString(expr.right, found);
    }
  }
}

export function visit(sf, onString) {
  const walk = (n) => {
    if (ts.isJsxText(n)) {
      const t = n.text.replace(/\s+/g, " ").trim();
      if (isCandidate(t)) onString(t, "jsx", n);
    } else if (ts.isJsxAttribute(n) && n.initializer) {
      const name = n.name.getText(sf);
      const init = n.initializer;
      if (TEXT_ATTRS.has(name)) {
        if (ts.isStringLiteral(init)) {
          if (isCandidate(init.text)) onString(init.text, "attr", init);
        } else if (ts.isJsxExpression(init) && init.expression) {
          forEachRenderedString(init.expression, (lit) => onString(lit.text, "expr", lit));
        }
      }
    } else if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      forEachRenderedString(n.expression, (lit) => onString(lit.text, "expr", lit));
    } else if (ts.isPropertyAssignment(n) && ts.isStringLiteral(n.initializer)) {
      const name = ts.isIdentifier(n.name) || ts.isStringLiteral(n.name) ? n.name.text : "";
      if (TEXT_PROPS.has(name) && isCandidate(n.initializer.text)) onString(n.initializer.text, "prop", n.initializer);
    } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
      && n.expression.expression.getText(sf) === "toast" && TOAST_METHODS.has(n.expression.name.text)) {
      const a = n.arguments[0];
      if (a && ts.isStringLiteral(a) && isCandidate(a.text)) onString(a.text, "toast", a);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
}

export function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.(test|spec)\./.test(e.name) && !e.name.endsWith(".gen.ts") ? [p] : [];
  });
}

export function scanSource(file, code, onString) {
  const sf = ts.createSourceFile(
    file, code, ts.ScriptTarget.Latest, true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  visit(sf, (text, kind, node) => onString(text, kind, node, sf));
}

export function normalizeKey(text) {
  return text.replace(/\s+/g, " ").trim();
}
