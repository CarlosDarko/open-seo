// Spanish omits the thousands dot in four-digit numbers (1065); "always"
// keeps every figure on screen written the same way (1.065).
export const integer = new Intl.NumberFormat("es-ES", {
  useGrouping: "always",
  maximumFractionDigits: 0,
});
export const decimal = new Intl.NumberFormat("es-ES", {
  useGrouping: "always",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
export const percent = new Intl.NumberFormat("es-ES", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${integer.format(value)}`;
}

export function relativeChange(now: number, before: number): number | null {
  return before > 0 ? (now - before) / before : null;
}

/** "/ruta/de/la/pagina" for a full URL; the URL itself if it cannot be parsed. */
export function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

export function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function position(value: number | null): string {
  return value === null ? "—" : decimal.format(value);
}

/** "1 clic" / "5 clics". */
export function clicksText(count: number): string {
  return `${integer.format(count)} ${count === 1 ? "clic" : "clics"}`;
}
