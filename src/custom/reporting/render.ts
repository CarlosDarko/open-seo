// Turns a stored client report into one self-contained web page in Carlos
// Ortega's brand. The page opens with the cover and an executive summary and
// then works like a small app: tabs (traffic, positioning, searches, pages,
// topics, opportunities, technical), sub-tabs and columns keep every table
// and chart one click away instead of in an endless scroll. Every URL opens in
// a new tab and every figure that is mentioned can be unfolded into the list
// behind it. Everything that comes from data is escaped here. The text never
// addresses the reader as "tú": the subject is the website.
import { integer } from "@/custom/radar/format";
import {
  KIND_COLOR,
  KIND_NAME,
  KIND_SHORT,
} from "@/custom/radar/googleUpdates";
import {
  LOGO_HORIZONTAL_LIGHT,
  LOGO_MARK_LIGHT,
} from "@/custom/reporting/brandAssets";
import {
  buildInsights,
  contributions,
  pathOf,
  updateImpacts,
  weekdayStats,
  type Insight,
} from "@/custom/reporting/insights";
import { buildVerdict, percentChange } from "@/custom/reporting/narrative";
import { REPORT_SCRIPT } from "@/custom/reporting/renderScript";
import { REPORT_CSS } from "@/custom/reporting/renderStyles";
import {
  type BandMove,
  type ChangeLine,
  type QueryRow,
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
const shortDate = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Madrid",
});

const num = (value: number) => integer.format(Math.round(value));
const pos = (value: number | null) =>
  value === null ? "—" : one.format(value);
const day = (iso: string) => dateFormat.format(new Date(`${iso}T12:00:00Z`));
const dayShort = (iso: string) =>
  shortDate.format(new Date(`${iso}T12:00:00Z`));
const signedNum = (value: number) =>
  `${value >= 0 ? "+" : "−"}${num(Math.abs(value))}`;

/** The JSON that travels in a script tag: "<" is written as a unicode escape
 *  so the data can never close the tag. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", `${BACKSLASH}u003c`);
}

/** The brand mark as a favicon (an inline SVG, so no extra request). */
const FAVICON = `data:image/svg+xml,${encodeURIComponent(LOGO_MARK_LIGHT)}`;

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

/** A key that is either a page URL or a search. */
const keyLink = (key: string) => (isWeb(key) ? pageLink(key) : queryLink(key));

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

function noteOf(report: ReportFull, id: SectionId): string {
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

/** Tabs inside a tab, so several lists share one place. */
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
        `<div class="sp${index === 0 ? " on" : ""}" data-sp="${group}-${item.id}">${item.html}</div>`,
    )
    .join("");
  return `<div class="stg" data-group="${group}"><div class="subtabs" role="tablist">${buttons}</div>${panels}</div>`;
}

// ---------------------------------------------------------------- lists

function emptyNote(text: string): string {
  return `<p class="empty">${esc(text)}</p>`;
}

/** Searches with their figures; scrolls inside its own box. */
function queryTable(rows: QueryRow[], mode: "now" | "lost"): string {
  if (rows.length === 0) return emptyNote("No hay búsquedas en este grupo.");
  const head =
    mode === "lost"
      ? '<th>Búsqueda</th><th class="r">Posición antes</th><th class="r">Clics antes</th><th class="r">Impresiones antes</th>'
      : '<th>Búsqueda</th><th class="r">Posición</th><th class="r">Clics</th><th class="r">Impresiones</th>';
  const body = rows
    .map((row) =>
      mode === "lost"
        ? `<tr><td>${queryLink(row.query)}</td><td class="r">${pos(row.prevPosition)}</td><td class="r">${num(row.prevClicks)}</td><td class="r">${num(row.impressions)}</td></tr>`
        : `<tr><td>${queryLink(row.query)}</td><td class="r">${pos(row.position)}</td><td class="r">${num(row.clicks)}</td><td class="r">${num(row.impressions)}</td></tr>`,
    )
    .join("");
  return `<div class="tbox"><table class="qt sm"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** Searches that entered or left a band. */
function moveTable(rows: BandMove[], entering: boolean): string {
  if (rows.length === 0) {
    return emptyNote(
      entering ? "Ninguna búsqueda ha entrado." : "Ninguna búsqueda ha salido.",
    );
  }
  const body = rows
    .map(
      (row) =>
        `<tr><td>${queryLink(row.query)}</td><td class="r">${posMove(row.prevPosition, row.position)}</td><td class="r">${num(row.impressions)}</td></tr>`,
    )
    .join("");
  return `<div class="tbox"><table class="qt sm"><thead><tr><th>Búsqueda</th><th class="r">Posición</th><th class="r">Impresiones</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

/** Pages or searches that gained or lost clicks, with the figures. */
function changeTable(rows: ChangeLine[]): string {
  if (rows.length === 0) return emptyNote("Sin variaciones destacables.");
  const body = rows
    .map(
      (row) =>
        `<tr><td>${keyLink(row.key)}${
          row.queries && row.queries.length > 0
            ? `<div class="why">${row.queries
                .slice(0, 2)
                .map(
                  (item) =>
                    `<span>${queryLink(item.query)} (${signedNum(item.clicksDelta)})</span>`,
                )
                .join("")}</div>`
            : ""
        }</td><td class="r">${posMove(row.prevPosition, row.position)}</td><td class="r">${num(row.prevClicks)} → ${num(row.clicks)}</td><td class="r"><b class="${row.clicksDelta >= 0 ? "upc" : "dnc"}">${signedNum(row.clicksDelta)}</b></td></tr>`,
    )
    .join("");
  return `<div class="tbox"><table class="qt sm"><thead><tr><th>${isWeb(rows[0].key) ? "Página" : "Búsqueda"}</th><th class="r">Posición</th><th class="r">Clics</th><th class="r">Variación</th></tr></thead><tbody>${body}</tbody></table></div>`;
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
  const heading = report.title.replace(/ — .*$/, "").trim() || "Informe SEO";
  const compare = snapshot.period.comparable
    ? ` · comparado con ${snapshot.period.compare === "year" ? "el mismo periodo del año anterior" : "el periodo anterior"}`
    : "";
  return `<header class="hero">
${areaPath(snapshot.daily.map((point) => point.clicks))}
<div class="wrap">
<div class="logo rv">${LOGO_HORIZONTAL_LIGHT}</div>
<span class="eyebrow rv">Informe de rendimiento SEO</span>
<h1 class="rv d1">${esc(heading)} de <em>${esc(name)}</em></h1>
<p class="sub rv d2">${esc(host)} · del ${day(snapshot.range.startDate)} al ${day(snapshot.range.endDate)}${compare}${snapshot.scope === "sin marca" ? " · sin contar las búsquedas de marca" : ""}</p>
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

/** Which tab explains each finding. */
const INSIGHT_TAB: Record<string, string> = {
  traffic: "trafico",
  update: "trafico",
  source: "trafico",
  weekday: "trafico",
  top3: "posiciones",
  queries: "busquedas",
  winner: "paginas",
  loser: "paginas",
  concentration: "paginas",
  brand: "temas",
  mobile: "temas",
  topics: "temas",
  opportunities: "oportunidades",
  health: "tecnico",
  discover: "tecnico",
};

function executiveSummary(report: ReportFull, tabIds: Set<string>): string {
  const { snapshot } = report;
  const verdict = buildVerdict(snapshot);
  const keys = buildInsights(snapshot)
    .slice(0, 5)
    .map((item) => {
      const tab = INSIGHT_TAB[item.id];
      const go =
        tab && tabIds.has(tab)
          ? `<a class="go" href="#tabs" data-go="${tab}">Ver detalle →</a>`
          : "";
      return `<li><span class="tone ${item.tone}">${TONE_LABEL[item.tone]}</span><span class="kt">${esc(item.title)}</span>${go}</li>`;
    })
    .join("");
  const message = report.notes.message.trim();
  const side = message
    ? `<aside class="exr msgc"><div class="av">${LOGO_MARK_LIGHT}</div><p>${esc(message)}</p><small>Carlos Ortega · consultor SEO</small></aside>`
    : "";
  return `<section class="s wrap" id="resumen"><div class="ex${side ? "" : " solo"}">
<div class="exl rv">
<div class="kick">Resumen ejecutivo</div>
<p class="exh">${esc(verdict.headline)}</p>
<p class="exp"><b>En positivo</b>${esc(verdict.lining)}</p>
<ul class="keys">${keys}</ul>
</div>${side}</div></section>`;
}

// ------------------------------------------------------------- insights

function insightCard(item: Insight): string {
  const stats = item.stats
    .map((stat) => `<span>${esc(stat.label)}<b>${esc(stat.value)}</b></span>`)
    .join("");
  const upside = item.upside
    ? `<div class="up2"><b>En positivo</b>${esc(item.upside)}</div>`
    : "";
  return `<article class="fd"><div class="top2"><span>${esc(item.topic)}</span><span class="tone ${item.tone}">${TONE_LABEL[item.tone]}</span></div><div class="t">${esc(item.title)}</div><p class="b">${esc(item.body)}</p><div class="st">${stats}</div>${upside}</article>`;
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

function trendBlock(report: ReportFull): string {
  const { snapshot } = report;
  const impacts = updateImpacts(snapshot);
  const legend = snapshot.updates
    .map(
      (update) =>
        `<span><i class="sq" style="background:${KIND_COLOR[update.kind]}"></i>${esc(update.label)}</span>`,
    )
    .join("");
  const cards = impacts
    .map((item) => {
      const color = KIND_COLOR[item.update.kind];
      const cell = (label: string, value: number | null) =>
        `<div><small>${label}</small><b>${value === null ? "—" : num(value)}</b></div>`;
      return `<div class="ucard" style="--uc:${color}"><div class="un"><i></i>${esc(item.update.label)}</div><div class="ud">${esc(KIND_NAME[item.update.kind])} · ${dayShort(item.update.begin)} → ${item.update.end ? dayShort(item.update.end) : "en curso"} · clics por día</div><div class="trio">${cell("Antes", item.before)}${cell("Durante", item.during)}${cell("Después", item.after)}</div><p>${esc(item.verdict)}</p></div>`;
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

function divergeBlock(
  title: string,
  rows: { label: string; delta: number }[],
): string {
  const max = Math.max(...rows.map((row) => Math.abs(row.delta)), 1);
  return `<div><h3>${esc(title)}</h3><div class="diverge">${rows
    .map((row) => {
      const half = (Math.abs(row.delta) / max) * 50;
      const positive = row.delta >= 0;
      const side = positive ? `left:50%` : `right:50%`;
      const inside = half > 30;
      const valueSide = inside
        ? positive
          ? `left:calc(50% + ${half.toFixed(1)}% - 8px);transform:translate(-100%,-50%);color:#fff`
          : `right:calc(50% + ${half.toFixed(1)}% - 8px);transform:translate(100%,-50%);color:#fff`
        : positive
          ? `left:calc(50% + ${half.toFixed(1)}% + 6px)`
          : `right:calc(50% + ${half.toFixed(1)}% + 6px)`;
      return `<div class="dv"><span class="lab" title="${esc(row.label)}">${esc(row.label)}</span><div class="track"><div class="fill ${positive ? "upb" : "dnb"}" style="${side};--w:${half.toFixed(1)}%"></div><span class="val" style="${valueSide}">${signedNum(row.delta)}</span></div></div>`;
    })
    .join("")}</div></div>`;
}

function originBlock(report: ReportFull): string {
  const { snapshot } = report;
  if (!snapshot.period.comparable) return "";
  const groups = contributions(snapshot);
  if (groups.length === 0) return "";
  const net = snapshot.totals.clicks - snapshot.prevTotals.clicks;
  return block(
    report,
    "origen",
    net >= 0
      ? `Origen de los ${signedNum(net)} clics`
      : "Origen de la variación de clics",
    "Cuánto suma o resta cada tipo de página, dispositivo y tipo de búsqueda al total.",
    `<div class="sheet"><div class="grid g3">${groups.map((group) => divergeBlock(group.title, group.rows)).join("")}</div></div>`,
  );
}

function weekBlock(report: ReportFull): string {
  const { daily } = report.snapshot;
  if (daily.length < 21) return "";
  const stats = weekdayStats(daily);
  const max = Math.max(...stats.map((item) => item.average), 1);
  const best = stats.reduce((a, b) => (b.average > a.average ? b : a));
  const rows = stats
    .map(
      (item) =>
        `<div class="wkr${item === best ? " best" : ""}"><span class="wl">${item.label}</span><div class="wb"><i style="--w:${Math.max(3, (item.average / max) * 100).toFixed(0)}%"></i></div><b>${num(item.average)}</b></div>`,
    )
    .join("");
  return block(
    report,
    "semana",
    "Distribución semanal del tráfico",
    "Clics medios por día de la semana. Permite decidir cuándo publicar y actualizar contenido.",
    `<div class="sheet"><div class="wk">${rows}</div></div>`,
  );
}

// ------------------------------------------------------------ positions

const BAND_COLORS = ["#f11c41", "#1a1a1a", "#7a7a84", "#c4c4cb"];

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
  const stacked = snapshot.bands
    .filter((band) => band.clicks > 0)
    .map((band, index) => {
      const share = totalClicks > 0 ? (band.clicks / totalClicks) * 100 : 0;
      return `<div style="width:${share.toFixed(2)}%;background:${BAND_COLORS[index % BAND_COLORS.length]}" title="${esc(band.label)}: ${num(band.clicks)} clics">${share >= 12 ? `${Math.round(share)} %` : ""}</div>`;
    })
    .join("");
  const legend = snapshot.bands
    .map(
      (band, index) =>
        `<span><i style="background:${BAND_COLORS[index % BAND_COLORS.length]}"></i>${esc(band.label)} · ${num(band.clicks)} clics</span>`,
    )
    .join("");
  const cards = snapshot.bands
    .map((band) => {
      const share = totalClicks > 0 ? (band.clicks / totalClicks) * 100 : 0;
      return `<div class="bcard"><div class="bk">${esc(band.label)}</div><div class="bn">${num(band.queries)}</div><div class="bs">búsquedas</div>${comparable ? `<div class="bd">${countDelta(band.queries, band.prevQueries)} frente al periodo anterior</div>` : ""}<div class="pair"><div class="now"><i style="--w:${((band.queries / maxQueries) * 100).toFixed(0)}%"></i></div>${comparable ? `<div class="old"><i style="--w:${((band.prevQueries / maxQueries) * 100).toFixed(0)}%"></i></div>` : ""}</div><div class="bm"><b>${num(band.clicks)}</b> clics · <b>${Math.round(share)} %</b> del total</div></div>`;
    })
    .join("");
  const lists = subTabs(
    "band",
    snapshot.bands.map((band, index) => ({
      id: `b${index}`,
      label: band.label,
      count: band.queries,
      html: queryTable((snapshot.queriesByBand ?? [])[index] ?? [], "now"),
    })),
  );
  const moves = comparable
    ? `<div class="grid g2" style="margin-top:18px"><div class="sheet"><h3>Entran en el top 3 (${num(snapshot.bands[0].enteredCount)})</h3>${moveTable(snapshot.bands[0].entered, true)}</div><div class="sheet"><h3>Salen del top 3 (${num(snapshot.bands[0].leftCount)})</h3>${moveTable(snapshot.bands[0].left, false)}</div></div>`
    : "";
  return block(
    report,
    "posiciones",
    "Distribución de las búsquedas por posición en Google",
    `Cuántas búsquedas tiene la web en cada tramo de posiciones y cuántos clics aporta cada uno. En las tarjetas, la barra roja indica el periodo actual${comparable ? " y la gris el anterior" : ""}. Debajo se pueden consultar las búsquedas de cada tramo.`,
    `<div class="sheet"><h3>Reparto de los clics por tramo de posición</h3><div class="stk">${stacked}</div><div class="stl">${legend}</div></div><div class="bands">${cards}</div><div class="sheet" style="margin-top:18px"><h3>Búsquedas de cada tramo (las 25 con más clics)</h3>${lists}</div>${moves}`,
  );
}

// ------------------------------------------------------------- searches

function searchesBlock(report: ReportFull): string {
  const { snapshot } = report;
  const comparable = snapshot.period.comparable;
  const top = snapshot.topQueries.map<QueryRow>((item) => ({
    query: item.query,
    clicks: item.clicks,
    impressions: item.impressions,
    position: item.position,
    prevClicks: 0,
    prevPosition: null,
  }));
  const items = [
    {
      id: "top",
      label: "Más tráfico",
      count: top.length,
      html: top.length > 0 ? queryTable(top, "now") : "",
    },
    ...(comparable
      ? [
          {
            id: "new",
            label: "Nuevas",
            count: snapshot.newQueries,
            html:
              (snapshot.newQueriesList ?? []).length > 0
                ? queryTable(snapshot.newQueriesList, "now")
                : "",
          },
          {
            id: "lost",
            label: "Perdidas",
            count: snapshot.lostQueries,
            html:
              (snapshot.lostQueriesList ?? []).length > 0
                ? queryTable(snapshot.lostQueriesList, "lost")
                : "",
          },
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
        ]
      : []),
  ];
  const tabs = subTabs("q", items);
  if (!tabs) return "";
  return block(
    report,
    "consultas",
    "Búsquedas que mueven el tráfico",
    "Las búsquedas de marca se excluyen. «Nuevas» son búsquedas que antes no mostraban la web y «perdidas» las que ya no la muestran. Cada búsqueda abre sus resultados en Google.",
    `<div class="sheet">${tabs}</div>`,
  );
}

// ---------------------------------------------------------------- pages

function pagesBlock(report: ReportFull): string {
  const { snapshot } = report;
  const comparable = snapshot.period.comparable;
  const moves = comparable
    ? `<div class="grid g2"><div class="sheet"><h3>Páginas que suben</h3>${changeTable(snapshot.pageWinners)}</div><div class="sheet"><h3>Páginas que bajan</h3>${changeTable(snapshot.pageLosers)}</div></div>`
    : "";
  const rows = snapshot.topPages
    .map(
      (page) =>
        `<tr><td>${pageLink(page.url)}</td><td class="r">${num(page.clicks)}</td>${comparable ? `<td class="r">${num(page.prevClicks)}</td><td class="r">${pctDelta(page.clicks, page.prevClicks) || "—"}</td>` : ""}</tr>`,
    )
    .join("");
  const top =
    snapshot.topPages.length > 0
      ? `<div class="sheet" style="margin-top:18px"><h3>Páginas con más clics</h3><div class="tbox"><table class="qt sm"><thead><tr><th>Página</th><th class="r">Clics</th>${comparable ? '<th class="r">Antes</th><th class="r">Variación</th>' : ""}</tr></thead><tbody>${rows}</tbody></table></div></div>`
      : "";
  if (!moves && !top) return "";
  return block(
    report,
    "origen",
    "Páginas que explican el movimiento",
    "Las páginas con mayor variación de clics, con las búsquedas que más pesan en cada una, y las páginas que más tráfico reciben. Cada página se abre en una pestaña nueva.",
    moves + top,
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

function audienceCard(
  title: string,
  lines: SegmentLine[],
  comparable: boolean,
): string {
  if (lines.length === 0) return "";
  const rows = lines
    .slice(0, 6)
    .map((line, index) => {
      const delta = comparable ? pctDelta(line.clicks, line.prevClicks) : "";
      return `<div class="arow${index === 0 ? " first" : ""}"><span class="an" title="${esc(line.label)}">${esc(line.label)}</span><span class="ap">${one.format(line.share * 100)} %</span><span class="dl-slot">${delta}</span><div class="ab"><i style="--w:${Math.max(2, line.share * 100).toFixed(1)}%"></i></div></div>`;
    })
    .join("");
  return `<div class="sheet"><h3>${esc(title)}</h3>${rows}</div>`;
}

function audienceBlock(report: ReportFull): string {
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
  const blocks = [
    audienceCard("Dispositivo", snapshot.segments.device, comparable),
    audienceCard("Tipo de página", snapshot.segments.pageType, comparable),
    audienceCard("Marca y resto de búsquedas", brandLines, comparable),
    audienceCard("Intención de búsqueda", snapshot.segments.intent, comparable),
  ].join("");
  if (!blocks) return "";
  return block(
    report,
    "reparto",
    "Perfil del tráfico orgánico",
    `Porcentaje de los clics que corresponde a cada grupo${comparable ? " y su variación frente al periodo anterior" : ""}.`,
    `<div class="aud">${blocks}</div>`,
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
    "Estado técnico: cobertura del sitemap en Google",
    "Se compara el sitemap con las páginas que Google ha mostrado en los últimos 3 meses.",
    `<div class="sheet"><div class="hlt"><div class="ring"><svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="15.9155" stroke="#ececee"/><circle cx="21" cy="21" r="15.9155" stroke="#1a1a1a" stroke-linecap="round" stroke-dasharray="${(covered * 100).toFixed(1)} ${(100 - covered * 100).toFixed(1)}"/></svg><div class="ct"><b>${Math.round(covered * 100)} %</b><small>con visibilidad</small></div></div><div class="hs">${tile(health.inSitemap, "páginas en el sitemap")}${tile(health.pagesWithImpressions, "páginas con impresiones")}${tile(health.unseen, "sin impresiones todavía")}${tile(health.notInSitemap, "con impresiones fuera del sitemap")}${tile(health.sitemapErrors, "errores de sitemap")}</div></div></div>`,
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

function suggestedSteps(report: ReportFull): string[] {
  const { snapshot } = report;
  const steps: string[] = [];
  const loser = snapshot.pageLosers[0];
  if (loser && loser.clicksDelta <= -10) {
    steps.push(
      `Revisar y reforzar ${pathOf(loser.key)}, la página con más margen de recuperación.`,
    );
  }
  const best = [...snapshot.opportunities].sort(
    (a, b) => b.potentialClicks - a.potentialClicks,
  )[0];
  if (best) {
    steps.push(
      `Mejorar el título y el contenido para «${best.query}» (+${num(best.potentialClicks)} clics posibles).`,
    );
  }
  const topic = snapshot.topics[0];
  if (topic) {
    steps.push(
      `Publicar más contenido sobre «${topic.label}», el tema con más tirón.`,
    );
  }
  if (steps.length === 0) {
    steps.push(
      "Mantener el ritmo de publicación y revisar la evolución en el próximo periodo.",
    );
  }
  return steps.slice(0, 4);
}

function closing(report: ReportFull): string {
  const typed = report.notes.nextSteps
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const steps = typed.length > 0 ? typed : suggestedSteps(report);
  const note = report.notes.sectionNotes.proximos?.trim();
  return `<footer class="end" id="proximos"><div class="wrap">
<div class="endgrid"><div><div class="kick">Próximos pasos</div><h2>Hoja de ruta para el próximo periodo</h2>
<ol class="steps">${steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>
${note ? `<div class="note" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);color:#f6f6f6"><b style="color:#ffb3c0">Nota de Carlos</b>${esc(note)}</div>` : ""}</div>
<div class="endcta"><a class="big-cta" href="https://carlosortega.page" target="_blank" rel="noopener noreferrer">Contactar con Carlos Ortega</a></div></div>
<div class="foot"><span class="fm">${LOGO_MARK_LIGHT}</span><span>Informe generado el ${day(report.snapshot.generatedAt.slice(0, 10))} con datos de Google Search Console · carlosortega.page</span></div>
</div></footer>`;
}

// ----------------------------------------------------------------- page

export type RenderMode = "public" | "preview";

type Panel = { id: string; label: string; html: string; count?: number };

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
        show("evolucion", () => trendBlock(report)) +
        columns(
          show("origen", () => originBlock(report)),
          show("semana", () => weekBlock(report)),
        ),
    },
    {
      id: "posiciones",
      label: "Posicionamiento",
      html: show("posiciones", () => positionsBlock(report)),
    },
    {
      id: "busquedas",
      label: "Búsquedas",
      html: show("consultas", () => searchesBlock(report)),
    },
    {
      id: "paginas",
      label: "Páginas",
      html:
        show("origen", () => pagesBlock(report)) +
        show("diagnostico", () => diagnosisBlock(report)),
    },
    {
      id: "temas",
      label: "Temas y audiencia",
      html:
        show("temas", () => topicsBlock(report)) +
        show("reparto", () => audienceBlock(report)),
    },
    {
      id: "oportunidades",
      label: "Oportunidades",
      html:
        show("oportunidades", () => opportunitiesBlock(report)) +
        show("titulos", () => titlesBlock(report)),
    },
    {
      id: "tecnico",
      label: "Técnico",
      html: columns(
        show("tecnico", () => healthBlock(report)),
        show("discover", () => discoverBlock(report)),
      ),
    },
  ]
    .filter((panel) => panel.html.trim() !== "")
    .sort(
      (a, b) =>
        [
          "trafico",
          "posiciones",
          "busquedas",
          "paginas",
          "temas",
          "oportunidades",
          "tecnico",
          "analisis",
        ].indexOf(a.id) -
        [
          "trafico",
          "posiciones",
          "busquedas",
          "paginas",
          "temas",
          "oportunidades",
          "tecnico",
          "analisis",
        ].indexOf(b.id),
    );

  const tabIds = new Set(panels.map((panel) => panel.id));
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
  const title = `${report.title}${report.clientName ? ` · ${report.clientName}` : ""}`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#1a1a1a">
<title>${esc(title)}</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON}">
<script>document.documentElement.className="js";</script>
<style>${REPORT_CSS}</style></head>
<body>
<div class="top" id="top"><div class="wrap"><span class="iso">${LOGO_MARK_LIGHT}</span><span class="ttl">${esc(report.clientName?.trim() || host)} · Informe SEO</span><button class="cta" type="button" onclick="window.print()">${mode === "preview" ? "Vista previa · " : ""}Imprimir / PDF</button></div></div>
${hero(report, host)}
${executiveSummary(report, tabIds)}
<div class="tabsbar" id="tabs"><div class="wrap"><div class="tabs2" role="tablist">${tabButtons}</div></div></div>
<main class="wrap panels">${panelHtml}</main>
${hidden.has("proximos") ? "" : closing(report)}
<button class="totop" id="totop" type="button" aria-label="Volver arriba"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
<script type="application/json" id="report-data">${jsonForScript(data)}</script>
<script>${REPORT_SCRIPT}</script>
</body></html>`;
}
