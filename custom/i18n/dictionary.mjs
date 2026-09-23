// Loads the English => Spanish dictionary (custom/i18n/es*.tsv).
// Line format:  original => translation
// In translations: {{app}} becomes the brand name from brand.json, and the
// character ⎵ becomes a space (to keep a space at the start or end).
import fs from "node:fs";
import path from "node:path";

const SEPARATOR = " => ";

export function dictionaryFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((name) => /^es(\.\d+)?\.tsv$/.test(name))
    .sort()
    .map((name) => path.join(dir, name));
}

export function loadDictionary(dir) {
  const brand = JSON.parse(
    fs.readFileSync(path.join(dir, "brand.json"), "utf8"),
  ).name;
  const entries = new Map();
  for (const file of dictionaryFiles(dir)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((rawLine, index) => {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (!line || line.startsWith("#")) return;
      const at = line.indexOf(SEPARATOR);
      if (at < 0) {
        throw new Error(`${file}:${index + 1}: falta " => " en la línea`);
      }
      const key = line.slice(0, at).trim();
      const value = line
        .slice(at + SEPARATOR.length)
        .split("⎵")
        .join(" ")
        .split("{{app}}")
        .join(brand);
      entries.set(key, value);
    });
  }
  return entries;
}
