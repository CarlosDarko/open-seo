// Translation maintenance tool.
//   node custom/i18n/cli.mjs check    -> untranslated strings + dictionary typos
//   node custom/i18n/cli.mjs missing  -> only the strings still missing (to translate)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDictionary } from "./dictionary.mjs";
import { listFiles, looksLikeCopy, normalizeKey, scanSource } from "./scan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const ALWAYS = new Set(["jsx", "attr", "expr", "prop", "toast"]);

const found = new Set();
const foundAll = new Set();
for (const dir of ["src/client", "src/routes"]) {
  for (const file of listFiles(path.join(root, dir))) {
    const code = fs.readFileSync(file, "utf8");
    scanSource(file, code, (text, kind) => {
      const key = normalizeKey(text);
      foundAll.add(key);
      // Generic literals only count when they look like copy; visible
      // positions always count.
      if (ALWAYS.has(kind) || looksLikeCopy(key)) found.add(key);
    });
  }
}

const dictionary = loadDictionary(here);
const missing = [...found].filter((key) => !dictionary.has(key)).sort();
const unknown = dictionary.keys().filter((key) => !foundAll.has(key)).sort();
const command = process.argv[2] ?? "check";

if (command === "missing") {
  console.log(missing.join("\n"));
} else {
  console.log(`Textos en la interfaz: ${found.size}`);
  console.log(`Traducidos: ${found.size - missing.length}`);
  console.log(`Sin traducir: ${missing.length}`);
  console.log(`Entradas del diccionario que ya no aparecen en el código: ${unknown.length}`);
  if (unknown.length > 0) {
    console.log("\n-- Entradas sin coincidencia (¿errata o texto que cambió?) --");
    console.log(unknown.join("\n"));
  }
}
