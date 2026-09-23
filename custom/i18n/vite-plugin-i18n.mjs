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
  scanSource,
} from "./scan.mjs";

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
        collectDataStrings(parse(file, fs.readFileSync(file, "utf8")), (key) => found.add(key));
      }
    }
    return found;
  }

  return {
    name: "carlos-ortega-i18n-es",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0].split(path.sep).join("/");
      if (!UI_FILE.test(file) || file.includes("/node_modules/")) return null;
      dataStrings ??= loadDataStrings();

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
          edits.push({ start: node.pos, end: node.end, text: lead + body + trail });
          return;
        }

        const { lead, trail } = edgeSpace(node.text);
        const literal = JSON.stringify(lead + translated + trail);
        edits.push({
          start: node.getStart(sf),
          end: node.end,
          text: kind === "attr" || kind === "attr-any" ? `{${literal}}` : literal,
        });
      });

      if (edits.length === 0) return null;
      let out = code;
      for (const edit of edits.sort((a, b) => b.start - a.start)) {
        out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
      }
      return { code: out, map: null };
    },
  };
}
