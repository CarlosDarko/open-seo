// Turns a stored client report into one self-contained web page in Carlos
// Ortega's brand. The page opens with the cover (the analysed period is the
// first thing it says) and, when there is one, an executive summary written as
// a paragraph. Then it works like a small app: tabs (traffic, positioning,
// searches, pages, topics, opportunities, technical), sub-tabs and columns keep
// every table and chart one click away instead of in an endless scroll. Every
// table sorts and filters, every URL opens in a new tab and a dedicated print
// layout turns the same data into a PDF. Everything that comes from data is
// escaped here. The text never addresses the reader as "tú": the subject is
// the website.
import { integer } from "@/custom/radar/format";
import { looksUnreadable } from "@/custom/reporting/auditQuality";
import {
  KIND_COLOR,
  KIND_NAME,
  KIND_SHORT,
} from "@/custom/radar/googleUpdates";
import {
  FAVICON_POSITIVE,
  LOGO_HORIZONTAL_LIGHT,
  LOGO_MARK_LIGHT,
} from "@/custom/reporting/brandAssets";
import {
  buildInsights,
  pathOf,
  updateImpacts,
  weekdayStats,
  type Insight,
} from "@/custom/reporting/insights";
import { buildVerdict, percentChange } from "@/custom/reporting/narrative";
import { REPORT_SCRIPT } from "@/custom/reporting/renderScript";
import { CARLOS, type Network, type Signer } from "@/custom/reporting/signers";
import { REPORT_CSS } from "@/custom/reporting/renderStyles";
import {
  type AuditPage,
  type ChangeLine,
  type OpportunityLine,
  type PageRow,
  type QueryRow,
  type QueryTableRow,
  type ReportFull,
  type SectionId,
  type SegmentLine,
  type TopicLine,
} from "@/custom/reporting/types";

const BACKSLASH = String.fromCharCode(92);
const ESCAPES: [string, string][] = [
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&#39;"],
];

export function esc(value: string): string {
  let out = value;
  for (const [from, to] of ESCAPES) out = out.replaceAll(from, to);
  return out;
}

const one = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const dateFormat = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Madrid",
});
const dayMonth = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  timeZone: "Europe/Madrid",
});
const shortDate = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Madrid",
});

const num = (value: number) => integer.format(Math.round(value));
const pos = (value: number | null) =>
  value === null ? "—" : one.format(value);
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const day = (iso: string) => dateFormat.format(at(iso));
const dayShort = (iso: string) => shortDate.format(at(iso));
const signedNum = (value: number) =>
  `${value >= 0 ? "+" : "−"}${num(Math.abs(value))}`;

/** "1 – 28 de septiembre de 2026": the shortest way to say a range. */
function rangeText(start: string, end: string): string {
  if (start === end) return day(end);
  if (start.slice(0, 4) !== end.slice(0, 4)) {
    return `${day(start)} – ${day(end)}`;
  }
  if (start.slice(5, 7) === end.slice(5, 7)) {
    return `${at(start).getUTCDate()} – ${day(end)}`;
  }
  return `${dayMonth.format(at(start))} – ${day(end)}`;
}

/** "1 sep – 28 sep 2026" for the narrow top bar. */
function rangeShort(start: string, end: string): string {
  return `${dayShort(start)} – ${dayShort(end)} ${end.slice(0, 4)}`;
}

/** The JSON that travels in a script tag: "<" is written as a unicode escape
 *  so the data can never close the tag. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", `${BACKSLASH}u003c`);
}

// ---------------------------------------------------------------- links

const isWeb = (url: string) => /^https?:\/\//i.test(url);

/** A page of the site: opens in a new tab and shows its path. */
function pageLink(url: string): string {
  const label = esc(isWeb(url) ? pathOf(url) : url);
  return isWeb(url)
    ? `<a class="lk" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(url)}">${label}</a>`
    : `<span title="${esc(url)}">${label}</span>`;
}

/** A search: opens the Google results for it in a new tab. */
function queryLink(query: string): string {
  return `<a class="lk" href="https://www.google.com/search?q=${encodeURIComponent(query)}&amp;hl=es&amp;gl=es" target="_blank" rel="noopener noreferrer" title="Ver los resultados de Google">${esc(query)}</a>`;
}

// -------------------------------------------------------------- deltas

/** A change shown as an arrow and coloured text: "▲ 16,4 %". */
function pctDelta(now: number, before: number): string {
  const change = percentChange(now, before);
  if (change === null) return "";
  if (Math.abs(change) < 0.005) return `<span class="dl flat">= igual</span>`;
  const up = change > 0;
  return `<span class="dl ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${one.format(Math.abs(change) * 100)} %</span>`;
}

/** A change in whole units: "▲ +113". */
function countDelta(now: number, before: number): string {
  const diff = now - before;
  if (diff === 0) return `<span class="dl flat">= igual</span>`;
  return `<span class="dl ${diff > 0 ? "up" : "down"}">${diff > 0 ? "▲" : "▼"} ${signedNum(diff)}</span>`;
}

/** A position that moved: "6,3 → 2,2" with the arrow coloured by direction. */
function posMove(prev: number | null, now: number | null): string {
  if (now === null) return `${pos(prev)} → fuera`;
  if (prev === null) return `<span class="dl up">nueva · ${pos(now)}</span>`;
  const better = now < prev;
  return `${pos(prev)} → <span class="dl ${better ? "up" : "down"}">${pos(now)}</span>`;
}

const TONE_LABEL: Record<Insight["tone"], string> = {
  good: "A favor",
  warn: "A vigilar",
  bad: "Atención",
  info: "Informativo",
};

// ----------------------------------------------------------- structure

/** The notes that open a tab (the analysis of the whole panel) and the tab
 *  they belong to. Every other note stays under its own block. */
const PANEL_NOTE: Record<string, SectionId> = {
  trafico: "evolucion",
  posiciones: "posiciones",
  busquedas: "consultas",
  paginas: "origen",
  temas: "temas",
  oportunidades: "oportunidades",
  tecnico: "tecnico",
};
const PANEL_NOTE_IDS = new Set<string>(Object.values(PANEL_NOTE));

/** Light formatting for any text of the report (the AI's and Carlos's):
 *  **bold**, ==accent== in the brand red, and lines starting with "- " as a
 *  list. Escaped first, so nothing typed can become HTML. */
const FIGURE_UNIT =
  /(?<![(\w\u2212+\-,.])(\d[\d.,]*[ \u00a0](?:clics|impresiones|búsquedas|visitas|páginas|posiciones))(?![\wáéíóú])/g;
const FIGURE_PERCENT =
  /(?<![(\w\u2212+\-,.])([+\u2212-]?\d[\d.,]*[ \u00a0]?%)(?![\w%])/g;

/** A text with no bold at all reads flat, so the figures with a unit and the
 *  percentages (not the ones in brackets, which only qualify a figure) are
 *  put in bold. When the writer already marked something, nothing is added. */
const emphasise = (html: string) =>
  html.includes("**")
    ? html
    : html.replace(FIGURE_UNIT, "**$1**").replace(FIGURE_PERCENT, "**$1**");

const BARE_URL = /https?:\/\/[^\s<>"']+/g;

/** Any address written in a text becomes a link (those already inside a
 *  link are left alone). Punctuation that closes the sentence stays out. */
function linkify(html: string): string {
  return html
    .split(/(<a\b[^>]*>.*?<\/a>)/g)
    .map((part, at) =>
      at % 2 === 1
        ? part
        : part.replace(BARE_URL, (found) => {
            const tail = /[.,;:!?)\]]+$/.exec(found)?.[0] ?? "";
            const url = found.slice(0, found.length - tail.length);
            return `<a class="xl" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${tail}`;
          }),
    )
    .join("");
}

/** A plain text with its addresses turned into links. */
const withLinks = (text: string) => linkify(esc(text));

function inline(text: string): string {
  return linkify(
    emphasise(esc(text))
      .replace(
        /\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,
        '<a class="xl" href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      )
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/==(.+?)==/g, '<mark class="ac">$1</mark>'),
  );
}

/** A link to an official page, in the brand red. */
const xlink = (label: string, url: string) =>
  `<a class="xl" href="${url}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;

const GUIDE = {
  title: xlink(
    "Cómo elige Google el título",
    "https://developers.google.com/search/docs/appearance/title-link",
  ),
  snippet: xlink(
    "Descripciones y fragmentos",
    "https://developers.google.com/search/docs/appearance/snippet",
  ),
  helpful: xlink(
    "Contenido útil",
    "https://developers.google.com/search/docs/fundamentals/creating-helpful-content",
  ),
  links: xlink(
    "Enlaces que Google puede rastrear",
    "https://developers.google.com/search/docs/crawling-indexing/links-crawlable",
  ),
  url: xlink(
    "Estructura de URLs",
    "https://developers.google.com/search/docs/crawling-indexing/url-structure",
  ),
};

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function paragraphs(text: string): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length > 0) out.push(`<ul class="rl">${list.join("")}</ul>`);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = /^[-•]\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(`<li>${inline(bullet[1])}</li>`);
    } else {
      flush();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  flush();
  return out.join("");
}

/** The reading of a tab: what happened, why and what it means. */
function analysisCard(report: ReportFull, id: SectionId): string {
  if (report.notes.hidden.includes(id)) return "";
  const text = report.notes.sectionNotes[id]?.trim();
  return text
    ? `<section class="an"><div class="ak">Análisis</div>${paragraphs(text)}</section>`
    : "";
}

/** First name of whoever signs the report this page is being drawn for. */
let noteAuthor = CARLOS.name.split(" ")[0];

function noteOf(report: ReportFull, id: SectionId): string {
  if (PANEL_NOTE_IDS.has(id)) return "";
  const text = report.notes.sectionNotes[id]?.trim();
  return text
    ? `<div class="note"><b>Nota de ${esc(noteAuthor)}</b>${paragraphs(text)}</div>`
    : "";
}

/** The heading of a block inside a tab. */
function blockHead(title: string, lead: string): string {
  return `<div class="bh"><h2>${esc(title)}</h2><p class="lead">${esc(lead)}</p></div>`;
}

function block(
  report: ReportFull,
  id: SectionId,
  title: string,
  lead: string,
  body: string,
): string {
  return `<div class="blk">${blockHead(title, lead)}${body}${noteOf(report, id)}</div>`;
}

type SubTab = { id: string; label: string; count?: number; html: string };

/** Tabs inside a tab, so several lists share one place. In print every list
 *  shows, each under its own small title. */
function subTabs(group: string, items: SubTab[]): string {
  const shown = items.filter((item) => item.html);
  if (shown.length === 0) return "";
  const buttons = shown
    .map(
      (item, index) =>
        `<button type="button" role="tab" data-sub="${group}-${item.id}" class="${index === 0 ? "on" : ""}">${esc(item.label)}${item.count !== undefined ? ` <small>${num(item.count)}</small>` : ""}</button>`,
    )
    .join("");
  const panels = shown
    .map(
      (item, index) =>
        `<div class="sp${index === 0 ? " on" : ""}" data-sp="${group}-${item.id}"><h4 class="sph">${esc(item.label)}</h4>${item.html}</div>`,
    )
    .join("");
  return `<div class="stg" data-group="${group}"><div class="subtabs" role="tablist">${buttons}</div>${panels}</div>`;
}

/** A row of figures that sums up a tab before its tables. */
function chips(
  items: { value: string; label: string; delta?: string }[],
): string {
  return `<div class="chips">${items
    .map(
      (item) =>
        `<div class="chip"><b>${item.value}</b><span>${esc(item.label)}</span>${item.delta ?? ""}</div>`,
    )
    .join("")}</div>`;
}

// --------------------------------------------------------------- tables

/** A table cell: its HTML and the value the column sorts by. */
type Cell = { h: string; v?: number | string | null; cls?: string };
type Column = {
  label: string;
  num?: boolean;
  cls?: string;
  /** Positions read best-first: the first click sorts ascending. */
  asc?: boolean;
};

const PRINT_ROWS = 15;

/** Every table of the report: sortable by any column (the page script reads
 *  `data-v`), filterable when it is long, and trimmed to its first rows in
 *  print. */
function dataTable(
  columns: Column[],
  rows: Cell[][],
  empty = "No hay datos en este grupo.",
  full = false,
): string {
  if (rows.length === 0) return `<p class="empty">${esc(empty)}</p>`;
  const head = columns
    .map(
      (column) =>
        `<th data-t="${column.num ? "num" : "text"}"${column.asc ? ' data-first="asc"' : ""} class="${[column.num ? "r" : "", column.cls ?? ""].filter(Boolean).join(" ")}"><span>${esc(column.label)}</span></th>`,
    )
    .join("");
  const body = rows
    .map(
      (row, index) =>
        `<tr${index >= PRINT_ROWS ? ' class="xr"' : ""}>${row
          .map((cell, col) => {
            const cls = [columns[col]?.num ? "r" : "", cell.cls ?? ""]
              .filter(Boolean)
              .join(" ");
            const value =
              cell.v === undefined || cell.v === null ? "" : String(cell.v);
            return `<td${cls ? ` class="${cls}"` : ""} data-v="${esc(value)}">${cell.h}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  const tools =
    rows.length > 8 && !full
      ? `<div class="tools"><input class="flt" type="search" placeholder="Filtrar la lista…" aria-label="Filtrar la lista"><span class="cnt" data-total="${rows.length}">${num(rows.length)} filas</span></div>`
      : "";
  const more =
    rows.length > PRINT_ROWS
      ? `<p class="onlyprint">Se muestran las ${PRINT_ROWS} primeras de ${num(rows.length)}. La lista completa está en la versión web del informe.</p>`
      : "";
  return `<div class="tw">${tools}<div class="tbox${full ? " full" : ""}"><table class="qt sm sortable"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${more}</div>`;
}

const ctr = (clicks: number, impressions: number) =>
  impressions > 0 ? clicks / impressions : 0;
const ctrText = (clicks: number, impressions: number) =>
  impressions > 0 ? `${one.format(ctr(clicks, impressions) * 100)} %` : "—";

/** A figure with a small red bar next to it, sized against the biggest figure
 *  of its column, so a table can be read at a glance. */
function barNumber(value: number, max: number, sub = ""): string {
  const width = max > 0 ? Math.max(value > 0 ? 3 : 0, (value / max) * 100) : 0;
  return `<div class="nb"><span class="nv"><b>${num(value)}</b>${sub}</span><span class="tr"><i style="--w:${width.toFixed(0)}%"></i></span></div>`;
}

/** The clicks of a row, with the previous period's under them. */
function clicksCell(clicks: number, prev: number | null, max: number): Cell {
  return {
    h: barNumber(
      clicks,
      max,
      prev === null ? "" : `<small>antes ${num(prev)}</small>`,
    ),
    v: clicks,
  };
}

const impressionsCell = (value: number, max: number): Cell => ({
  h: barNumber(value, max),
  v: value,
});

/** The change of a row in clicks, with the percentage under it. */
function deltaCell(clicks: number, prev: number): Cell {
  const diff = clicks - prev;
  const change = percentChange(clicks, prev);
  const cls = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "=";
  const sub =
    change === null || diff === 0
      ? ""
      : `<small>${change > 0 ? "+" : "−"}${one.format(Math.abs(change) * 100)} %</small>`;
  return {
    h: `<span class="dl ${cls}">${arrow} ${diff === 0 ? "igual" : signedNum(diff)}</span>${sub}`,
    v: diff,
  };
}

const positionCell = (prev: number | null, now: number | null): Cell => ({
  h: posMove(prev, now),
  v: now,
});

/** Searches with their figures of both periods. */
function queriesTable(rows: QueryTableRow[], comparable: boolean): string {
  const maxClicks = Math.max(...rows.map((row) => row.clicks), 1);
  const maxImpressions = Math.max(...rows.map((row) => row.impressions), 1);
  const columns: Column[] = [
    { label: "Búsqueda" },
    { label: "Posición", num: true, asc: true },
    { label: "Clics", num: true },
    ...(comparable ? [{ label: "Variación", num: true }] : []),
    { label: "Impresiones", num: true },
    { label: "CTR", num: true },
  ];
  return dataTable(
    columns,
    rows.map((row) => [
      {
        h: `${queryLink(row.query)}${row.brand ? ' <span class="tag">Marca</span>' : ""}`,
        v: row.query,
      },
      comparable
        ? positionCell(row.prevPosition, row.position)
        : { h: pos(row.position), v: row.position },
      clicksCell(row.clicks, comparable ? row.prevClicks : null, maxClicks),
      ...(comparable ? [deltaCell(row.clicks, row.prevClicks)] : []),
      impressionsCell(row.impressions, maxImpressions),
      {
        h: ctrText(row.clicks, row.impressions),
        v: ctr(row.clicks, row.impressions),
      },
    ]),
  );
}

/** The searches of a position band, new searches and lost ones. */
function simpleQueries(rows: QueryRow[], lost: boolean): string {
  const clicksOf = (row: QueryRow) => (lost ? row.prevClicks : row.clicks);
  const maxClicks = Math.max(...rows.map(clicksOf), 1);
  const maxImpressions = Math.max(...rows.map((row) => row.impressions), 1);
  return dataTable(
    [
      { label: "Búsqueda" },
      { label: lost ? "Posición antes" : "Posición", num: true, asc: true },
      { label: lost ? "Clics antes" : "Clics", num: true },
      { label: lost ? "Impresiones antes" : "Impresiones", num: true },
      ...(lost ? [] : [{ label: "CTR", num: true }]),
    ],
    rows.map((row) => [
      { h: queryLink(row.query), v: row.query },
      {
        h: pos(lost ? row.prevPosition : row.position),
        v: lost ? row.prevPosition : row.position,
      },
      clicksCell(clicksOf(row), null, maxClicks),
      impressionsCell(row.impressions, maxImpressions),
      ...(lost
        ? []
        : [
            {
              h: ctrText(row.clicks, row.impressions),
              v: ctr(row.clicks, row.impressions),
            },
          ]),
    ]),
    "No hay búsquedas en este grupo.",
  );
}

/** Searches that entered or left a band. */
function moveTable(
  rows: {
    query: string;
    position: number | null;
    prevPosition: number | null;
    impressions: number;
  }[],
  entering: boolean,
): string {
  const maxImpressions = Math.max(...rows.map((row) => row.impressions), 1);
  return dataTable(
    [
      { label: "Búsqueda" },
      { label: "Posición", num: true, asc: true },
      { label: "Impresiones", num: true },
    ],
    rows.map((row) => [
      { h: queryLink(row.query), v: row.query },
      positionCell(row.prevPosition, row.position),
      impressionsCell(row.impressions, maxImpressions),
    ]),
    entering ? "Ninguna búsqueda ha entrado." : "Ninguna búsqueda ha salido.",
  );
}

/** Pages or searches that gained or lost clicks, with what explains it. */
function changeTable(rows: ChangeLine[]): string {
  const pages = rows.length > 0 && isWeb(rows[0].key);
  const maxClicks = Math.max(...rows.map((row) => row.clicks), 1);
  return dataTable(
    [
      { label: pages ? "Página" : "Búsqueda" },
      { label: "Variación", num: true },
      { label: "Clics", num: true },
      { label: "Posición", num: true, asc: true },
    ],
    rows.map((row) => [
      {
        h: `${pages ? pageLink(row.key) : queryLink(row.key)}${
          row.queries && row.queries.length > 0
            ? `<div class="why">${row.queries
                .slice(0, 3)
                .map(
                  (item) =>
                    `<span>${queryLink(item.query)} <i>${signedNum(item.clicksDelta)}</i></span>`,
                )
                .join("")}</div>`
            : ""
        }`,
        v: row.key,
        cls: pages ? "pg" : "",
      },
      deltaCell(row.clicks, row.prevClicks),
      clicksCell(row.clicks, row.prevClicks, maxClicks),
      positionCell(row.prevPosition, row.position),
    ]),
    "Sin variaciones destacables.",
  );
}

/** The pages with most clicks, each with its share drawn as a bar. */
function pagesTable(rows: PageRow[], comparable: boolean): string {
  const maxClicks = Math.max(...rows.map((row) => row.clicks), 1);
  const maxImpressions = Math.max(...rows.map((row) => row.impressions), 1);
  return dataTable(
    [
      { label: "Página" },
      { label: "Clics", num: true },
      ...(comparable ? [{ label: "Variación", num: true }] : []),
      { label: "Posición", num: true, asc: true },
      { label: "Impresiones", num: true },
      { label: "CTR", num: true },
    ],
    rows.map((row) => [
      { h: pageLink(row.url), v: row.url, cls: "pg" },
      clicksCell(row.clicks, comparable ? row.prevClicks : null, maxClicks),
      ...(comparable ? [deltaCell(row.clicks, row.prevClicks)] : []),
      comparable
        ? positionCell(row.prevPosition, row.position)
        : { h: pos(row.position), v: row.position },
      impressionsCell(row.impressions, maxImpressions),
      {
        h: ctrText(row.clicks, row.impressions),
        v: ctr(row.clicks, row.impressions),
      },
    ]),
  );
}

// ------------------------------------------------------------------ hero

function areaPath(values: number[]): string {
  if (values.length < 2) return "";
  const hi = Math.max(...values, 1);
  const w = 1000;
  const h = 100;
  const pts = values.map(
    (value, index) =>
      `${((index * w) / (values.length - 1)).toFixed(1)},${(h - (value / hi) * (h - 8) - 4).toFixed(1)}`,
  );
  return `<svg class="bgchart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f11c41" stop-opacity=".45"/><stop offset="1" stop-color="#f11c41" stop-opacity="0"/></linearGradient></defs><path d="M0,${h} L${pts.join(" L")} L${w},${h} Z" fill="url(#hg)"/><polyline points="${pts.join(" ")}" fill="none" stroke="#f11c41" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

const CALENDAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>`;

/** The analysed period: the first thing the cover says. */
function periodCard(report: ReportFull): string {
  const { snapshot } = report;
  const { period, range } = snapshot;
  const compare = period.comparable
    ? `<div class="pi"><div><small>Comparado con</small><b>${esc(rangeText(period.prevStartDate, period.prevEndDate))}</b><span>${period.compare === "year" ? "mismo periodo del año anterior" : "periodo anterior de la misma duración"}</span></div></div>`
    : "";
  return `<div class="period rv d2"><div class="pi main">${CALENDAR}<div><small>Periodo analizado</small><b>${esc(rangeText(range.startDate, range.endDate))}</b><span>${num(period.days)} días de datos de Google Search Console</span></div></div>${compare}</div>`;
}

/** What the cover says about the brand searches: they are counted. */
function heroBrandNote(snapshot: ReportFull["snapshot"]): string {
  if (snapshot.scope === "sin marca")
    return " · sin contar las búsquedas de marca";
  const { brand } = snapshot;
  const total = brand.clicks + brand.otherClicks;
  if (!brand.hasBrand || total <= 0) return "";
  return ` · incluye las búsquedas de marca (${one.format((brand.clicks / total) * 100)} % de los clics)`;
}

function hero(report: ReportFull, host: string): string {
  const { snapshot } = report;
  const { totals, prevTotals } = snapshot;
  const comparable = snapshot.period.comparable && prevTotals.impressions > 0;
  const kpi = (
    label: string,
    value: number,
    kind: "int" | "dec" | "pct",
    shown: string,
    delta: string,
  ) =>
    `<div class="kpi"><div class="l">${label}</div><div class="v" data-count="${value}" data-kind="${kind}">${shown}</div>${delta}</div>`;
  const positionDelta = (() => {
    const diff = prevTotals.position - totals.position;
    if (!comparable || prevTotals.position <= 0) return "";
    if (Math.abs(diff) < 0.05) return `<span class="dl flat">= igual</span>`;
    return `<span class="dl ${diff > 0 ? "up" : "down"}">${diff > 0 ? "▲" : "▼"} ${one.format(Math.abs(diff))} posiciones</span>`;
  })();
  const name = report.clientName?.trim() || host;
  // "Informe SEO Dentaltix - Octubre de 2026" reads "Informe SEO de dentaltix.com":
  // what follows a dash is the period (the cover says it) and the client's
  // name comes after the "de".
  const brandWord = name.split(".")[0].toLowerCase();
  const heading =
    report.title
      .split(/\s[—–-]\s/)[0]
      .split(/\s+/)
      .filter((word) => word.toLowerCase() !== brandWord)
      .join(" ")
      .trim() || "Informe SEO";
  return `<header class="hero">
${areaPath(snapshot.daily.map((point) => point.clicks))}
<div class="wrap">
<div class="logo rv">${LOGO_HORIZONTAL_LIGHT}</div>
<span class="eyebrow rv">Informe de rendimiento SEO</span>
<h1 class="rv d1">${esc(heading)} de <em>${esc(name)}</em></h1>
<p class="sub rv d1">${esc(host)}${heroBrandNote(snapshot)}</p>
${periodCard(report)}
<div class="kpis rv d3">
${kpi("Clics", totals.clicks, "int", num(totals.clicks), comparable ? pctDelta(totals.clicks, prevTotals.clicks) : "")}
${kpi("Impresiones", totals.impressions, "int", num(totals.impressions), comparable ? pctDelta(totals.impressions, prevTotals.impressions) : "")}
${kpi("CTR", totals.ctr * 100, "pct", `${one.format(totals.ctr * 100)} %`, comparable ? pctDelta(totals.ctr, prevTotals.ctr) : "")}
${kpi("Posición media", totals.position, "dec", one.format(totals.position), positionDelta)}
</div>
</div>
</header>`;
}

// ---------------------------------------------------- executive summary

/** The summary is a written paragraph or nothing: a list of findings would
 *  only repeat the conclusions tab. */
/** Only the logo of each network, in the text colour: no box, no circle. */
const SOCIAL_ICON: Record<Network, { label: string; svg: string }> = {
  x: {
    label: "X (Twitter)",
    svg: '<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>',
  },
  linkedin: {
    label: "LinkedIn",
    svg: '<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>',
  },
  instagram: {
    label: "Instagram",
    svg: '<rect x="2.2" y="2.2" width="19.6" height="19.6" rx="5.6" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="4.4" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="17.5" cy="6.5" r="1.3"/>',
  },
  youtube: {
    label: "YouTube",
    svg: '<path fill-rule="evenodd" d="M4.5 4.5h15A3.5 3.5 0 0 1 23 8v8a3.5 3.5 0 0 1-3.5 3.5h-15A3.5 3.5 0 0 1 1 16V8a3.5 3.5 0 0 1 3.5-3.5zM9.8 8.7v6.6l5.8-3.3z"/>',
  },
  tiktok: {
    label: "TikTok",
    svg: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>',
  },
};

const socialLinks = (signer: Signer) =>
  signer.social.length === 0
    ? ""
    : `<div class="soc">${signer.social
        .map((item) => {
          const icon = SOCIAL_ICON[item.network];
          return `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="${icon.label} de ${esc(signer.name)}" title="${icon.label}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${icon.svg}</svg></a>`;
        })
        .join("")}</div>`;

function executiveSummary(report: ReportFull, signer: Signer): string {
  const message = report.notes.message.trim();
  if (!message) return "";
  const verdict = buildVerdict(report.snapshot);
  return `<section class="s wrap" id="resumen"><div class="sum rv">
<div class="kick">Resumen ejecutivo</div>
<h2 class="sumh">${esc(verdict.headline)}</h2>
<div class="sumt">${paragraphs(message)}</div>
<div class="sig"><span class="av"><img src="${signer.avatar}" alt=""></span><span><b>${esc(signer.name)}</b>${esc(signer.title)}${socialLinks(signer)}</span></div>
</div></section>`;
}

// ------------------------------------------------------------- insights

/** Which tab explains each conclusion. */
const INSIGHT_TAB: Record<string, string> = {
  traffic: "trafico",
  update: "trafico",
  source: "trafico",
  weekday: "trafico",
  discover: "trafico",
  top3: "posiciones",
  queries: "busquedas",
  brand: "busquedas",
  winner: "paginas",
  loser: "paginas",
  concentration: "paginas",
  mobile: "trafico",
  device: "trafico",
  topics: "temas",
  opportunities: "oportunidades",
  health: "tecnico",
};

const goLink = (item: Insight) =>
  INSIGHT_TAB[item.id]
    ? `<a class="go" href="#tabs" data-go="${INSIGHT_TAB[item.id]}">Ver el detalle →</a>`
    : "";

const statChips = (item: Insight, from: number) =>
  item.stats
    .slice(from)
    .map(
      (stat) =>
        `<span class="sc2">${esc(stat.label)}<b>${esc(stat.value)}</b></span>`,
    )
    .join("");

/** The conclusion with most weight, big: its main figure, what it says and
 *  where to see more. */
function featuredInsight(item: Insight, index: number): string {
  const main = item.stats[0];
  return `<article class="cf ${item.tone}"><div class="cft"><span class="no">${index + 1}</span><span class="tp2"><i class="dot ${item.tone}"></i>${esc(item.topic)}</span></div>${main ? `<div class="cfm"><b>${esc(main.value)}</b><span>${esc(main.label)}</span></div>` : ""}<h4>${esc(item.title)}</h4><p>${esc(item.body)}</p>${item.stats.length > 1 ? `<div class="cfs">${statChips(item, 1)}</div>` : ""}${goLink(item)}</article>`;
}

function insightRow(item: Insight): string {
  const main = item.stats[0];
  const long = main && main.value.length > 9 ? " lg" : "";
  return `<div class="cr2 ${item.tone}"><div class="crm${long}">${main ? `<b>${esc(main.value)}</b><span>${esc(main.label)}</span>` : `<i class="dot ${item.tone}"></i>`}</div><div class="crt"><span class="crk"><i class="dot ${item.tone}"></i>${esc(item.topic)}</span><h4>${esc(item.title)}</h4><p>${esc(item.body)}</p>${item.stats.length > 1 ? `<div class="cfs">${statChips(item, 1)}</div>` : ""}</div>${goLink(item)}</div>`;
}

const INSIGHT_GROUPS: {
  title: string;
  lead: string;
  tones: Insight["tone"][];
}[] = [
  {
    title: "Hay que actuar",
    lead: "Lo que está perdiendo tráfico o visibilidad y conviene corregir primero.",
    tones: ["bad"],
  },
  {
    title: "A vigilar",
    lead: "Cambios que todavía no son un problema pero pueden serlo.",
    tones: ["warn", "info"],
  },
  {
    title: "Va bien",
    lead: "Lo que funciona y conviene proteger o repetir.",
    tones: ["good"],
  },
];

function insightsBlock(report: ReportFull): string {
  const items = buildInsights(report.snapshot).slice(0, 15);
  if (items.length === 0) return "";
  const verdict = buildVerdict(report.snapshot);
  const top = items.slice(0, 3);
  const rest = items.slice(3);
  const groups = INSIGHT_GROUPS.map((group) => ({
    group,
    list: rest.filter((item) => group.tones.includes(item.tone)),
  }))
    .filter(({ list }) => list.length > 0)
    .map(
      ({ group, list }) =>
        `<section class="cg"><div class="cgh"><h3>${group.title}</h3><span>${list.length}</span></div><p class="cgl">${group.lead}</p><div class="crs2">${list.map(insightRow).join("")}</div></section>`,
    )
    .join("");
  return block(
    report,
    "hallazgos",
    "Conclusiones del periodo",
    "Lo que dicen los datos al cruzarlos, de lo más a lo menos importante. Cada conclusión enlaza con la pestaña donde se ve el detalle.",
    `<div class="cv"><div class="cvk">En una frase</div><p>${esc(verdict.headline)}</p></div><h3 class="cs">Lo más importante</h3><div class="ctop">${top.map(featuredInsight).join("")}</div>${groups}`,
  );
}

// ---------------------------------------------------------------- trend

/** An update's name, linked to the notice Google published about it. */
function updateLink(url: string, label: string): string {
  return isWeb(url)
    ? `<a class="lk" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Ver el comunicado de Google">${esc(label)}</a>`
    : esc(label);
}

function trendBlock(report: ReportFull): string {
  const { snapshot } = report;
  const impacts = updateImpacts(snapshot);
  const legend = snapshot.updates
    .map(
      (update) =>
        `<span><i class="sq" style="background:${KIND_COLOR[update.kind]}"></i>${updateLink(update.url, update.label)}</span>`,
    )
    .join("");
  const cards = impacts
    .map((item) => {
      const color = KIND_COLOR[item.update.kind];
      const cell = (label: string, value: number | null) =>
        `<div><small>${label}</small><b>${value === null ? "—" : num(value)}</b></div>`;
      return `<div class="ucard" style="--uc:${color}"><div class="un"><i></i>${esc(item.update.label)}</div><div class="ud">${esc(KIND_NAME[item.update.kind])} · ${dayShort(item.update.begin)} → ${item.update.end ? dayShort(item.update.end) : "en curso"} · clics por día${isWeb(item.update.url) ? ` · <a class="lk" href="${esc(item.update.url)}" target="_blank" rel="noopener noreferrer">Comunicado de Google ↗</a>` : ""}</div><div class="trio">${cell("Antes", item.before)}${cell("Durante", item.during)}${cell("Después", item.after)}</div><p>${esc(item.verdict)}</p></div>`;
    })
    .join("");
  const body = `<div class="sheet">
<div class="tabs"><button class="on" data-metric="clicks">Clics</button><button data-metric="impressions">Impresiones</button><button data-metric="position">Posición</button></div>
<div class="chartbox"><svg id="chart" role="img" aria-label="Evolución diaria"></svg><div class="tip" id="tip"></div></div>
<div class="legend"><span><i></i>Este periodo</span>${snapshot.period.comparable ? `<span><i class="prev"></i>Periodo anterior</span>` : ""}${legend}</div>
${cards ? `<div class="uimp">${cards}</div>` : ""}
</div>`;
  return block(
    report,
    "evolucion",
    "Evolución del tráfico y actualizaciones de Google",
    snapshot.updates.length > 0
      ? "Las franjas de color marcan los cambios de algoritmo de Google que coincidieron con el periodo, con su efecto medido sobre los clics diarios."
      : "Evolución diaria de los resultados frente al periodo anterior. Pasar el cursor, o el dedo, por la gráfica muestra el detalle de cada día.",
    body,
  );
}

/** Brand red for the biggest group, then the ink and greys of the report. */
const MIX_COLORS = [
  "#f11c41",
  "#1a1a1a",
  "#4a4a52",
  "#7a7a84",
  "#a8a8b0",
  "#d0d0d6",
];

/** One dimension of the traffic: each group with its share of the clicks and
 *  what it added or took away since the previous period. */
function mixCard(
  title: string,
  lines: SegmentLine[],
  comparable: boolean,
): string {
  if (lines.length === 0) return "";
  const total = lines.reduce((sum, line) => sum + line.clicks, 0);
  const prevTotal = lines.reduce((sum, line) => sum + line.prevClicks, 0);
  const shown = lines.slice(0, 6);
  const stack = `<div class="stk" aria-hidden="true">${shown
    .map(
      (line, index) =>
        `<i style="width:${Math.max(1.5, line.share * 100).toFixed(1)}%;background:${MIX_COLORS[index]}" title="${esc(line.label)}"></i>`,
    )
    .join("")}</div>`;
  const rows = shown
    .map((line, index) => {
      const diff = line.clicks - line.prevClicks;
      const change = percentChange(line.clicks, line.prevClicks);
      const delta = comparable
        ? `<span class="dl ${diff > 0 ? "up" : diff < 0 ? "down" : "flat"}">${diff > 0 ? "▲" : diff < 0 ? "▼" : "="} ${diff === 0 ? "igual" : signedNum(diff)}${change !== null && diff !== 0 ? ` <i>(${change > 0 ? "+" : "−"}${one.format(Math.abs(change) * 100)} %)</i>` : ""}</span>`
        : "";
      return `<div class="mxr"><i class="sw" style="background:${MIX_COLORS[index]}"></i><div class="mxb"><div class="mxt"><span class="mxn" title="${esc(line.label)}">${esc(line.label)}</span><b class="mxp${index === 0 ? " first" : ""}">${one.format(line.share * 100)}<small>%</small></b></div><div class="mxm"><span>${num(line.clicks)} clics</span>${delta}</div></div></div>`;
    })
    .join("");
  const net = comparable ? countDelta(total, prevTotal) : "";
  return `<div class="sheet mix"><div class="mh"><h3>${esc(title)}</h3>${net}</div>${stack}${rows}</div>`;
}

function trafficMixBlock(report: ReportFull): string {
  const { snapshot } = report;
  const comparable = snapshot.period.comparable;
  const total = snapshot.brand.clicks + snapshot.brand.otherClicks;
  const brandLines: SegmentLine[] =
    snapshot.brand.hasBrand && total > 0
      ? [
          {
            label: "Búsquedas de marca",
            clicks: snapshot.brand.clicks,
            prevClicks: snapshot.brand.prevClicks,
            impressions: 0,
            share: snapshot.brand.clicks / total,
          },
          {
            label: "Resto de búsquedas",
            clicks: snapshot.brand.otherClicks,
            prevClicks: snapshot.brand.prevOtherClicks,
            impressions: 0,
            share: snapshot.brand.otherClicks / total,
          },
        ]
      : [];
  const cards = [
    mixCard("Tipo de página", snapshot.segments.pageType, comparable),
    mixCard("Dispositivo", snapshot.segments.device, comparable),
    mixCard("Marca y resto de búsquedas", brandLines, comparable),
    mixCard("Intención de búsqueda", snapshot.segments.intent, comparable),
  ].join("");
  if (!cards) return "";
  const net = snapshot.totals.clicks - snapshot.prevTotals.clicks;
  return block(
    report,
    "reparto",
    comparable
      ? `De dónde vienen los clics${net !== 0 ? ` y qué ha cambiado (${signedNum(net)})` : ""}`
      : "De dónde vienen los clics",
    comparable
      ? "Cada grupo con su peso sobre el total y lo que ha sumado o restado frente al periodo anterior."
      : "El peso de cada grupo sobre el total de clics.",
    `<div class="mixcols">${cards}</div>`,
  );
}

function weekBlock(report: ReportFull): string {
  const { daily } = report.snapshot;
  if (daily.length < 21) return "";
  const stats = weekdayStats(daily);
  const max = Math.max(...stats.map((item) => item.average), 1);
  const best = stats.reduce((a, b) => (b.average > a.average ? b : a));
  const cols = stats
    .map(
      (item) =>
        `<div class="wc${item === best ? " best" : ""}"><b>${num(item.average)}</b><div class="wcb"><i style="--h:${Math.max(4, (item.average / max) * 100).toFixed(0)}%"></i></div><span>${item.label}</span></div>`,
    )
    .join("");
  return block(
    report,
    "semana",
    "Clics medios por día de la semana",
    `El mejor día es ${best.label.toLowerCase()}: conviene publicar y actualizar contenido antes.`,
    `<div class="sheet"><div class="wkc">${cols}</div></div>`,
  );
}

// ------------------------------------------------------------ positions

function positionsBlock(report: ReportFull): string {
  const { snapshot } = report;
  if (snapshot.bands.length === 0) return "";
  const comparable = snapshot.period.comparable;
  const totalClicks = snapshot.bands.reduce(
    (sum, band) => sum + band.clicks,
    0,
  );
  const maxQueries = Math.max(
    ...snapshot.bands.map((band) => Math.max(band.queries, band.prevQueries)),
    1,
  );
  const cards = snapshot.bands
    .map((band) => {
      const share = totalClicks > 0 ? (band.clicks / totalClicks) * 100 : 0;
      return `<div class="bcard"><div class="bk">${esc(band.label)}</div><div class="bn">${num(band.queries)}</div><div class="bs">búsquedas${comparable ? ` · ${countDelta(band.queries, band.prevQueries)}` : ""}</div><div class="pair"><div class="now"><i style="--w:${((band.queries / maxQueries) * 100).toFixed(0)}%"></i></div>${comparable ? `<div class="old"><i style="--w:${((band.prevQueries / maxQueries) * 100).toFixed(0)}%"></i></div>` : ""}</div><div class="bm"><b>${num(band.clicks)}</b> clics · <b>${Math.round(share)} %</b> del total</div></div>`;
    })
    .join("");
  const lists = subTabs(
    "band",
    snapshot.bands.map((band, index) => ({
      id: `b${index}`,
      label: band.label,
      count: band.queries,
      html: simpleQueries((snapshot.queriesByBand ?? [])[index] ?? [], false),
    })),
  );
  const moves = comparable
    ? `<div class="grid g2" style="margin-top:18px"><div class="sheet"><h3>Entran en el top 3 (${num(snapshot.bands[0].enteredCount)})</h3>${moveTable(snapshot.bands[0].entered, true)}</div><div class="sheet"><h3>Salen del top 3 (${num(snapshot.bands[0].leftCount)})</h3>${moveTable(snapshot.bands[0].left, false)}</div></div>`
    : "";
  return block(
    report,
    "posiciones",
    "Las búsquedas por posición en Google",
    `Cuántas búsquedas tiene la web en cada tramo de posiciones y cuántos clics aporta cada uno. La barra roja es el periodo actual${comparable ? " y la gris el anterior" : ""}.`,
    `<div class="bands">${cards}</div><div class="sheet" style="margin-top:18px"><h3>Búsquedas de cada tramo (las 25 con más clics)</h3>${lists}</div>${moves}`,
  );
}

// ------------------------------------------------------------- searches

function searchesBlock(report: ReportFull): string {
  const { snapshot } = report;
  const comparable = snapshot.period.comparable;
  const all = snapshot.queryRows ?? [];
  const own = all.filter((row) => !row.brand);
  const top3 = snapshot.bands[0];
  const brandTotal = snapshot.brand.clicks + snapshot.brand.otherClicks;
  const summary = chips([
    ...(snapshot.queryCount > 0
      ? [
          {
            value: num(snapshot.queryCount),
            label: "búsquedas distintas muestran la web",
          },
        ]
      : []),
    ...(top3
      ? [
          {
            value: num(top3.queries),
            label: "búsquedas en el top 3",
            delta: comparable ? countDelta(top3.queries, top3.prevQueries) : "",
          },
        ]
      : []),
    ...(comparable
      ? [
          { value: num(snapshot.newQueries), label: "búsquedas nuevas" },
          { value: num(snapshot.lostQueries), label: "búsquedas perdidas" },
        ]
      : []),
    ...(snapshot.brand.hasBrand && brandTotal > 0
      ? [
          {
            value: `${Math.round((snapshot.brand.clicks / brandTotal) * 100)} %`,
            label: "de los clics viene de la marca",
          },
        ]
      : []),
  ]);
  const items = [
    {
      id: "all",
      label: snapshot.scope === "sin marca" ? "Más tráfico" : "Todas",
      count: all.length,
      html: all.length > 0 ? queriesTable(all, comparable) : "",
    },
    ...(snapshot.brand.hasBrand && own.length > 0 && own.length < all.length
      ? [
          {
            id: "own",
            label: "Sin marca",
            count: own.length,
            html: queriesTable(own, comparable),
          },
        ]
      : []),
    ...(comparable
      ? [
          {
            id: "up",
            label: "Suben",
            count: snapshot.queryWinners.length,
            html:
              snapshot.queryWinners.length > 0
                ? changeTable(snapshot.queryWinners)
                : "",
          },
          {
            id: "down",
            label: "Bajan",
            count: snapshot.queryLosers.length,
            html:
              snapshot.queryLosers.length > 0
                ? changeTable(snapshot.queryLosers)
                : "",
          },
          {
            id: "new",
            label: "Nuevas",
            count: snapshot.newQueries,
            html:
              (snapshot.newQueriesList ?? []).length > 0
                ? simpleQueries(snapshot.newQueriesList, false)
                : "",
          },
          {
            id: "lost",
            label: "Perdidas",
            count: snapshot.lostQueries,
            html:
              (snapshot.lostQueriesList ?? []).length > 0
                ? simpleQueries(snapshot.lostQueriesList, true)
                : "",
          },
        ]
      : []),
  ];
  // Reports saved before the full list existed fall back to the top 30.
  if (all.length === 0 && snapshot.topQueries.length > 0) {
    items[0] = {
      id: "all",
      label: "Más tráfico",
      count: snapshot.topQueries.length,
      html: simpleQueries(
        snapshot.topQueries.map((item) => ({
          query: item.query,
          clicks: item.clicks,
          impressions: item.impressions,
          position: item.position,
          prevClicks: 0,
          prevPosition: null,
        })),
        false,
      ),
    };
  }
  const tabs = subTabs("q", items);
  if (!tabs) return "";
  return block(
    report,
    "consultas",
    "Búsquedas que mueven el tráfico",
    "Cada búsqueda abre sus resultados en Google. Pulsar el título de una columna ordena la lista, y el cuadro de arriba la filtra.",
    `${summary}<div class="sheet">${tabs}</div>`,
  );
}

// ---------------------------------------------------------------- pages

function pagesBlock(report: ReportFull): string {
  const { snapshot } = report;
  const comparable = snapshot.period.comparable;
  const rows = snapshot.pages ?? [];
  const topFive = rows.slice(0, 5).reduce((sum, row) => sum + row.clicks, 0);
  const lead = rows[0];
  const summary =
    rows.length > 0 && snapshot.pageClicksTotal > 0
      ? chips([
          { value: num(snapshot.pageCount), label: "páginas reciben clics" },
          {
            value: `${Math.round((topFive / snapshot.pageClicksTotal) * 100)} %`,
            label: "de los clics en las 5 primeras",
          },
          ...(lead
            ? [
                {
                  value: `${Math.round((lead.clicks / snapshot.pageClicksTotal) * 100)} %`,
                  label: `en ${pathOf(lead.url)}`,
                },
              ]
            : []),
        ])
      : "";
  const legacy =
    rows.length === 0 && snapshot.topPages.length > 0
      ? snapshot.topPages.map<PageRow>((page) => ({
          url: page.url,
          clicks: page.clicks,
          prevClicks: page.prevClicks,
          impressions: 0,
          prevImpressions: 0,
          position: null,
          prevPosition: null,
        }))
      : [];
  const list = rows.length > 0 ? rows : legacy;
  const tabs = subTabs("pg", [
    {
      id: "top",
      label: "Más clics",
      count: list.length,
      html: list.length > 0 ? pagesTable(list, comparable) : "",
    },
    ...(comparable
      ? [
          {
            id: "up",
            label: "Suben",
            count: snapshot.pageWinners.length,
            html:
              snapshot.pageWinners.length > 0
                ? changeTable(snapshot.pageWinners)
                : "",
          },
          {
            id: "down",
            label: "Bajan",
            count: snapshot.pageLosers.length,
            html:
              snapshot.pageLosers.length > 0
                ? changeTable(snapshot.pageLosers)
                : "",
          },
        ]
      : []),
  ]);
  if (!tabs) return "";
  return block(
    report,
    "origen",
    "Páginas que reciben y mueven el tráfico",
    "Las páginas con más clics y las que más han cambiado, con las búsquedas que explican cada cambio. Cada página se abre en una pestaña nueva.",
    `${summary}<div class="sheet">${tabs}</div>`,
  );
}

function diagnosisBlock(report: ReportFull): string {
  const items = report.notes.diagnoses.filter((item) => item.text.trim());
  if (items.length === 0) return "";
  const cards = items
    .map((item) => {
      const row = report.snapshot.pageLosers.find(
        (loser) => loser.key === item.url,
      );
      const meta = row
        ? `<div class="meta">${signedNum(row.clicksDelta)} clics (${num(row.prevClicks)} → ${num(row.clicks)})</div>`
        : "";
      const fixes = item.fixes
        .filter((fix) => fix.trim())
        .map((fix) => `<li>${inline(fix)}</li>`)
        .join("");
      return `<article class="dgc"><div class="u">${pageLink(item.url)}</div>${meta}<p>${inline(item.text)}</p>${fixes ? `<h3>Actuaciones previstas</h3><ul class="fix">${fixes}</ul>` : ""}</article>`;
    })
    .join("");
  return block(
    report,
    "diagnostico",
    "Diagnóstico de las páginas que pierden tráfico",
    "Se ha revisado cada página y las búsquedas que más han caído. Todas tienen recuperación posible: cuentan ya con historial en Google y solo requieren refuerzo.",
    `<div class="dg">${cards}</div>`,
  );
}

// --------------------------------------------------------------- topics

const BAND_NAMES = ["Top 3", "4-10", "11-20", "+20"];

/** Where the impressions of a topic are, by position, with the change since
 *  the previous period; the band with most impressions is the red one. */
function topicBands(topic: TopicLine, comparable: boolean): string {
  const bands = topic.bands ?? [0, 0, 0, 0];
  const before = topic.prevBands ?? [0, 0, 0, 0];
  const total = bands.reduce((sum, value) => sum + value, 0);
  const biggest = Math.max(...bands);
  const rows = BAND_NAMES.map((name, index) => {
    const share = total > 0 ? (bands[index] / total) * 100 : 0;
    const change =
      comparable && before[index] > 0
        ? pctDelta(bands[index], before[index])
        : "";
    return `<div class="tbr${bands[index] === biggest && biggest > 0 ? " max" : ""}"><span class="tl">${name}</span><span class="tbar"><i style="--w:${Math.max(share > 0 ? 3 : 0, share).toFixed(0)}%"></i></span><span class="tv">${num(bands[index])}</span><span class="td">${change}</span></div>`;
  }).join("");
  return `<div class="tbh">Impresiones según la posición en Google</div><div class="tbs">${rows}</div>`;
}

function topicsBlock(report: ReportFull): string {
  const { snapshot } = report;
  if (snapshot.topics.length === 0) return "";
  const comparable = snapshot.period.comparable;
  const cards = snapshot.topics
    .map((topic) => {
      const delta = comparable ? pctDelta(topic.clicks, topic.prevClicks) : "";
      const queries = topic.topQueries
        .map((item) => `<li>${queryLink(item.query)}</li>`)
        .join("");
      return `<div class="topic"><div class="tn">${esc(topic.label)}</div><div class="tk"><b>${num(topic.clicks)}</b><span>clics</span>${delta}</div><small>${num(topic.queries)} búsquedas · ${num(topic.impressions)} impresiones · posición media ${one.format(topic.position)}</small><ul class="tq">${queries}</ul>${topicBands(topic, comparable)}</div>`;
    })
    .join("");
  return block(
    report,
    "temas",
    "Temas con más tráfico orgánico",
    "Las búsquedas (sin las de marca, que no dicen de qué trata el sitio) se agrupan por tema para ver dónde tiene autoridad. En cada tema, las barras muestran en qué posiciones de Google están sus impresiones: la barra roja es donde más se concentran y la flecha, lo que ha cambiado frente al periodo anterior.",
    `<div class="topics">${cards}</div>`,
  );
}

/** What searches that carry the brand name did: kept out of the rest of the
 *  report on purpose, so here they have their own place. */
function brandBlock(report: ReportFull): string {
  const { snapshot } = report;
  const { brand } = snapshot;
  if (!brand.hasBrand || (brand.clicks <= 0 && brand.impressions <= 0)) {
    return "";
  }
  const comparable = snapshot.period.comparable;
  const rows = (snapshot.queryRows ?? []).filter((row) => row.brand);
  const positionChange =
    comparable && brand.position !== null && brand.prevPosition !== null
      ? (() => {
          const diff = brand.prevPosition - brand.position;
          if (Math.abs(diff) < 0.05)
            return `<span class="dl flat">= igual</span>`;
          return `<span class="dl ${diff > 0 ? "up" : "down"}">${diff > 0 ? "▲" : "▼"} ${one.format(Math.abs(diff))} posiciones</span>`;
        })()
      : "";
  const summary = chips([
    {
      value: num(brand.clicks),
      label: "clics de búsquedas de marca",
      delta: comparable ? pctDelta(brand.clicks, brand.prevClicks) : "",
    },
    {
      value: num(brand.impressions),
      label: "impresiones de la marca",
      delta: comparable
        ? pctDelta(brand.impressions, brand.prevImpressions)
        : "",
    },
    ...(brand.position !== null
      ? [
          {
            value: pos(brand.position),
            label: "posición media de la marca",
            delta: positionChange,
          },
        ]
      : []),
    {
      value: num(brand.queries),
      label: "búsquedas de marca distintas",
      delta: comparable ? countDelta(brand.queries, brand.prevQueries) : "",
    },
  ]);
  return block(
    report,
    "marca",
    "Búsquedas de marca",
    "Son las búsquedas que llevan el nombre de la marca: quien las hace ya ha oído hablar del cliente, a menudo tras informarse en otros canales, como asistentes de IA (ChatGPT, Gemini…), redes o recomendaciones. Están incluidas en las cifras de todo el informe (en las tablas llevan la etiqueta «Marca»); aquí se ven aparte para distinguir lo que viene de la marca de lo que trae tráfico nuevo.",
    `${summary}${rows.length > 0 ? `<div class="sheet">${queriesTable(rows, comparable)}</div>` : ""}`,
  );
}

// -------------------------------------------------------- opportunities

const OPP_KIND_LABEL: Record<OpportunityLine["kind"], string> = {
  push: "A un paso del top 3",
  snippet: "Visible pero poco clicada",
};

const OPP_KIND_SHORT: Record<OpportunityLine["kind"], string> = {
  push: "A un paso",
  snippet: "Poco clicada",
};

/** How much work it takes: a title and a description are quick; climbing to
 *  the top 3 from further down takes content and links. */
function effortOf(row: OpportunityLine): 1 | 2 | 3 {
  if (row.kind === "snippet") return 1;
  return row.position <= 6 ? 2 : 3;
}
const EFFORT_NAME = ["", "Bajo", "Medio", "Alto"];

const effortDots = (effort: 1 | 2 | 3) =>
  `<span class="eff" title="Esfuerzo ${EFFORT_NAME[effort].toLowerCase()}"><i class="on"></i><i class="${effort >= 2 ? "on" : ""}"></i><i class="${effort >= 3 ? "on" : ""}"></i></span>`;

/** The first thing to do is what gains most for the least work. */
const priorityOf = (row: OpportunityLine) =>
  row.potentialClicks / effortOf(row);

function oppAnalysis(row: OpportunityLine): string {
  const ctrNow = ctr(row.clicks, row.impressions);
  const ctrWould = ctr(row.clicks + row.potentialClicks, row.impressions);
  return row.kind === "snippet"
    ? `La web se muestra **${num(row.impressions)} veces** pero solo el **${one.format(ctrNow * 100)} %** de las personas hace clic; en esa posición (${pos(row.position)}) lo normal sería cerca del **${one.format(ctrWould * 100)} %**. El título y la descripción no están convenciendo, y arreglarlo no exige tocar la página.`
    : `La web aparece en la **posición ${pos(row.position)}** con **${num(row.impressions)} impresiones** y recibe ${num(row.clicks)} clics. Los tres primeros resultados se llevan la mayoría de los clics: llegar ahí podría traer unos **${num(row.clicks + row.potentialClicks)} clics**${row.clicks > 0 ? ` (${signedPctText(row.potentialClicks / row.clicks)})` : ""}.`;
}

const signedPctText = (value: number) =>
  `${value >= 0 ? "+" : "−"}${one.format(Math.abs(value) * 100)} %`;

function oppActions(row: OpportunityLine): string[] {
  return row.kind === "snippet"
    ? [
        "Reescribir el título para que empiece por la búsqueda y diga qué se encuentra",
        "Reescribir la descripción con un motivo claro para hacer clic",
        "Medir el CTR de esta búsqueda en Search Console durante 4 semanas",
      ]
    : [
        "Comprobar que la página responde justo a lo que busca la persona y ampliarla donde falte",
        "Reforzar el enlazado interno hacia ella con un texto que contenga la búsqueda",
        "Incluir la búsqueda de forma natural en el título y en los encabezados",
      ];
}

function serpPreview(
  host: string,
  url: string | null,
  title: string,
  description: string,
  label: string,
): string {
  const path = url ? pathOf(url) : "";
  return `<div class="sl">${esc(label)}</div><div class="serp"><div class="su">${esc(host)}${esc(path)}</div><div class="st2">${esc(title)}</div>${description ? `<div class="sd">${esc(description)}</div>` : ""}</div>`;
}

function opportunitiesBlock(report: ReportFull): string {
  const rows = [...report.snapshot.opportunities].sort(
    (a, b) => priorityOf(b) - priorityOf(a),
  );
  if (rows.length === 0) return "";
  const host = (() => {
    try {
      return new URL(report.snapshot.siteUrl).hostname;
    } catch {
      return report.snapshot.siteUrl.replace("sc-domain:", "");
    }
  })();
  const ideas = new Map(
    report.notes.opportunityIdeas.map((item) => [item.query, item] as const),
  );
  const titles = new Map(
    report.notes.titleIdeas
      .filter((item) => item.options.length > 0)
      .map((item) => [item.query, item] as const),
  );
  const total = rows.reduce((sum, row) => sum + row.potentialClicks, 0);
  const quick = rows.filter((row) => effortOf(row) === 1);
  const pushes = rows.filter((row) => row.kind === "push");
  const topThree = rows
    .slice(0, 3)
    .reduce((sum, row) => sum + row.potentialClicks, 0);

  const summary = chips([
    {
      value: `+${num(total)}`,
      label: "clics posibles en un periodo como este",
    },
    { value: num(rows.length), label: "búsquedas con margen de mejora" },
    {
      value: `+${num(topThree)}`,
      label: "solo con las 3 primeras de la lista",
    },
    {
      value: num(quick.length),
      label: "se arreglan solo con título y descripción",
    },
  ]);

  const howTo = `<div class="how2"><div class="hw"><span class="kd push">${OPP_KIND_LABEL.push}</span><p>La web ya está cerca de los tres primeros resultados, que se llevan la mayoría de los clics. Un empujón de contenido y enlaces puede subirla. <b>${num(pushes.length)}</b> búsquedas.</p></div><div class="hw"><span class="kd snippet">${OPP_KIND_LABEL.snippet}</span><p>La web ya aparece, pero pocas personas hacen clic. Suele arreglarse reescribiendo el título y la descripción, sin tocar la página. <b>${num(quick.length)}</b> búsquedas.</p></div></div><p class="hwn">Están ordenadas por prioridad: primero lo que más clics puede traer con menos trabajo. El esfuerzo (<span class="eff"><i class="on"></i><i></i><i></i></span> bajo, <span class="eff"><i class="on"></i><i class="on"></i><i></i></span> medio, <span class="eff"><i class="on"></i><i class="on"></i><i class="on"></i></span> alto) es una estimación según el tipo de oportunidad y la posición actual.</p>`;

  const maxImpressions = Math.max(...rows.map((row) => row.impressions), 1);
  const maxPotential = Math.max(...rows.map((row) => row.potentialClicks), 1);
  const overview = dataTable(
    [
      { label: "Prioridad", num: true, asc: true },
      { label: "Búsqueda" },
      { label: "Tipo" },
      { label: "Posición", num: true, asc: true },
      { label: "Impresiones", num: true },
      { label: "Clics", num: true },
      { label: "Clics posibles", num: true },
      { label: "Esfuerzo", num: true, asc: true },
    ],
    rows.map((row, index) => [
      {
        h: `<span class="rkm${index < 3 ? " hot" : ""}">${index + 1}</span>`,
        v: index + 1,
      },
      {
        h: `${queryLink(row.query)}${row.page ? `<small class="pp">${esc(pathOf(row.page))}</small>` : ""}`,
        v: row.query,
        cls: "pg",
      },
      {
        h: `<span class="kd ${row.kind}" title="${OPP_KIND_LABEL[row.kind]}">${OPP_KIND_SHORT[row.kind]}</span>`,
        v: row.kind,
      },
      { h: pos(row.position), v: row.position },
      impressionsCell(row.impressions, maxImpressions),
      { h: num(row.clicks), v: row.clicks },
      {
        h: barNumber(row.potentialClicks, maxPotential).replace(
          "<b>",
          '<b class="gain">+',
        ),
        v: row.potentialClicks,
      },
      { h: effortDots(effortOf(row)), v: effortOf(row) },
    ]),
    "No hay datos.",
    true,
  );

  const shown = rows;
  const cards = shown
    .map((row, index) => {
      const idea = ideas.get(row.query);
      const actions = (
        idea?.actions.filter((a) => a.trim()).length
          ? idea?.actions.filter((a) => a.trim())
          : oppActions(row)
      ) as string[];
      const analysis = idea?.analysis.trim() || oppAnalysis(row);
      const result =
        idea?.result?.trim() ||
        `Hasta **+${num(row.potentialClicks)} clics** en un periodo como este. Se comprueba en Search Console mirando los clics y el CTR de esta búsqueda tras 4 semanas.`;
      const title = titles.get(row.query);
      const serps = title
        ? `<div class="os"><h5>Cómo se ve en Google</h5>${title.current ? serpPreview(host, title.url ?? row.page, title.current, "", "Hoy") : ""}${title.options
            .map((option, at) =>
              serpPreview(
                host,
                title.url ?? row.page,
                option.title,
                option.description,
                `Propuesta ${String.fromCharCode(65 + at)}`,
              ),
            )
            .join("")}</div>`
        : "";
      return `<details class="op"${index < 3 ? " open" : ""}><summary><span class="rk">${index + 1}</span><span class="ot"><b>${queryLink(row.query)}</b><span class="kd ${row.kind}">${OPP_KIND_LABEL[row.kind]}</span></span><span class="om"><span><small>Posición</small>${pos(row.position)}</span><span><small>Impresiones</small>${num(row.impressions)}</span><span><small>Esfuerzo</small>${effortDots(effortOf(row))}</span><span class="og">+${num(row.potentialClicks)}<small>clics posibles</small></span></span></summary><div class="ob${serps ? " two" : ""}"><div class="oc"><h5>Qué pasa</h5><div class="rich">${paragraphs(analysis)}</div><h5>Qué hacer, en este orden</h5><ol class="oa">${actions.map((action) => `<li>${inline(action)}</li>`).join("")}</ol><h5>Resultado esperado</h5><div class="rich">${paragraphs(result)}</div>${row.page ? `<div class="opg">Página que hoy posiciona: ${pageLink(row.page)}</div>` : ""}<div class="opg">Guías oficiales de Google: ${row.kind === "snippet" ? `${GUIDE.title} · ${GUIDE.snippet}` : `${GUIDE.helpful} · ${GUIDE.links}`}</div></div>${serps}</div></details>`;
    })
    .join("");

  const content = report.notes.contentIdeas.filter((item) => item.title.trim());
  const contentCard = (item: (typeof content)[number], index: number) => {
    const outline = (item.outline ?? []).filter((line) => line.trim());
    const links = item.linkFrom ?? [];
    const slug = item.slug?.replace(/^\/+/, "");
    const serp =
      item.metaTitle || item.metaDescription || slug
        ? `<div class="os"><h5>Cómo se vería en Google</h5>${serpPreview(host, slug ? `https://${host}/${slug}` : null, item.metaTitle || item.title, item.metaDescription ?? "", "Propuesta")}${slug ? `<p class="slg">Dirección sugerida: <b>/${esc(slug)}</b></p>` : ""}</div>`
        : "";
    return `<details class="op ct"${index < 2 ? " open" : ""}><summary><span class="rk">${index + 1}</span><span class="ot"><b>${esc(item.title)}</b>${item.target ? `<span class="itg">Apunta a: ${queryLink(item.target)}</span>` : ""}</span><span class="ik2">${esc(item.format || "Contenido")}</span></summary><div class="ob${serp ? " two" : ""}"><div class="oc"><h5>Por qué merece la pena</h5><div class="rich">${paragraphs(item.reason)}</div>${item.intent ? `<h5>Qué debe resolver la página</h5><div class="rich">${paragraphs(item.intent)}</div>` : ""}${outline.length > 0 ? `<h5>Estructura recomendada</h5><ol class="oa">${outline.map((line) => `<li>${inline(line)}</li>`).join("")}</ol>` : ""}${links.length > 0 ? `<h5>Enlazado interno</h5><div class="rich"><p>Para que la nueva página reciba tráfico desde el primer día, enlazar hacia ella desde:</p></div><ul class="lkl">${links.map((url) => `<li>${pageLink(url)}</li>`).join("")}</ul>` : ""}${item.result ? `<h5>Resultado esperado</h5><div class="rich">${paragraphs(item.result)}</div>` : ""}<div class="opg">Guías oficiales de Google: ${GUIDE.helpful} · ${GUIDE.title} · ${GUIDE.url}</div></div>${serp}</div></details>`;
  };
  const contentHtml =
    content.length > 0
      ? `<div class="blk"><div class="bh"><h2>Contenidos nuevos que merecen la pena</h2><p class="lead">Páginas o artículos que aún no existen, sacados de los temas y las búsquedas donde la web ya tiene recorrido. Cada idea trae lo necesario para encargarla: qué debe resolver, la estructura, el título y la descripción propuestos, y desde dónde enlazarla.</p></div><div class="ops">${content.map(contentCard).join("")}</div></div>`
      : "";

  return (
    block(
      report,
      "oportunidades",
      `Oportunidades de crecimiento: unos ${num(total)} clics más al alcance`,
      "Búsquedas en las que la web ya aparece y que, con una mejora concreta de título, contenido o enlaces, pueden traducirse en más clics.",
      `${summary}<div class="sheet">${howTo}</div><div class="sheet" style="margin-top:18px"><h3>Todas las oportunidades</h3>${overview}</div>`,
    ) +
    `<div class="blk"><div class="bh"><h2>Plan de acción por búsqueda</h2><p class="lead">Qué ocurre en cada una, qué hacer y en qué orden, cómo se vería en Google y qué resultado cabe esperar. Se abren y se cierran con un clic.</p></div><div class="ops">${cards}</div></div>` +
    contentHtml
  );
}

/** Title proposals for searches that are not among the opportunity cards
 *  (the ones that are show their proposal inside their own card). */
function titlesBlock(report: ReportFull): string {
  const inCards = new Set(
    [...report.snapshot.opportunities]
      .sort((a, b) => priorityOf(b) - priorityOf(a))
      .map((row) => row.query),
  );
  const items = report.notes.titleIdeas.filter(
    (item) => item.options.length > 0 && !inCards.has(item.query),
  );
  if (items.length === 0) return "";
  const host = (() => {
    try {
      return new URL(report.snapshot.siteUrl).hostname;
    } catch {
      return report.snapshot.siteUrl.replace("sc-domain:", "");
    }
  })();
  const cards = items
    .map((item) => {
      const options = item.options
        .map((option, at) =>
          serpPreview(
            host,
            item.url,
            option.title,
            option.description,
            `Propuesta ${String.fromCharCode(65 + at)}`,
          ),
        )
        .join("");
      return `<article class="tic"><div class="tq2">${queryLink(item.query)}</div>${item.current ? `<div class="cur">Título actual: ${esc(item.current)}${item.url ? ` · ${pageLink(item.url)}` : ""}</div>` : ""}${options}</article>`;
    })
    .join("");
  return block(
    report,
    "titulos",
    "Más propuestas de títulos y descripciones",
    "En estas búsquedas la web ya aparece, pero recibe pocos clics. Se proponen títulos y descripciones alternativos, tal como se verían en los resultados de Google.",
    `<div class="tid">${cards}</div>`,
  );
}

// ------------------------------------------------------------ technical

function healthBlock(report: ReportFull): string {
  const health = report.snapshot.health;
  if (!health || health.inSitemap < 5) return "";
  const covered = Math.max(0, 1 - health.unseen / health.inSitemap);
  const tile = (value: number, label: string) =>
    `<div><b>${num(value)}</b><small>${label}</small></div>`;
  return block(
    report,
    "tecnico",
    "Cobertura del sitemap en Google",
    "Se compara el sitemap con las páginas que Google ha mostrado en los últimos 3 meses.",
    `<div class="sheet"><div class="hlt"><div class="ring"><svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="15.9155" stroke="#ececee"/><circle cx="21" cy="21" r="15.9155" stroke="#1a1a1a" stroke-linecap="round" stroke-dasharray="${(covered * 100).toFixed(1)} ${(100 - covered * 100).toFixed(1)}"/></svg><div class="ct"><b>${Math.round(covered * 100)} %</b><small>con visibilidad</small></div></div><div class="hs">${tile(health.inSitemap, "páginas en el sitemap")}${tile(health.pagesWithImpressions, "páginas con impresiones")}${tile(health.unseen, "sin impresiones todavía")}${tile(health.notInSitemap, "con impresiones fuera del sitemap")}${tile(health.sitemapErrors, "errores de sitemap")}</div></div></div>`,
  );
}

const scoreTone = (score: number | null) =>
  score === null ? "flat" : score >= 85 ? "up" : score >= 55 ? "mid" : "down";

/** "73 /100": a score always says what it is out of. */
const outOf100 = (score: number | null) =>
  score === null
    ? "—"
    : `<b class="${scoreTone(score)}">${Math.round(score)}</b><i class="of">/100</i>`;

/** A score out of 100 with a small bar; sorts by the number. */
function scoreCell(score: number | null): Cell {
  if (score === null) return { h: '<span class="sn">—</span>', v: null };
  return {
    h: `<span class="spill ${scoreTone(score)}">${Math.round(score)}<i>/100</i></span>`,
    v: score,
  };
}

const mean = (values: (number | null)[]): number | null => {
  const real = values.filter((value): value is number => value !== null);
  return real.length === 0
    ? null
    : real.reduce((sum, value) => sum + value, 0) / real.length;
};

type IssueAgg = {
  kind: "fail" | "warn";
  title: string;
  category: string;
  points: number;
  detail: string;
  evidence: string;
  elements: AuditPage["issues"][number]["elements"];
  sources: { label: string; url: string }[];
  /** The example pages that have it, with the type of each. */
  pages: Map<string, string>;
  /** Checks that fail for the same cause and share this card. */
  related: IssueAgg[];
};

/** Every issue of the given pages, merged by name: a problem of a template
 *  shows up once, with the page types and the example pages it affects. */
function mergeIssues(pages: AuditPage[]): IssueAgg[] {
  const merged = new Map<string, IssueAgg>();
  for (const page of pages) {
    for (const issue of page.issues) {
      const found = merged.get(issue.title);
      if (!found) {
        merged.set(issue.title, {
          kind: issue.kind,
          title: issue.title,
          category: issue.category,
          points: issue.points ?? 0,
          detail: issue.detail,
          evidence: issue.evidence,
          elements: [...issue.elements],
          sources: [...issue.sources],
          pages: new Map([[page.url, page.type]]),
          related: [],
        });
        continue;
      }
      found.pages.set(page.url, page.type);
      if (issue.kind === "fail") found.kind = "fail";
      found.points = Math.max(found.points, issue.points ?? 0);
      if (issue.detail.length > found.detail.length)
        found.detail = issue.detail;
      for (const element of issue.elements) {
        const same = found.elements.find(
          (item) => item.label === element.label && item.url === element.url,
        );
        if (same) {
          if (element.status === "fail") same.status = "fail";
        } else if (found.elements.length < 10) {
          found.elements.push({ ...element });
        }
      }
      for (const source of issue.sources) {
        if (!found.sources.some((item) => item.url === source.url)) {
          found.sources.push(source);
        }
      }
    }
  }
  return [...merged.values()].sort(
    (x, y) =>
      Number(y.kind === "fail") - Number(x.kind === "fail") ||
      y.points - x.points ||
      y.pages.size - x.pages.size,
  );
}

const groupPoints = (item: IssueAgg) =>
  item.points + item.related.reduce((sum, other) => sum + other.points, 0);

/** The other checks of a group: what each one measures. */
function relatedBlock(item: IssueAgg): string {
  if (item.related.length === 0) return "";
  const line = (other: IssueAgg) =>
    `<div><b>${esc(other.title)}</b>${other.points > 0 ? ` (+${one.format(other.points)} pts)` : ""}${other.detail ? `: ${withLinks(other.detail)}` : ""}</div>`;
  return `<div class="rel"><b>Comprobaciones relacionadas, misma causa</b>${item.related.map(line).join("")}</div>`;
}

const STATUS_RANK = { fail: 0, warn: 1, info: 2, pass: 3 } as const;
const STATUS_MARK = { fail: "✕", warn: "!", pass: "✓", info: "" } as const;

const significantWords = (title: string) =>
  new Set(
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 8),
  );

/** Microaudit has checks that overlap (no JSON-LD / no Schema detected): same
 *  category, same kind, the same pages and a word in common in their names are
 *  one problem seen twice, so they share one card. */
function clusterIssues(list: IssueAgg[]): IssueAgg[] {
  const pagesKey = (item: IssueAgg) => [...item.pages.keys()].sort().join("|");
  const out: IssueAgg[] = [];
  for (const item of list) {
    const words = significantWords(item.title);
    const host = out.find(
      (other) =>
        other.category === item.category &&
        other.kind === item.kind &&
        pagesKey(other) === pagesKey(item) &&
        [...significantWords(other.title)].some((word) => words.has(word)),
    );
    if (host) host.related.push(item);
    else out.push(item);
  }
  return out;
}

const issuesOf = (pages: AuditPage[]) => clusterIssues(mergeIssues(pages));

function issueCard(item: IssueAgg, pageCount: number): string {
  // One pill per page type, linking to an example page of that type that has
  // the problem.
  const examples = new Map<string, string>();
  for (const [url, type] of item.pages) {
    if (!examples.has(type)) examples.set(type, url);
  }
  const pills = [...examples.entries()]
    .map(
      ([type, url]) =>
        `<a class="pill" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Ver una página de ejemplo con este problema: ${esc(pathOf(url))}">${esc(type)}</a>`,
    )
    .join("");
  const where =
    pageCount > 1 ? `Afecta a ${item.pages.size} de ${pageCount} páginas` : "";
  const meta = [esc(item.category), where].filter(Boolean).join(" · ");
  const sorted = [...item.elements].sort(
    (x, y) => STATUS_RANK[x.status] - STATUS_RANK[y.status],
  );
  const marked = sorted.some((element) => element.status !== "info");
  const elements = sorted
    .map((element) => {
      const mark = STATUS_MARK[element.status];
      const label = `${mark ? `<i class="m">${mark}</i>` : ""}${esc(element.label)}`;
      return element.url && isWeb(element.url)
        ? `<a class="el ${element.status}" href="${esc(element.url)}" target="_blank" rel="noopener noreferrer" title="${esc(element.url)}">${label}</a>`
        : `<span class="el ${element.status}">${label}</span>`;
    })
    .join("");
  const legend = marked
    ? `<div class="elk"><span>Lo que se ha comprobado:</span><span class="kp">✓ correcto</span><span class="kf">✕ a corregir</span></div>`
    : "";
  const sources = [
    ...item.sources,
    ...item.related.flatMap((other) => other.sources),
  ]
    .filter(
      (source, at, all) => all.findIndex((x) => x.url === source.url) === at,
    )
    .map(
      (source) =>
        `<a class="lk" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)} ↗</a>`,
    )
    .join(" · ");
  return `<article class="is"><div class="ish"><span class="ik ${item.kind}">${item.kind === "fail" ? "A corregir" : "A mejorar"}</span><h4>${esc(item.title)}</h4>${groupPoints(item) > 0 ? `<span class="ip">+${one.format(groupPoints(item))} pts</span>` : ""}</div>${pills ? `<div class="pills">${pills}</div>` : ""}<div class="im">${meta}</div>${item.detail ? `<p>${withLinks(item.detail)}</p>` : ""}${item.evidence ? `<p class="ev">${withLinks(item.evidence)}</p>` : ""}${relatedBlock(item)}${elements ? `${legend}<div class="els">${elements}</div>` : ""}${sources ? `<div class="src">Documentación oficial: ${sources}</div>` : ""}</article>`;
}

/** The issues of a set of pages: first what to fix, then what to improve. */
function issueLists(pages: AuditPage[]): string {
  const issues = issuesOf(pages);
  const list = (items: IssueAgg[], title: string) =>
    items.length > 0
      ? `<h3 class="ih">${title} (${items.length})</h3><div class="isl">${items.map((item) => issueCard(item, pages.length)).join("")}</div>`
      : "";
  return (
    list(
      issues.filter((item) => item.kind === "fail"),
      "Qué corregir",
    ) +
    list(
      issues.filter((item) => item.kind === "warn"),
      "Qué mejorar",
    )
  );
}

/** The analysis of one page type: its score out of 100, the score of every
 *  category and ALL the issues Microaudit found for its example pages. */
function typePanel(type: string, pages: AuditPage[]): string {
  const score = mean(pages.map((page) => page.score));
  const categories = new Map<
    number,
    { name: string; scores: (number | null)[]; fails: number; warns: number }
  >();
  for (const page of pages) {
    for (const category of page.categories) {
      const entry = categories.get(category.id) ?? {
        name: category.name,
        scores: [],
        fails: 0,
        warns: 0,
      };
      entry.scores.push(category.score);
      entry.fails += category.fails;
      entry.warns += category.warns;
      categories.set(category.id, entry);
    }
  }
  const bars = [...categories.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([, entry]) => {
      const value = mean(entry.scores);
      const note =
        entry.fails + entry.warns === 0
          ? "sin problemas"
          : [
              entry.fails ? `${entry.fails} a corregir` : "",
              entry.warns ? `${entry.warns} a mejorar` : "",
            ]
              .filter(Boolean)
              .join(" · ");
      return `<div class="cr"><span class="cn">${esc(entry.name)}<small>${note}</small></span><div class="sb"><i style="--w:${Math.max(2, value ?? 0).toFixed(0)}%"></i></div><span class="cs">${outOf100(value)}</span></div>`;
    })
    .join("");
  const links = pages
    .map(
      (page) =>
        `<li>${pageLink(page.url)} <span class="pn">${page.score === null ? "—" : Math.round(page.score)}/100</span></li>`,
    )
    .join("");
  return `<div class="tp"><div class="tph"><div class="tps">${outOf100(score)}<small>nota media de «${esc(type)}» sobre 100${pages.length > 1 ? ` (${pages.length} páginas)` : ""}</small></div><ul class="tpl">${links}</ul></div><div class="crs">${bars}</div><div class="noprint">${issueLists(pages)}</div></div>`;
}

/** The page types always read in the same order: home, category, product,
 *  post; any other type comes after, in the order it was created. */
const TYPE_ORDER = [
  /^(home|inicio|portada)/,
  /^categor/,
  /^producto/,
  /^(post|blog|art[ií]culo|entrada)/,
];
function byTypeOrder(types: string[]): string[] {
  const rank = (type: string) => {
    const at = TYPE_ORDER.findIndex((pattern) =>
      pattern.test(type.trim().toLowerCase()),
    );
    return at < 0 ? TYPE_ORDER.length : at;
  };
  return types
    .map((type, index) => ({ type, index }))
    .sort((a, b) => rank(a.type) - rank(b.type) || a.index - b.index)
    .map((item) => item.type);
}

/** Microaudit on the example pages of each page type: how every template of
 *  the site scores and everything that is wrong or can improve in it. */
function auditsBlock(report: ReportFull, missing: string[] = []): string {
  const audits: AuditPage[] = report.snapshot.audits ?? [];
  if (audits.length === 0) return "";
  const types = byTypeOrder([
    ...new Set([...audits.map((audit) => audit.type), ...missing]),
  ]);
  const byType = (type: string) =>
    audits.filter((audit) => audit.type === type);
  const categories = new Map<number, string>();
  for (const audit of audits) {
    for (const category of audit.categories) {
      categories.set(category.id, category.name);
    }
  }
  const matrix = dataTable(
    [
      { label: "Categoría" },
      ...types.map((type) => ({ label: type, num: true })),
    ],
    [
      ...[...categories.entries()]
        .sort((x, y) => x[0] - y[0])
        .map(([id, name]) => [
          { h: esc(name), v: name },
          ...types.map((type) =>
            scoreCell(
              mean(
                byType(type).map(
                  (audit) =>
                    audit.categories.find((category) => category.id === id)
                      ?.score ?? null,
                ),
              ),
            ),
          ),
        ]),
    ],
    "No hay datos.",
    true,
  );
  const TONE_WORD = {
    up: "Bien",
    mid: "Mejorable",
    down: "Hay mucho que corregir",
    flat: "Sin datos",
  };
  const typeCards = `<div class="gsc">${types
    .map((type) => {
      const score = mean(byType(type).map((audit) => audit.score));
      const tone = scoreTone(score);
      return `<div class="gs ${tone}"><span class="gk">${esc(type)}</span><b>${score === null ? "—" : Math.round(score)}<i>/100</i></b><span class="gl">${TONE_WORD[tone]}</span></div>`;
    })
    .join("")}</div>`;
  const everything = issuesOf(audits);
  const average = mean(audits.map((audit) => audit.score));
  const summary = chips([
    {
      value:
        average === null ? "—" : `${Math.round(average)}<i class="of">/100</i>`,
      label: "nota media de la web",
    },
    {
      value: num(types.length),
      label: types.length === 1 ? "tipología auditada" : "tipologías auditadas",
    },
    {
      value: num(everything.filter((item) => item.kind === "fail").length),
      label: "problemas a corregir",
    },
    {
      value: num(everything.filter((item) => item.kind === "warn").length),
      label: "aspectos a mejorar",
    },
  ]);
  const panels = subTabs("aud", [
    {
      id: "all",
      label: "Todo el sitio",
      count: everything.length,
      html: `<p class="lead tabl">Cada tarea indica las tipologías de página a las que afecta y páginas de ejemplo para ver el problema.</p>${issueLists(audits)}`,
    },
    ...types.map((type, index) => ({
      id: `t${index}`,
      label: type,
      count: issuesOf(byType(type)).length,
      html: typePanel(type, byType(type)),
    })),
  ]);
  return block(
    report,
    "auditoria",
    "Auditoría técnica por tipología de página",
    `Microaudit ha revisado ${num(audits.length)} ${audits.length === 1 ? "página" : "páginas"} de ejemplo con más de 90 comprobaciones de SEO y de SEO para asistentes de IA. Las páginas de una misma tipología se analizan juntas, como la media de esa plantilla. Cada nota va de 0 a 100 (100 es que no hay nada que corregir) y una categoría con algún fallo no pasa de 35 hasta corregirlo.`,
    `${summary}<div class="sheet"><h3>Nota global de cada tipología</h3><p class="gsn">Nota media sobre 100 de cada tipología de página.</p>${typeCards}<h3 class="gsh">Nota por categoría</h3>${matrix}</div><div class="sheet" style="margin-top:18px">${panels}</div>`,
  );
}

/** Shown only to the consultant, in the editor's preview. */
/** Only the consultant sees it: the pages Microaudit could not read. */
function unreadableNotice(pages: AuditPage[]): string {
  if (pages.length === 0) return "";
  return `<div class="note" style="margin:0 0 32px"><b>Páginas que Microaudit no ha podido leer</b>No devolvieron título ni contenido (normalmente por un bloqueo anti-bots), así que no cuentan en la nota ni en los fallos para no dar datos falsos: ${pages.map((page) => `${esc(page.type)} (${pageLink(page.url)})`).join(", ")}. Vuelve a auditar más tarde o prueba con otra página de ejemplo.</div>`;
}

function auditsHint(): string {
  return `<div class="note"><b>Solo en la vista previa</b>Este informe aún no tiene auditoría técnica. Define las tipologías de página en el Contexto del proyecto y usa «Auditar» en el editor: el cliente no verá este aviso.</div>`;
}

function discoverBlock(report: ReportFull): string {
  const discover = report.snapshot.discover;
  if (!discover) return "";
  const max = Math.max(...discover.topPages.map((item) => item.clicks), 1);
  const pages = discover.topPages
    .map(
      (page) =>
        `<div class="brow"><span class="n">${pageLink(page.url)}</span><span class="d">${num(page.clicks)}</span><span class="bar"><i class="upb" style="--w:${Math.max(4, (page.clicks / max) * 100).toFixed(0)}%"></i></span></div>`,
    )
    .join("");
  return block(
    report,
    "discover",
    "Tráfico procedente de Google Discover",
    "Discover recomienda contenido a usuarios con intereses afines aunque no hayan buscado nada: es tráfico adicional al de las búsquedas.",
    `<div class="sheet"><div class="grid g2"><div><h3>Clics desde Discover</h3><div class="topic" style="border:0;box-shadow:none;padding:0"><div class="tk"><b data-count="${discover.clicks}" data-kind="int">${num(discover.clicks)}</b>${report.snapshot.period.comparable ? pctDelta(discover.clicks, discover.prevClicks) : ""}</div><small>${num(discover.impressions)} impresiones</small></div></div><div><h3>Contenido más recomendado</h3>${pages}</div></div></div>`,
  );
}

// ---------------------------------------------------------------- close

const shortPath = (path: string) =>
  path.length > 38 ? `${path.slice(0, 35)}…` : path;

type Step = { title: string; why: string; how: string[]; impact: string };

/** Without AI text the roadmap is built from the data: the few moves that can
 *  change the figures, each with why, how and what to expect. */
function suggestedSteps(report: ReportFull): Step[] {
  const { snapshot } = report;
  const steps: Step[] = [];
  const top = [...snapshot.opportunities]
    .sort((a, b) => b.potentialClicks - a.potentialClicks)
    .slice(0, 5);
  const gain = top.reduce((sum, item) => sum + item.potentialClicks, 0);
  if (gain >= 20) {
    steps.push({
      title: `Ejecutar las ${top.length} mejoras de mayor retorno de la pestaña Oportunidades`,
      why: "son búsquedas en las que la web ya aparece cerca del top 3 o muy visible pero poco clicada, así que el esfuerzo es pequeño frente al resultado",
      how: [
        "Reescribir el título y la descripción de las páginas implicadas",
        "Ampliar el contenido con la pregunta concreta que busca el usuario",
        "Enlazar esas páginas desde otras con más tráfico",
      ],
      impact: `unas ${num(gain)} visitas más por periodo`,
    });
  }
  const loser = snapshot.pageLosers[0];
  if (loser && loser.clicksDelta <= -30) {
    steps.push({
      title: `Recuperar las páginas que pierden tráfico, empezando por [${shortPath(pathOf(loser.key))}](${loser.key})`,
      why: `concentra la mayor caída (${signedNum(loser.clicksDelta)} clics, un ${one.format(Math.abs(percentChange(loser.clicks, loser.prevClicks) ?? 0) * 100)} %) y ya tiene historial en Google, así que es más fácil recuperarla que crear algo nuevo`,
      how: [
        "Comprobar que la página sigue indexada y que Google muestra la versión correcta",
        "Revisar si la búsqueda ha cambiado de intención y adaptar el contenido",
        "Reforzar el enlazado interno hacia ella",
      ],
      impact: `recuperar parte de los ${num(Math.abs(loser.clicksDelta))} clics perdidos`,
    });
  }
  const topic = [...snapshot.topics].sort(
    (a, b) => b.nearTopShare * b.impressions - a.nearTopShare * a.impressions,
  )[0];
  if (topic && topic.nearTopShare >= 0.4) {
    steps.push({
      title: `Reforzar el tema «${topic.label}» con contenido y enlaces internos`,
      why: `el ${Math.round(topic.nearTopShare * 100)} % de sus impresiones está en las posiciones 4 a 20, la zona donde un empujón sube al top 3`,
      how: [
        "Ampliar las páginas que ya posicionan con las dudas que aún no responden",
        "Crear las páginas que falten para las búsquedas del tema",
      ],
      impact: "más clics en un tema donde ya hay visibilidad",
    });
  }
  const audits = snapshot.audits ?? [];
  const repeated = new Map<string, Set<string>>();
  for (const audit of audits) {
    for (const issue of audit.issues) {
      if (issue.kind !== "fail") continue;
      repeated.set(
        issue.title,
        (repeated.get(issue.title) ?? new Set()).add(audit.url),
      );
    }
  }
  const worst = [...repeated.entries()].sort(
    (x, y) => y[1].size - x[1].size,
  )[0];
  if (worst) {
    steps.push({
      title: `Corregir en las plantillas del sitio «${worst[0]}»`,
      why: `falla en ${worst[1].size} de las ${audits.length} páginas tipo auditadas, así que un solo cambio mejora muchas páginas a la vez`,
      how: [
        "Aplicar el arreglo en la plantilla, no página a página",
        "Volver a auditar las páginas de ejemplo para comprobarlo",
      ],
      impact: "mejor nota técnica en todo el sitio",
    });
  }
  if (steps.length === 0) {
    steps.push({
      title: "Mantener el ritmo de publicación y de mejora",
      why: "la web se mueve dentro de lo esperado y conviene medir el efecto de lo ya hecho",
      how: ["Revisar la evolución en el próximo informe"],
      impact: "seguir creciendo de forma estable",
    });
  }
  return steps.slice(0, 5);
}

/** Reads the roadmap text. Each step is a block separated by a blank line: the
 *  first line is the action, then "Por qué:", "Cómo:" (actions separated by
 *  ";") and "Impacto:". A step on a single line may use "acción — motivo". */
function parseSteps(text: string): Step[] {
  const labelled = /^(por qu[eé]|c[oó]mo|impacto)/im.test(text);
  const blocks =
    /\n\s*\n/.test(text) || labelled ? text.split(/\n\s*\n/) : text.split("\n");
  const steps: Step[] = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const first = lines[0].replace(/^(\d+[.)]|[-•])\s*/, "");
    const dash = first.indexOf(" — ");
    const step: Step = {
      title: dash > 0 ? first.slice(0, dash) : first,
      why: dash > 0 ? first.slice(dash + 3) : "",
      how: [],
      impact: "",
    };
    for (const line of lines.slice(1)) {
      const why = /^por qu[eé]:\s*(.*)$/i.exec(line);
      const how = /^c[oó]mo:\s*(.*)$/i.exec(line);
      const impact = /^impacto( esperado)?:\s*(.*)$/i.exec(line);
      if (why) step.why = why[1];
      else if (how) {
        step.how = how[1]
          .split(";")
          .map((item) => item.trim())
          .filter(Boolean);
      } else if (impact) step.impact = impact[2];
      else step.why = `${step.why} ${line}`.trim();
    }
    steps.push(step);
  }
  return steps;
}

function stepHtml(step: Step, index: number): string {
  return `<li class="st"><span class="sn">${String(index + 1).padStart(2, "0")}</span><div class="sc"><b class="stt">${inline(capital(step.title))}</b>${step.why ? `<p class="sw">${inline(capital(step.why))}</p>` : ""}${step.how.length > 0 ? `<ul class="sh">${step.how.map((item) => `<li>${inline(capital(item))}</li>`).join("")}</ul>` : ""}${step.impact ? `<p class="si"><b>Impacto esperado</b>${inline(capital(step.impact))}</p>` : ""}</div></li>`;
}

function closing(report: ReportFull): string {
  const typed = parseSteps(report.notes.nextSteps);
  const steps = typed.length > 0 ? typed : suggestedSteps(report);
  const note = report.notes.sectionNotes.proximos?.trim();
  return `<footer class="end" id="proximos"><div class="wrap">
<div class="kick">Próximos pasos</div><h2>Hoja de ruta para el próximo periodo</h2>
<ol class="steps">${steps.map(stepHtml).join("")}</ol>
${note ? `<div class="note" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);color:#f6f6f6"><b style="color:#ffb3c0">Nota de ${esc(noteAuthor)}</b>${paragraphs(note)}</div>` : ""}
<div class="foot"><span class="fm">${LOGO_MARK_LIGHT}</span><span>Informe generado el ${day(report.snapshot.generatedAt.slice(0, 10))} con datos de Google Search Console · <a href="https://carlosortega.page/contacto/" target="_blank" rel="noopener noreferrer">carlosortega.page</a></span></div>
</div></footer>`;
}

// ----------------------------------------------------------------- page

export type RenderMode = "public" | "preview";

type Panel = { id: string; label: string; html: string; count?: number };

const TAB_ORDER = [
  "trafico",
  "posiciones",
  "busquedas",
  "paginas",
  "temas",
  "oportunidades",
  "tecnico",
  "analisis",
];

/** The space every printed page keeps at its top and bottom: a table repeats
 *  its header and footer on each page. */
const PAGE_SPACERS =
  '<thead><tr><td><div class="pgsp h"></div></td></tr></thead><tfoot><tr><td><div class="pgsp f"></div></td></tr></tfoot>';

/** What each section is about, for the cover page that opens it in print. */
const SECTION_LEAD: Record<string, string> = {
  trafico:
    "Cómo ha evolucionado el tráfico, de dónde viene y qué lo ha movido.",
  posiciones: "En qué posiciones de Google aparece la web y qué ha cambiado.",
  busquedas:
    "Las búsquedas que más mueven el tráfico: las que suben y las que bajan.",
  paginas: "Las páginas que reciben el tráfico y las que más han cambiado.",
  temas:
    "Los temas donde la web tiene más peso y dónde hay margen para crecer.",
  oportunidades:
    "Dónde hay clics al alcance y qué hacer, en qué orden y con qué resultado.",
  tecnico: "El estado técnico del sitio, tipología de página por tipología.",
  analisis:
    "Lo que dicen los datos al cruzarlos y qué implica para el negocio.",
};

export function renderReportDocument(
  source: ReportFull,
  mode: RenderMode,
  signer: Signer = CARLOS,
): string {
  noteAuthor = signer.name.split(" ")[0];
  // Audits of pages Microaudit could not read are left out of every figure.
  const unreadable = (source.snapshot.audits ?? []).filter(looksUnreadable);
  const report: ReportFull =
    unreadable.length === 0
      ? source
      : {
          ...source,
          snapshot: {
            ...source.snapshot,
            audits: source.snapshot.audits.filter(
              (audit) => !looksUnreadable(audit),
            ),
          },
        };
  const { snapshot } = report;
  // Types whose pages could not be read still show, as "no data".
  const readableTypes = new Set(
    (report.snapshot.audits ?? []).map((audit) => audit.type),
  );
  const missingTypes = [
    ...new Set(
      unreadable
        .map((audit) => audit.type)
        .filter((type) => !readableTypes.has(type)),
    ),
  ];
  const host = snapshot.siteUrl.startsWith("sc-domain:")
    ? snapshot.siteUrl.slice("sc-domain:".length)
    : (() => {
        try {
          return new URL(snapshot.siteUrl).hostname;
        } catch {
          return snapshot.siteUrl;
        }
      })();
  const hidden = new Set<string>(report.notes.hidden);
  const show = (id: SectionId, build: () => string) =>
    hidden.has(id) ? "" : build();
  const columns = (...parts: string[]) => {
    const filled = parts.filter(Boolean);
    return filled.length > 1
      ? `<div class="cols${filled.length}">${filled.join("")}</div>`
      : filled.join("");
  };
  const lead = (tab: string) =>
    PANEL_NOTE[tab] ? analysisCard(report, PANEL_NOTE[tab]) : "";

  const panels: Panel[] = [
    {
      id: "analisis",
      label: "Conclusiones detalladas",
      html: show("hallazgos", () => insightsBlock(report)),
    },
    {
      id: "trafico",
      label: "Tráfico",
      html:
        lead("trafico") +
        show("evolucion", () => trendBlock(report)) +
        show("reparto", () => trafficMixBlock(report)) +
        show("semana", () => weekBlock(report)) +
        show("discover", () => discoverBlock(report)),
    },
    {
      id: "posiciones",
      label: "Posicionamiento",
      html:
        lead("posiciones") + show("posiciones", () => positionsBlock(report)),
    },
    {
      id: "busquedas",
      label: "Búsquedas",
      html:
        lead("busquedas") +
        show("marca", () => brandBlock(report)) +
        show("consultas", () => searchesBlock(report)),
    },
    {
      id: "paginas",
      label: "Páginas",
      html:
        lead("paginas") +
        show("origen", () => pagesBlock(report)) +
        show("diagnostico", () => diagnosisBlock(report)),
    },
    {
      id: "temas",
      label: "Temas",
      html: lead("temas") + show("temas", () => topicsBlock(report)),
    },
    {
      id: "oportunidades",
      label: "Oportunidades",
      html:
        lead("oportunidades") +
        show("oportunidades", () => opportunitiesBlock(report)) +
        show("titulos", () => titlesBlock(report)),
    },
    {
      id: "tecnico",
      label: "Técnico",
      html:
        lead("tecnico") +
        show(
          "auditoria",
          () =>
            (mode === "preview" ? unreadableNotice(unreadable) : "") +
            (auditsBlock(report, missingTypes) ||
              (mode === "preview" ? auditsHint() : "")),
        ) +
        columns(show("tecnico", () => healthBlock(report))),
    },
  ]
    // A panel with only its analysis and no data behind it is not shown.
    .filter(
      (panel) =>
        panel.html
          .replace(/<section class="an">[\s\S]*?<\/section>/, "")
          .trim() !== "",
    )
    .sort((a, b) => TAB_ORDER.indexOf(a.id) - TAB_ORDER.indexOf(b.id));

  const summaryHtml = executiveSummary(report, signer);
  const tabButtons = panels
    .map(
      (panel, index) =>
        `<button type="button" role="tab" data-tab="${panel.id}" class="${index === 0 ? "on" : ""}">${esc(panel.label)}</button>`,
    )
    .join("");
  const sectionCover = (panel: Panel, index: number) =>
    `<section class="scover" aria-hidden="true"><div class="scb"><div class="scm">${LOGO_MARK_LIGHT}<span>Informe SEO · ${esc(report.clientName?.trim() || host)}</span></div><div class="scn">${String(index + 1).padStart(2, "0")}</div><h2>${esc(panel.label)}</h2><div class="scr"></div><p>${esc(SECTION_LEAD[panel.id] ?? "")}</p><div class="scp">${esc(rangeShort(snapshot.range.startDate, snapshot.range.endDate))}</div></div></section>`;
  const panelHtml = panels
    .map(
      (panel, index) =>
        `${sectionCover(panel, index)}<table class="pgwrap pgpanel">${PAGE_SPACERS}<tbody><tr><td><div class="panel${index === 0 ? " on" : ""}" data-panel="${panel.id}" role="tabpanel"><div class="ptitle">${esc(panel.label)}</div>${panel.html}</div></td></tr></tbody></table>`,
    )
    .join("");
  const data = {
    comparable:
      snapshot.period.comparable && snapshot.prevTotals.impressions > 0,
    daily: snapshot.daily,
    updates: snapshot.updates.map((update) => ({
      begin: update.begin,
      end: update.end,
      label: update.label,
      short: KIND_SHORT[update.kind],
      color: KIND_COLOR[update.kind],
    })),
  };
  const clientName = report.clientName?.trim() || host;
  const title = `${report.title}${report.clientName ? ` · ${report.clientName}` : ""}`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#1a1a1a">
<title>${esc(title)}</title>
<link rel="icon" type="image/png" href="${FAVICON_POSITIVE}">
<script>document.documentElement.className="js";</script>
<style>${REPORT_CSS}</style></head>
<body>
<div class="top" id="top"><div class="wrap"><span class="iso">${LOGO_MARK_LIGHT}</span><span class="ttl">${esc(clientName)} · Informe SEO</span><span class="per">${esc(rangeShort(snapshot.range.startDate, snapshot.range.endDate))}</span><button class="cta" type="button" onclick="window.print()">${mode === "preview" ? "Vista previa · " : ""}Imprimir / PDF</button></div></div>
<div class="pfoot" aria-hidden="true"><span>${esc(clientName)} · Informe SEO · ${esc(rangeShort(snapshot.range.startDate, snapshot.range.endDate))}</span><span>carlosortega.page</span></div>
${hero(report, host)}
${summaryHtml ? `<table class="pgwrap">${PAGE_SPACERS}<tbody><tr><td>${summaryHtml}</td></tr></tbody></table>` : ""}
<div class="tabsbar" id="tabs"><div class="wrap"><div class="tabs2" role="tablist">${tabButtons}</div></div></div>
<main class="wrap panels">${panelHtml}</main>
${hidden.has("proximos") ? "" : closing(report)}
<button class="totop" id="totop" type="button" aria-label="Volver arriba"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
<script type="application/json" id="report-data">${jsonForScript(data)}</script>
<script>${REPORT_SCRIPT}</script>
</body></html>`;
}
