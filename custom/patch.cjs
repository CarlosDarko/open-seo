// Tiny exact-string patch helper used while editing upstream files. Keeps the
// file's line endings and fails loudly if a snippet is not found.
const fs = require("fs");
module.exports = (file, pairs) => {
  let s = fs.readFileSync(file, "utf8");
  const crlf = s.includes("\r\n");
  if (crlf) s = s.split("\r\n").join("\n");
  for (const [from, to] of pairs) {
    if (!s.includes(from)) throw new Error(file + ": no encontrado: " + from.slice(0, 80));
    s = s.replace(from, () => to);
  }
  if (crlf) s = s.split("\n").join("\r\n");
  fs.writeFileSync(file, s);
  console.log("ok " + file);
};
