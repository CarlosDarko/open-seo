// Source rewrites applied in memory while building, before translating. They
// fix text that cannot be translated as it is written upstream (for example a
// plural built by appending "s"). The upstream files stay untouched; if an
// upstream update changes the code a patch no longer matches and the build
// only prints a warning, leaving the English text in place.
//
// file: path ending of the file; from: RegExp or string; to: replacement.
export const SOURCE_PATCHES = [
  {
    // "+ N more issue" + "s" would become "problema máss": give each plural
    // form its own whole string.
    file: "src/client/features/dashboard/DashboardCards.tsx",
    from: /\+ \{([^}]+)\} more issue\s*\{\1 === 1 \? "" : "s"\}/,
    to: '+ {$1}{" "}{$1 === 1 ? "more issue" : "more issues"}',
  },
];

export function applySourcePatches(code, file) {
  let out = code;
  for (const patch of SOURCE_PATCHES) {
    if (!file.replaceAll("\\", "/").endsWith(`/${patch.file}`)) continue;
    const hit =
      typeof patch.from === "string"
        ? out.includes(patch.from)
        : patch.from.test(out);
    if (hit) out = out.replace(patch.from, patch.to);
    else
      console.warn(
        `[i18n] Parche sin efecto en ${patch.file}: el código original cambió.`,
      );
  }
  return out;
}
