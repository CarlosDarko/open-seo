// Finds the English strings in the UI source that can reach the screen.
// Shared by the translation plugin and the check/missing tools.
//
// kinds reported to the callback:
//   jsx       text between tags
//   attr      string attribute of a text-like JSX attribute (placeholder, title, ...)
//   expr      string rendered by a JSX expression / conditional
//   prop      string in a text-like object property (label, title, ...)
//   toast     first argument of toast.success(...) and friends
//   attr-any  any other string JSX attribute
//   any       any other string literal
// "attr-any" and "any" are only translated when the text is never compared
// or looked up as data anywhere in the UI code (see collectDataStrings).
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

export const TEXT_ATTRS = new Set([
  "placeholder",
  "title",
  "aria-label",
  "alt",
  "label",
  "description",
  "tooltip",
  "helperText",
  "emptyMessage",
  "heading",
  "subtitle",
  "text",
  "header",
  "hint",
  "confirmLabel",
  "cancelLabel",
  "submitLabel",
  "message",
]);
export const TEXT_PROPS = new Set([
  "label",
  "title",
  "description",
  "placeholder",
  "tooltip",
  "header",
  "heading",
  "subtitle",
  "text",
  "message",
  "emptyMessage",
  "summary",
  "hint",
  "cta",
  "helperText",
  "confirmLabel",
  "cancelLabel",
  "buttonLabel",
  "successMessage",
  "errorMessage",
  "loadingMessage",
  "detail",
]);
export const TOAST_METHODS = new Set([
  "success",
  "error",
  "info",
  "warning",
  "message",
  "loading",
]);

// JSX attributes whose string is data or an identifier, never copy.
const DATA_ATTRS = new Set([
  "className",
  "class",
  "id",
  "key",
  "href",
  "src",
  "to",
  "type",
  "name",
  "htmlFor",
  "rel",
  "target",
  "role",
  "style",
  "value",
  "defaultValue",
  "variant",
  "size",
  "color",
  "kind",
  "mode",
  "as",
  "ref",
  "autoComplete",
  "inputMode",
  "method",
  "action",
  "viewBox",
  "d",
  "fill",
  "stroke",
]);

// Method names that look a string up as data.
const LOOKUP_METHODS = new Set([
  "includes",
  "has",
  "get",
  "set",
  "startsWith",
  "endsWith",
  "indexOf",
  "lastIndexOf",
  "add",
  "delete",
  "querySelector",
  "querySelectorAll",
  "getElementById",
  "getItem",
  "setItem",
  "removeItem",
  "append",
  "test",
  "match",
  "split",
  "join",
  "replace",
  "replaceAll",
  "localeCompare",
]);

const COMPARE_OPS = new Set([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

export function isCandidate(s) {
  const t = s.trim();
  if (t.length < 2 || !/[A-Za-z]{2}/.test(t)) return false;
  // Only paths and URLs are skipped: this runs on strings in visible
  // positions, and a word is only ever translated if the dictionary has it.
  if (/^[\/.#@]|:\/\//.test(t) && !/\s/.test(t)) return false;
  return true;
}

// Does this look like human-facing copy (used to list what still needs translating)?
export function looksLikeCopy(s) {
  const t = s.trim();
  if (t.length < 3 || !/[a-z]/.test(t) || !/^[A-Z…¿¡]/.test(t)) return false;
  if (/^[A-Z0-9_]+$/.test(t) || /^[A-Z][a-z]+[A-Z]\w*$/.test(t)) return false;
  if (/^[A-Za-z]+:\/\//.test(t) || (/^[A-Z][a-z]*$/.test(t) && t.length < 4))
    return false;
  return true;
}

export function normalizeKey(text) {
  return text.replace(/\s+/g, " ").trim();
}

// True when the literal is an identifier/structure rather than something shown.
function isStructural(n) {
  const p = n.parent;
  if (!p) return true;
  if (
    ts.isImportDeclaration(p) ||
    ts.isExportDeclaration(p) ||
    ts.isExternalModuleReference(p)
  )
    return true;
  if (ts.isLiteralTypeNode(p) || ts.isImportTypeNode(p)) return true;
  if (
    (ts.isPropertyAssignment(p) ||
      ts.isPropertySignature(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isPropertyDeclaration(p)) &&
    p.name === n
  )
    return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === n)
    return true;
  if (ts.isCaseClause(p) || ts.isEnumMember(p)) return true;
  if (ts.isBinaryExpression(p) && COMPARE_OPS.has(p.operatorToken.kind))
    return true;
  if (ts.isJsxAttribute(p))
    return (
      DATA_ATTRS.has(p.name.getText()) || p.name.getText().startsWith("data-")
    );
  if (ts.isCallExpression(p) && p.arguments.includes(n)) {
    const callee = p.expression;
    const name = ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : ts.isIdentifier(callee)
        ? callee.text
        : "";
    if (LOOKUP_METHODS.has(name) || name === "require" || name === "import")
      return true;
  }
  if (ts.isNewExpression(p) && p.arguments && p.arguments.includes(n)) {
    const name = p.expression.getText();
    if (name === "URL" || name === "RegExp" || name === "Set" || name === "Map")
      return true;
  }
  return false;
}

// Calls `found` for every plain string that an expression can render as text:
// "a", `a`, cond ? "a" : "b", cond && "a", x || "a", x ?? "a".
export function forEachRenderedString(expr, found) {
  if (ts.isParenthesizedExpression(expr)) {
    forEachRenderedString(expr.expression, found);
  } else if (
    ts.isStringLiteral(expr) ||
    ts.isNoSubstitutionTemplateLiteral(expr)
  ) {
    if (isCandidate(expr.text)) found(expr);
  } else if (ts.isConditionalExpression(expr)) {
    forEachRenderedString(expr.whenTrue, found);
    forEachRenderedString(expr.whenFalse, found);
  } else if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      forEachRenderedString(expr.right, found);
    } else if (
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken
    ) {
      forEachRenderedString(expr.left, found);
      forEachRenderedString(expr.right, found);
    }
  }
}

export function visit(sf, onString) {
  const handled = new Set();
  const report = (text, kind, node) => {
    handled.add(node);
    onString(text, kind, node);
  };

  const walk = (n) => {
    if (ts.isJsxText(n)) {
      const t = n.text.replace(/\s+/g, " ").trim();
      if (isCandidate(t)) report(t, "jsx", n);
    } else if (ts.isJsxAttribute(n) && n.initializer) {
      const name = n.name.getText(sf);
      const init = n.initializer;
      if (TEXT_ATTRS.has(name)) {
        if (ts.isStringLiteral(init)) {
          if (isCandidate(init.text)) report(init.text, "attr", init);
        } else if (ts.isJsxExpression(init) && init.expression) {
          forEachRenderedString(init.expression, (lit) =>
            report(lit.text, "expr", lit),
          );
        }
      }
    } else if (
      ts.isJsxExpression(n) &&
      n.expression &&
      (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))
    ) {
      forEachRenderedString(n.expression, (lit) =>
        report(lit.text, "expr", lit),
      );
    } else if (ts.isPropertyAssignment(n)) {
      const name =
        ts.isIdentifier(n.name) || ts.isStringLiteral(n.name)
          ? n.name.text
          : "";
      if (TEXT_PROPS.has(name)) {
        forEachRenderedString(n.initializer, (lit) =>
          report(lit.text, "prop", lit),
        );
      }
    } else if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.expression.getText(sf) === "toast" &&
      TOAST_METHODS.has(n.expression.name.text)
    ) {
      const a = n.arguments[0];
      if (a) forEachRenderedString(a, (lit) => report(lit.text, "toast", lit));
    } else if (
      (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) &&
      !handled.has(n) &&
      n.text.trim().length >= 2 &&
      !isStructural(n)
    ) {
      onString(n.text, ts.isJsxAttribute(n.parent) ? "attr-any" : "any", n);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
}

// Strings the code compares or looks up as data. They must not be translated
// outside of clearly visible positions, or the logic would stop matching.
export function collectDataStrings(sf, add) {
  const walk = (n) => {
    if (
      (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) &&
      n.parent
    ) {
      const p = n.parent;
      const compared =
        ts.isCaseClause(p) ||
        (ts.isBinaryExpression(p) && COMPARE_OPS.has(p.operatorToken.kind)) ||
        (ts.isCallExpression(p) &&
          p.arguments.includes(n) &&
          isLookupCall(p)) ||
        (ts.isElementAccessExpression(p) && p.argumentExpression === n) ||
        ts.isEnumMember(p);
      if (compared) add(normalizeKey(n.text));
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
}

function isLookupCall(call) {
  const callee = call.expression;
  const name = ts.isPropertyAccessExpression(callee)
    ? callee.name.text
    : ts.isIdentifier(callee)
      ? callee.text
      : "";
  return LOOKUP_METHODS.has(name);
}

export function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return listFiles(p);
    return /\.tsx?$/.test(e.name) &&
      !/\.(test|spec)\./.test(e.name) &&
      !e.name.endsWith(".gen.ts")
      ? [p]
      : [];
  });
}

export function parse(file, code) {
  return ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

export function scanSource(file, code, onString) {
  const sf = parse(file, code);
  visit(sf, (text, kind, node) => onString(text, kind, node, sf));
}

// Display text that lives outside the UI folders, in registries of plain
// objects: the file, and the property names whose string values people see.
export const REGISTRIES = [
  {
    file: "src/shared/audit-issues.ts",
    props: ["title", "explanation", "howToFix"],
  },
];

export function scanRegistry(file, code, props, onString) {
  const sf = parse(file, code);
  const walk = (n) => {
    const value = ts.isPropertyAssignment(n) ? n.initializer : null;
    if (
      value &&
      ts.isIdentifier(n.name) &&
      props.includes(n.name.text) &&
      (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
    ) {
      onString(value.text, value, sf);
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
}

// Template literals with substitutions (`crawled ${n} pages`) cannot be keyed
// as plain strings. They are keyed with numbered placeholders instead
// ("crawled {1} pages"), so translations survive a renamed variable. Strings
// rendered by the expressions inside them are reported as well.
// `onItem({ kind: "template" | "string", key, node, sf })`
export function scanTemplates(file, code, onItem) {
  const sf = parse(file, code);
  const walk = (n) => {
    if (
      ts.isTemplateExpression(n) &&
      !ts.isTaggedTemplateExpression(n.parent)
    ) {
      const parts = [n.head.text];
      n.templateSpans.forEach((span, i) =>
        parts.push(`{${i + 1}}${span.literal.text}`),
      );
      onItem({
        kind: "template",
        key: normalizeKey(parts.join("")),
        node: n,
        sf,
      });
      for (const span of n.templateSpans) {
        forEachRenderedString(span.expression, (lit) =>
          onItem({
            kind: "string",
            key: normalizeKey(lit.text),
            node: lit,
            sf,
          }),
        );
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
}
