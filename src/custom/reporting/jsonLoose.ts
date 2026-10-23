// Reads the JSON a language model answers with, forgiving what models get
// wrong (real line breaks inside strings) and logging why when it cannot.
/** Models write the paragraphs of a text with real line breaks inside the
 *  JSON strings, which JSON.parse rejects: escape control characters that sit
 *  inside a string. */
function escapeControlsInStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const char of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        out += char;
      } else if (char === "\\") {
        escaped = true;
        out += char;
      } else if (char === '"') {
        inString = false;
        out += char;
      } else if (char === "\n") {
        out += "\\n";
      } else if (char === "\r") {
        out += "";
      } else if (char === "\t") {
        out += "\\t";
      } else {
        out += char;
      }
    } else {
      if (char === '"') inString = true;
      out += char;
    }
  }
  return out;
}

export function parseJson<T>(text: string, label = "answer"): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    console.error("[report-ai] no JSON in the " + label, text.slice(0, 200));
    return null;
  }
  const body = text.slice(start, end + 1);
  try {
    return JSON.parse(body) as T;
  } catch {
    try {
      return JSON.parse(escapeControlsInStrings(body)) as T;
    } catch (error) {
      console.error(
        "[report-ai] the " + label + " is not valid JSON",
        String(error),
        body.slice(0, 200),
        "…",
        body.slice(-200),
      );
      return null;
    }
  }
}
