// Removes dictionary lines whose English text no longer exists in the UI code.
//   node custom/i18n/prune.mjs         -> removes them
//   node custom/i18n/prune.mjs --dry   -> only counts them
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDictionary } from "./dictionary.mjs";
import {
  listFiles,
  normalizeKey,
  REGISTRIES,
  scanRegistry,
  scanSource,
  scanTemplates,
} from "./scan.mjs";
import { applySourcePatches } from "./patches.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const dry = process.argv.includes("--dry");

const found = new Set();
for (const dir of ["src/client", "src/routes"]) {
  for (const file of listFiles(path.join(root, dir))) {
    const code = applySourcePatches(fs.readFileSync(file, "utf8"), file);
    scanSource(file, code, (text) => {
      found.add(normalizeKey(text));
    });
    scanTemplates(file, code, (item) => found.add(item.key));
  }
}

for (const registry of REGISTRIES) {
  const file = path.join(root, registry.file);
  scanRegistry(file, fs.readFileSync(file, "utf8"), registry.props, (text) => {
    found.add(normalizeKey(text));
  });
}

const stale = new Set(
  loadDictionary(here)
    .keys()
    .filter((key) => !found.has(key)),
);

let removed = 0;
for (const name of fs
  .readdirSync(here)
  .filter((f) => /^es(\.\d+)?\.tsv$/.test(f))) {
  const file = path.join(here, name);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const kept = lines.filter((line) => {
    if (!line || line.startsWith("#")) return true;
    const at = line.indexOf(" => ");
    let key = line.slice(0, at).trim();
    if (key.startsWith("@ ")) key = key.slice(key.indexOf(" | ") + 3).trim();
    const drop = stale.has(key);
    if (drop) removed += 1;
    return !drop;
  });
  if (!dry) fs.writeFileSync(file, kept.join("\n"));
}
console.log(
  `${dry ? "Entradas obsoletas" : "Entradas eliminadas"}: ${removed}`,
);
