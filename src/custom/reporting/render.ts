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
import { REPORT_CSS } from "@/custom/reporting/renderStyles";
import {
  type AuditPage,
  type ChangeLine,
  type PageRow,
  type QueryRow,
  type QueryTableRow,
  type ReportFull,
  type SectionId,
  type SegmentLine,
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

function paragraphs(text: string): string {
  return text
    .split(/\n\s*\n|\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${esc(part)}</p>`)
    .join("");
}

/** The reading of a tab: what happened, why and what it means. */
function analysisCard(report: ReportFull, id: SectionId): string {
  if (report.notes.hidden.includes(id)) return "";
  const text = report.notes.sectionNotes[id]?.trim();
  return text
    ? `<section class="an"><div class="ak">Análisis</div>${paragraphs(text)}</section>`
    : "";
}

function noteOf(report: ReportFull, id: SectionId): string {
  if (PANEL_NOTE_IDS.has(id)) return "";
  const text = report.notes.sectionNotes[id]?.trim();
  return text
    ? `<div class="note"><b>Nota de Carlos</b>${esc(text)}</div>`
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
    rows.length > 8
      ? `<div class="tools"><input class="flt" type="search" placeholder="Filtrar la lista…" aria-label="Filtrar la lista"><span class="cnt" data-total="${rows.length}">${num(rows.length)} filas</span></div>`
      : "";
  const more =
    rows.length > PRINT_ROWS
      ? `<p class="onlyprint">Se muestran las ${PRINT_ROWS} primeras de ${num(rows.length)}. La lista completa está en la versión web del informe.</p>`
      : "";
  return `<div class="tw">${tools}<div class="tbox"><table class="qt sm sortable"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${more}</div>`;
}

const ctr = (clicks: number, impressions: number) =>
  impressions > 0 ? clicks / impressions : 0;
const ctrText = (clicks: number, impressions: number) =>
  impressions > 0 ? `${one.format(ctr(clicks, impressions) * 100)} %` : "—";

/** The clicks of a row, with the previous period's under them. */
function clicksCell(clicks: number, prev: number | null): Cell {
  return {
    h: `<b>${num(clicks)}</b>${prev === null ? "" : `<small>antes ${num(prev)}</small>`}`,
    v: clicks,
  };
}

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
      clicksCell(row.clicks, comparable ? row.prevClicks : null),
      ...(comparable ? [deltaCell(row.clicks, row.prevClicks)] : []),
      { h: num(row.impressions), v: row.impressions },
      {
        h: ctrText(row.clicks, row.impressions),
        v: ctr(row.clicks, row.impressions),
      },
    ]),
  );
}

/** The searches of a position band, new searches and lost ones. */
function simpleQueries(rows: QueryRow[], lost: boolean): string {
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
      {
        h: num(lost ? row.prevClicks : row.clicks),
        v: lost ? row.prevClicks : row.clicks,
      },
      { h: num(row.impressions), v: row.impressions },
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
  return dataTable(
    [
      { label: "Búsqueda" },
      { label: "Posición", num: true, asc: true },
      { label: "Impresiones", num: true },
    ],
    rows.map((row) => [
      { h: queryLink(row.query), v: row.query },
      positionCell(row.prevPosition, row.position),
      { h: num(row.impressions), v: row.impressions },
    ]),
    entering ? "Ninguna búsqueda ha entrado." : "Ninguna búsqueda ha salido.",
  );
}

/** Pages or searches that gained or lost clicks, with what explains it. */
function changeTable(rows: ChangeLine[]): string {
  const pages = rows.length > 0 && isWeb(rows[0].key);
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
        v: pages ? row.key : row.key,
        cls: pages ? "pg" : "",
      },
      deltaCell(row.clicks, row.prevClicks),
      clicksCell(row.clicks, row.prevClicks),
      positionCell(row.prevPosition, row.position),
    ]),
    "Sin variaciones destacables.",
  );
}

/** The pages with most clicks, each with its share drawn as a bar. */
function pagesTable(rows: PageRow[], comparable: boolean): string {
  const max = Math.max(...rows.map((row) => row.clicks), 1);
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
      {
        h: `${pageLink(row.url)}<div class="sb"><i style="--w:${Math.max(2, (row.clicks / max) * 100).toFixed(0)}%"></i></div>`,
        v: row.url,
        cls: "pg",
      },
      clicksCell(row.clicks, comparable ? row.prevClicks : null),
      ...(comparable ? [deltaCell(row.clicks, row.prevClicks)] : []),
      comparable
        ? positionCell(row.prevPosition, row.position)
        : { h: pos(row.position), v: row.position },
      { h: num(row.impressions), v: row.impressions },
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
<p class="sub rv d1">${esc(host)}${snapshot.scope === "sin marca" ? " · sin contar las búsquedas de marca" : ""}</p>
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
function executiveSummary(report: ReportFull): string {
  const message = report.notes.message.trim();
  if (!message) return "";
  const verdict = buildVerdict(report.snapshot);
  return `<section class="s wrap" id="resumen"><div class="sum rv">
<div class="kick">Resumen ejecutivo</div>
<h2 class="sumh">${esc(verdict.headline)}</h2>
<div class="sumt">${paragraphs(message)}</div>
<div class="sig"><span class="av">${LOGO_MARK_LIGHT}</span><span><b>Carlos Ortega</b>Consultor SEO</span></div>
</div></section>`;
}

// ------------------------------------------------------------- insights

function insightCard(item: Insight): string {
  const stats = item.stats
    .map((stat) => `<span>${esc(stat.label)}<b>${esc(stat.value)}</b></span>`)
    .join("");
  return `<article class="fd"><div class="top2"><span>${esc(item.topic)}</span><span class="tone ${item.tone}">${TONE_LABEL[item.tone]}</span></div><div class="t">${esc(item.title)}</div><p class="b">${esc(item.body)}</p><div class="st">${stats}</div></article>`;
}

function insightsBlock(report: ReportFull): string {
  const items = buildInsights(report.snapshot).slice(0, 12);
  if (items.length === 0) return "";
  return block(
    report,
    "hallazgos",
    "Conclusiones del periodo",
    "Lectura conjunta de las distintas fuentes de Search Console: qué ha ocurrido, por qué y qué implica para el proyecto.",
    `<div class="ins">${items.map(insightCard).join("")}</div>`,
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
  const rows = lines
    .slice(0, 6)
    .map((line, index) => {
      const diff = line.clicks - line.prevClicks;
      const change = percentChange(line.clicks, line.prevClicks);
      const delta = comparable
        ? `<span class="dl ${diff > 0 ? "up" : diff < 0 ? "down" : "flat"}">${diff > 0 ? "▲" : diff < 0 ? "▼" : "="} ${diff === 0 ? "igual" : signedNum(diff)}${change !== null && diff !== 0 ? ` <i>(${change > 0 ? "+" : "−"}${one.format(Math.abs(change) * 100)} %)</i>` : ""}</span>`
        : "";
      return `<div class="mr${index === 0 ? " first" : ""}"><div class="ml"><span class="mn" title="${esc(line.label)}">${esc(line.label)}</span><span class="mp">${one.format(line.share * 100)} % de los clics</span></div><div class="mb"><i style="--w:${Math.max(2, line.share * 100).toFixed(1)}%"></i></div><div class="mv"><b>${num(line.clicks)}</b>${delta}</div></div>`;
    })
    .join("");
  const net = comparable ? countDelta(total, prevTotal) : "";
  return `<div class="sheet mix"><div class="mh"><h3>${esc(title)}</h3>${net}</div>${rows}</div>`;
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
        .map((fix) => `<li>${esc(fix)}</li>`)
        .join("");
      return `<article class="dgc"><div class="u">${pageLink(item.url)}</div>${meta}<p>${esc(item.text)}</p>${fixes ? `<h3>Actuaciones previstas</h3><ul class="fix">${fixes}</ul>` : ""}</article>`;
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

function topicsBlock(report: ReportFull): string {
  const { snapshot } = report;
  if (snapshot.topics.length === 0) return "";
  const cards = snapshot.topics
    .map((topic) => {
      const delta = snapshot.period.comparable
        ? pctDelta(topic.clicks, topic.prevClicks)
        : "";
      const queries = topic.topQueries
        .map((item) => `<li>${queryLink(item.query)}</li>`)
        .join("");
      const reach = Math.round(topic.nearTopShare * 100);
      return `<div class="topic"><div class="tn">${esc(topic.label)}</div><div class="tk"><b>${num(topic.clicks)}</b><span>clics</span>${delta}</div><small>${num(topic.queries)} búsquedas · ${num(topic.impressions)} impresiones · posición media ${one.format(topic.position)}</small><ul class="tq">${queries}</ul><div><small>Impresiones en posiciones 4 a 20: ${reach} %</small><div class="meter"><i style="--w:${reach}%"></i></div></div></div>`;
    })
    .join("");
  return block(
    report,
    "temas",
    "Temas con más tráfico orgánico",
    "Las búsquedas se agrupan por tema para identificar dónde está la autoridad del sitio. La barra indica qué parte del tema está en posiciones 4 a 20, la más fácil de subir.",
    `<div class="topics">${cards}</div>`,
  );
}

// -------------------------------------------------------- opportunities

function opportunitiesBlock(report: ReportFull): string {
  const rows = [...report.snapshot.opportunities].sort(
    (a, b) => b.potentialClicks - a.potentialClicks,
  );
  if (rows.length === 0) return "";
  const ideas = new Map(
    report.notes.opportunityIdeas.map((item) => [item.query, item] as const),
  );
  const list = rows
    .slice(0, 8)
    .map((row, index) => {
      const idea = ideas.get(row.query);
      const actions = idea
        ? idea.actions.filter((action) => action.trim())
        : [];
      const ai = idea
        ? `<div class="oai"><b>Análisis y acciones</b><p>${esc(idea.analysis)}</p>${actions.length ? `<ul>${actions.map((action) => `<li>${esc(action)}</li>`).join("")}</ul>` : ""}</div>`
        : "";
      return `<div class="opp"><div class="oh"><div class="rk">${index + 1}</div><div><div class="q">${queryLink(row.query)}</div><div class="m">${row.kind === "push" ? "A un paso del top 3" : "Se muestra mucho y se clica poco"} · posición ${one.format(row.position)} · ${num(row.impressions)} impresiones${row.page ? ` · ${pageLink(row.page)}` : ""}</div></div><div class="g">+${num(row.potentialClicks)}<small>clics posibles</small></div></div>${ai}</div>`;
    })
    .join("");
  const contentIdeas = report.notes.contentIdeas.filter((item) =>
    item.title.trim(),
  );
  const content = contentIdeas.length
    ? `<div class="ideas">${contentIdeas
        .map(
          (item) =>
            `<div class="idea"><b>${esc(item.title)}</b><p>${esc(item.reason)}</p></div>`,
        )
        .join("")}</div>`
    : "";
  const total = rows.reduce((sum, row) => sum + row.potentialClicks, 0);
  return block(
    report,
    "oportunidades",
    `Oportunidades de crecimiento: unas ${num(total)} visitas más al alcance`,
    "Búsquedas en las que la web ya aparece y que, con una mejora concreta de título, contenido o enlaces, pueden traducirse en más clics. Ordenadas por la ganancia estimada.",
    `<div class="sheet">${list}${content}</div>`,
  );
}

function titlesBlock(report: ReportFull): string {
  const items = report.notes.titleIdeas.filter(
    (item) => item.options.length > 0,
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
      const path = item.url ? pathOf(item.url) : "";
      const options = item.options
        .map(
          (option) =>
            `<div class="serp"><div class="su">${esc(host)}${esc(path)}</div><div class="st2">${esc(option.title)}</div><div class="sd">${esc(option.description)}</div></div>`,
        )
        .join("");
      return `<article class="tic"><div class="tq2">${queryLink(item.query)}</div>${item.current ? `<div class="cur">Título actual: ${esc(item.current)}${item.url ? ` · ${pageLink(item.url)}` : ""}</div>` : ""}${options}</article>`;
    })
    .join("");
  return block(
    report,
    "titulos",
    "Propuestas de títulos y descripciones",
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

/** A score out of 100 with a small bar; sorts by the number. */
function scoreCell(score: number | null): Cell {
  if (score === null) return { h: '<span class="sn">—</span>', v: null };
  return {
    h: `<div class="scv"><b class="${scoreTone(score)}">${Math.round(score)}</b><div class="sb"><i style="--w:${Math.max(2, score).toFixed(0)}%"></i></div></div>`,
    v: score,
  };
}

const mean = (values: (number | null)[]): number | null => {
  const real = values.filter((value): value is number => value !== null);
  return real.length === 0
    ? null
    : real.reduce((sum, value) => sum + value, 0) / real.length;
};

/** Microaudit on one example page of each page type: how every template of
 *  the site scores, what fails in several of them and what to fix first. */
function auditsBlock(report: ReportFull): string {
  const audits: AuditPage[] = report.snapshot.audits ?? [];
  if (audits.length === 0) return "";
  const types = [...new Set(audits.map((audit) => audit.type))];
  const categories = new Map<number, string>();
  for (const audit of audits) {
    for (const category of audit.categories) {
      categories.set(category.id, category.name);
    }
  }
  const byType = (type: string) =>
    audits.filter((audit) => audit.type === type);
  const matrix = dataTable(
    [
      { label: "Categoría" },
      ...types.map((type) => ({ label: type, num: true })),
    ],
    [
      [
        { h: "<b>Nota global</b>", v: "" },
        ...types.map((type) =>
          scoreCell(mean(byType(type).map((a) => a.score))),
        ),
      ],
      ...[...categories.entries()]
        .sort((a, b) => a[0] - b[0])
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
  );

  type Agg = {
    kind: "fail" | "warn";
    title: string;
    category: string;
    points: number;
    detail: string;
    pages: Set<string>;
  };
  const issues = new Map<string, Agg>();
  for (const audit of audits) {
    for (const issue of audit.issues) {
      const found = issues.get(issue.title);
      if (found) {
        found.pages.add(audit.url);
        found.points = Math.max(found.points, issue.points ?? 0);
        if (issue.kind === "fail") found.kind = "fail";
      } else {
        issues.set(issue.title, {
          kind: issue.kind,
          title: issue.title,
          category: issue.category,
          points: issue.points ?? 0,
          detail: issue.detail,
          pages: new Set([audit.url]),
        });
      }
    }
  }
  const ranked = [...issues.values()].sort(
    (a, b) =>
      Number(b.kind === "fail") - Number(a.kind === "fail") ||
      b.pages.size - a.pages.size ||
      b.points - a.points,
  );
  const fixes = dataTable(
    [
      { label: "Qué corregir" },
      { label: "Categoría" },
      { label: "Páginas", num: true },
      { label: "Impacto", num: true },
      { label: "Prioridad" },
    ],
    ranked.slice(0, 14).map((item) => [
      {
        h: `<b>${esc(item.title)}</b><small>${esc(item.detail)}</small>`,
        v: item.title,
        cls: "pg",
      },
      { h: esc(item.category), v: item.category },
      {
        h: `${item.pages.size} de ${audits.length}`,
        v: item.pages.size,
      },
      {
        h: item.points > 0 ? `+${one.format(item.points)} pts` : "—",
        v: item.points,
      },
      {
        h:
          item.kind === "fail"
            ? '<span class="dl down">A corregir</span>'
            : '<span class="dl flat">A mejorar</span>',
        v: item.kind === "fail" ? 0 : 1,
      },
    ]),
  );

  const cards = audits
    .map((audit) => {
      const top = audit.issues.slice(0, 3);
      return `<article class="acard"><div class="at"><span class="atype">${esc(audit.type)}</span><b class="asc ${scoreTone(audit.score)}">${audit.score === null ? "—" : Math.round(audit.score)}</b></div><div class="au">${pageLink(audit.url)}</div>${audit.rating ? `<div class="ar">${esc(audit.rating)}</div>` : ""}<ul class="ai">${top
        .map(
          (issue) =>
            `<li><span class="k ${issue.kind}">${issue.kind === "fail" ? "Corregir" : "Mejorar"}</span>${esc(issue.title)}<small>${esc(issue.category)}${issue.points ? ` · +${one.format(issue.points)} pts` : ""}</small></li>`,
        )
        .join("")}</ul></article>`;
    })
    .join("");

  const scores = audits.map((audit) => audit.score);
  const average = mean(scores);
  const fails = ranked.filter((item) => item.kind === "fail").length;
  const warns = ranked.length - fails;
  const summary = chips([
    {
      value: average === null ? "—" : String(Math.round(average)),
      label: "nota media sobre 100",
    },
    { value: num(audits.length), label: "páginas auditadas" },
    { value: num(fails), label: "problemas a corregir" },
    { value: num(warns), label: "aspectos a mejorar" },
  ]);
  return block(
    report,
    "auditoria",
    "Auditoría técnica de las páginas tipo",
    `Microaudit ha revisado ${num(audits.length)} ${audits.length === 1 ? "página" : "páginas"} de ejemplo (${types.map(esc).join(", ")}) con más de 90 comprobaciones de SEO y de SEO para asistentes de IA. Una categoría con algún fallo queda limitada a 35 sobre 100 hasta corregirlo.`,
    `${summary}<div class="sheet"><h3>Nota por categoría y tipo de página</h3>${matrix}</div><div class="sheet" style="margin-top:18px"><h3>Qué corregir primero</h3>${fixes}</div><div class="acards">${cards}</div>`,
  );
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

/** Without AI text the roadmap is built from the data: the few moves that
 *  can change the figures, each as "action — why". */
function suggestedSteps(report: ReportFull): string[] {
  const { snapshot } = report;
  const steps: string[] = [];
  const top = [...snapshot.opportunities]
    .sort((a, b) => b.potentialClicks - a.potentialClicks)
    .slice(0, 5);
  const gain = top.reduce((sum, item) => sum + item.potentialClicks, 0);
  if (gain >= 20) {
    steps.push(
      `Ejecutar las ${top.length} mejoras de mayor retorno de la pestaña Oportunidades — suman unas ${num(gain)} visitas más al periodo con cambios de título, contenido y enlaces internos`,
    );
  }
  const loser = snapshot.pageLosers[0];
  if (loser && loser.clicksDelta <= -30) {
    steps.push(
      `Recuperar las páginas que han perdido tráfico, empezando por ${pathOf(loser.key)} — concentra la mayor caída (${signedNum(loser.clicksDelta)} clics) y ya tiene historial en Google`,
    );
  }
  const topic = [...snapshot.topics].sort(
    (a, b) => b.nearTopShare * b.impressions - a.nearTopShare * a.impressions,
  )[0];
  if (topic && topic.nearTopShare >= 0.4) {
    steps.push(
      `Reforzar el tema «${topic.label}» con contenido y enlaces internos — el ${Math.round(topic.nearTopShare * 100)} % de sus impresiones está en posiciones 4 a 20, la zona más fácil de subir al top 3`,
    );
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
    steps.push(
      `Corregir en las plantillas del sitio «${worst[0]}» — falla en ${worst[1].size} de las ${audits.length} páginas tipo auditadas, así que un solo cambio mejora muchas páginas a la vez`,
    );
  }
  if (steps.length === 0) {
    steps.push(
      "Mantener el ritmo de publicación y de mejora — la web se mueve dentro de lo esperado y conviene medir el efecto en el próximo informe",
    );
  }
  return steps.slice(0, 4);
}

/** "Action — why" split into a bold action and its reason. */
function stepHtml(step: string): string {
  const at = step.indexOf(" — ");
  return at > 0
    ? `<li><b>${esc(step.slice(0, at))}</b><span>${esc(step.slice(at + 3))}</span></li>`
    : `<li><b>${esc(step)}</b></li>`;
}

function closing(report: ReportFull): string {
  const typed = report.notes.nextSteps
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const steps = typed.length > 0 ? typed : suggestedSteps(report);
  const note = report.notes.sectionNotes.proximos?.trim();
  return `<footer class="end" id="proximos"><div class="wrap">
<div class="kick">Próximos pasos</div><h2>Hoja de ruta para el próximo periodo</h2>
<ol class="steps">${steps.map(stepHtml).join("")}</ol>
${note ? `<div class="note" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);color:#f6f6f6"><b style="color:#ffb3c0">Nota de Carlos</b>${esc(note)}</div>` : ""}
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

export function renderReportDocument(
  report: ReportFull,
  mode: RenderMode,
): string {
  const { snapshot } = report;
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
        show("semana", () => weekBlock(report)),
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
      html: lead("busquedas") + show("consultas", () => searchesBlock(report)),
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
        show("auditoria", () => auditsBlock(report)) +
        columns(
          show("tecnico", () => healthBlock(report)),
          show("discover", () => discoverBlock(report)),
        ),
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

  const tabButtons = panels
    .map(
      (panel, index) =>
        `<button type="button" role="tab" data-tab="${panel.id}" class="${index === 0 ? "on" : ""}">${esc(panel.label)}</button>`,
    )
    .join("");
  const panelHtml = panels
    .map(
      (panel, index) =>
        `<div class="panel${index === 0 ? " on" : ""}" data-panel="${panel.id}" role="tabpanel"><div class="ptitle">${esc(panel.label)}</div>${panel.html}</div>`,
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
<div class="pgwrap"><div class="pghead"></div><div class="pgbody">
${executiveSummary(report)}
<div class="tabsbar" id="tabs"><div class="wrap"><div class="tabs2" role="tablist">${tabButtons}</div></div></div>
<main class="wrap panels">${panelHtml}</main>
</div><div class="pgfoot"></div></div>
${hidden.has("proximos") ? "" : closing(report)}
<button class="totop" id="totop" type="button" aria-label="Volver arriba"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
<script type="application/json" id="report-data">${jsonForScript(data)}</script>
<script>${REPORT_SCRIPT}</script>
</body></html>`;
}
