// Loads the English => Spanish dictionary (custom/i18n/es*.tsv).
//
// Line formats:
//   original => translation
//   @ path/fragment | original => translation   (only for files whose path
//                                                 contains that fragment)
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
  const general = new Map();
  const scoped = new Map();

  for (const file of dictionaryFiles(dir)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((rawLine, index) => {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (!line || line.startsWith("#")) return;
      const at = line.indexOf(SEPARATOR);
      if (at < 0) {
        throw new Error(`${file}:${index + 1}: falta " => " en la línea`);
      }
      let key = line.slice(0, at).trim();
      const value = line
        .slice(at + SEPARATOR.length)
        .split("⎵")
        .join(" ")
        .split("{{app}}")
        .join(brand);
      if (key.startsWith("@ ")) {
        const bar = key.indexOf(" | ");
        if (bar < 0) throw new Error(`${file}:${index + 1}: falta " | " en el ámbito`);
        const scope = key.slice(2, bar).trim();
        key = key.slice(bar + 3).trim();
        const list = scoped.get(key) ?? [];
        list.push({ scope, value });
        scoped.set(key, list);
      } else {
        general.set(key, value);
      }
    });
  }

  return {
    has: (key) => general.has(key) || scoped.has(key),
    keys: () => [...new Set([...general.keys(), ...scoped.keys()])],
    get(key, file) {
      const match = scoped.get(key)?.find((entry) => file.includes(entry.scope));
      return match ? match.value : general.get(key);
    },
  };
}
