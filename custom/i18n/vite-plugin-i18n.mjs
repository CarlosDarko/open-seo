// Build-time Spanish translation layer. It rewrites the English UI strings
// listed in the dictionary while Vite compiles the source, so the original
// files are never edited and upstream updates merge without conflicts.
// Anything not in the dictionary stays in English.
//
// Strings in clearly visible positions (text between tags, placeholder, title,
// label, toasts, ...) are always translated. Any other string literal is only
// translated if the code never compares or looks that text up as data, so
// internal logic keeps working.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDictionary } from "./dictionary.mjs";
import {
  collectDataStrings,
  listFiles,
  normalizeKey,
  parse,
  REGISTRIES,
  scanRegistry,
  scanSource,
  scanTemplates,
} from "./scan.mjs";
import { applySourcePatches } from "./patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const UI_FILE = /\/src\/(client|routes)\/.+\.tsx?$/;
const ALWAYS = new Set(["jsx", "attr", "expr", "prop", "toast"]);

function edgeSpace(raw) {
  return {
    lead: raw.slice(0, raw.length - raw.trimStart().length),
    trail: raw.slice(raw.trimEnd().length),
  };
}

/** @returns {import("vite").Plugin} */
export function translateEs() {
  const dictionary = loadDictionary(here);
  const root = path.resolve(here, "..", "..");
  let dataStrings = null;

  function loadDataStrings() {
    const found = new Set();
    for (const dir of ["src/client", "src/routes"]) {
      for (const file of listFiles(path.join(root, dir))) {
        collectDataStrings(parse(file, fs.readFileSync(file, "utf8")), (key) =>
          found.add(key),
        );
      }
    }
    return found;
  }

  function escapeTemplate(text) {
    return text
      .replaceAll("\\", "\\\\")
      .replaceAll("`", "\\`")
      .replaceAll("${", "\\${");
  }

  // Rewrites template literals that have a dictionary entry, e.g.
  // "crawled {1} pages · {2}" => "{1} páginas rastreadas · {2}". Strings shown
  // by conditionals inside the substitutions are translated first, then
  // templates innermost-first, so nested templates keep their translations.
  function translateTemplates(code, file) {
    let out = code;
    for (let pass = 0; pass < 8; pass += 1) {
      const strings = [];
      const templates = [];
      scanTemplates(file, out, (item) => {
        const translated = dictionary.get(item.key, file);
        if (translated === undefined) return;
        (item.kind === "string" ? strings : templates).push({
          ...item,
          translated,
        });
      });

      if (pass === 0 && strings.length > 0) {
        for (const item of strings.sort(
          (a, b) => b.node.getStart(b.sf) - a.node.getStart(a.sf),
        )) {
          const { lead, trail } = edgeSpace(item.node.text);
          out =
            out.slice(0, item.node.getStart(item.sf)) +
            JSON.stringify(lead + item.translated + trail) +
            out.slice(item.node.end);
        }
        continue;
      }

      const innermost = templates.filter(
        (a) =>
          !templates.some(
            (b) =>
              b !== a && b.node.pos >= a.node.pos && b.node.end <= a.node.end,
          ),
      );
      if (innermost.length === 0) break;
      for (const item of innermost.sort((a, b) => b.node.pos - a.node.pos)) {
        const expressions = item.node.templateSpans.map((span) =>
          out.slice(span.expression.getStart(item.sf), span.expression.end),
        );
        const body = item.translated
          .split(/(\{\d+\})/)
          .map((piece) => {
            const slot = /^\{(\d+)\}$/.exec(piece);
            if (!slot) return escapeTemplate(piece);
            const expression = expressions[Number(slot[1]) - 1];
            return expression === undefined ? "" : `\${${expression}}`;
          })
          .join("");
        out =
          out.slice(0, item.node.getStart(item.sf)) +
          "`" +
          body +
          "`" +
          out.slice(item.node.end);
      }
    }
    return out;
  }

  return {
    name: "carlos-ortega-i18n-es",
    enforce: "pre",
    transform(original, id) {
      let code = original;
      const file = id.split("?")[0].split(path.sep).join("/");
      const registry = REGISTRIES.find((r) => file.endsWith(`/${r.file}`));
      if (registry) {
        const edits = [];
        scanRegistry(file, code, registry.props, (text, node, sf) => {
          const translated = dictionary.get(normalizeKey(text), file);
          if (translated !== undefined) {
            edits.push({
              start: node.getStart(sf),
              end: node.end,
              text: JSON.stringify(translated),
            });
          }
        });
        if (edits.length === 0) return null;
        let out = code;
        for (const edit of edits.sort((a, b) => b.start - a.start)) {
          out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
        }
        return { code: out, map: null };
      }
      if (!UI_FILE.test(file) || file.includes("/node_modules/")) return null;
      dataStrings ??= loadDataStrings();
      code = translateTemplates(applySourcePatches(code, file), file);

      const edits = [];
      scanSource(file, code, (text, kind, node, sf) => {
        const key = normalizeKey(text);
        const translated = dictionary.get(key, file);
        if (translated === undefined) return;
        if (!ALWAYS.has(kind) && dataStrings.has(key)) return;

        if (kind === "jsx") {
          const raw = code.slice(node.pos, node.end);
          const { lead, trail } = edgeSpace(raw);
          // JSX text cannot contain { } < > — fall back to an expression.
          const body = /[{}<>]/.test(translated)
            ? `{${JSON.stringify(translated)}}`
            : translated;
          edits.push({
            start: node.pos,
            end: node.end,
            text: lead + body + trail,
          });
          return;
        }

        const { lead, trail } = edgeSpace(node.text);
        const literal = JSON.stringify(lead + translated + trail);
        edits.push({
          start: node.getStart(sf),
          end: node.end,
          text:
            kind === "attr" || kind === "attr-any" ? `{${literal}}` : literal,
        });
      });

      if (edits.length === 0) {
        return code === original ? null : { code, map: null };
      }
      let out = code;
      for (const edit of edits.sort((a, b) => b.start - a.start)) {
        out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
      }
      return { code: out, map: null };
    },
  };
}
