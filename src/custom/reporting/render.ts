// Turns a stored client report into one self-contained web page in Carlos
// Ortega's brand: a dark cover, findings that cross the data, interactive
// charts and a closing call. Everything that comes from data is escaped here.
// Numbers and lists are written on the server (the page reads without
// scripts and prints well); a small script adds the reveals and the chart.
// The text never addresses the reader as "tú": the subject is the website.
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
  highlights,
  pathOf,
  updateImpacts,
  weekdayStats,
  type Insight,
} from "@/custom/reporting/insights";
import { buildVerdict, percentChange } from "@/custom/reporting/narrative";
import { REPORT_SCRIPT } from "@/custom/reporting/renderScript";
import { REPORT_CSS } from "@/custom/reporting/renderStyles";
import {
  REPORT_SECTIONS,
  type ChangeLine,
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

const TONE_LABEL: Record<Insight["tone"], string> = {
  good: "A favor",
  warn: "A vigilar",
  bad: "Atención",
  info: "Informativo",
};

function noteOf(report: ReportFull, id: SectionId): string {
  const text = report.notes.sectionNotes[id]?.trim();
  return text
    ? `<div class="note rv"><b>Nota de Carlos</b>${esc(text)}</div>`
    : "";
}

function section(
  id: SectionId,
  kicker: string,
  title: string,
  lead: string,
  body: string,
  note: string,
): string {
  return `<section class="s wrap" id="${id}">
<div class="kick rv">${esc(kicker)}</div><h2 class="rv">${esc(title)}</h2><p class="lead rv">${esc(lead)}</p>
${body}${note}
</section>`;
}

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
  const verdict = buildVerdict(snapshot);
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
  const facts = highlights(snapshot)
    .map((text) => `<span>${esc(text)}</span>`)
    .join("");
  const name = report.clientName?.trim() || host;
  const heading = report.title.replace(/ — .*$/, "").trim() || "Informe SEO";
  return `<header class="hero">
${areaPath(snapshot.daily.map((point) => point.clicks))}
<div class="wrap">
<div class="logo rv">${LOGO_HORIZONTAL_LIGHT}</div>
<span class="eyebrow rv">Informe de rendimiento SEO · ${dayShort(snapshot.range.startDate)} – ${dayShort(snapshot.range.endDate)}</span>
<h1 class="rv d1">${esc(heading)} de <em>${esc(name)}</em></h1>
<p class="sub rv d2">${esc(verdict.headline)} ${esc(verdict.lining)}</p>
<div class="hl rv d3">${facts}</div>
<div class="kpis rv d3">
${kpi("Clics", totals.clicks, "int", num(totals.clicks), comparable ? pctDelta(totals.clicks, prevTotals.clicks) : "")}
${kpi("Impresiones", totals.impressions, "int", num(totals.impressions), comparable ? pctDelta(totals.impressions, prevTotals.impressions) : "")}
${kpi("CTR", totals.ctr * 100, "pct", `${one.format(totals.ctr * 100)} %`, comparable ? pctDelta(totals.ctr, prevTotals.ctr) : "")}
${kpi("Posición media", totals.position, "dec", one.format(totals.position), positionDelta)}
</div>
</div>
</header>`;
}

function messageSection(report: ReportFull): string {
  const message = report.notes.message.trim();
  if (!message) return "";
  return `<section class="s wrap" id="mensaje"><div class="msg rv"><div class="av">${LOGO_MARK_LIGHT}</div><div><p>${esc(message)}</p><small>Carlos Ortega · consultor SEO</small></div></div></section>`;
}

// ------------------------------------------------------------- insights

function insightCard(item: Insight, index: number): string {
  const stats = item.stats
    .map((stat) => `<span>${esc(stat.label)}<b>${esc(stat.value)}</b></span>`)
    .join("");
  const upside = item.upside
    ? `<div class="up2"><b>En positivo</b>${esc(item.upside)}</div>`
    : "";
  return `<article class="fd${index === 0 ? " big" : ""} rv d${(index % 2) + 1}"><div class="top2"><span>${esc(item.topic)}</span><span class="tone ${item.tone}">${TONE_LABEL[item.tone]}</span></div><div class="t">${esc(item.title)}</div><p class="b">${esc(item.body)}</p><div class="st">${stats}</div>${upside}</article>`;
}

function insightsSection(report: ReportFull): string {
  const items = buildInsights(report.snapshot).slice(0, 9);
  if (items.length === 0) return "";
  return section(
    "hallazgos",
    "Resumen ejecutivo",
    "Conclusiones del periodo",
    "Lectura conjunta de las distintas fuentes de Search Console: qué ha ocurrido, por qué y qué implica para el proyecto.",
    `<div class="ins">${items.map(insightCard).join("")}</div>`,
    noteOf(report, "hallazgos"),
  );
}

// ---------------------------------------------------------------- trend

function trendSection(report: ReportFull): string {
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
      return `<div class="ucard rv" style="--uc:${color}"><div class="un"><i></i>${esc(item.update.label)}</div><div class="ud">${esc(KIND_NAME[item.update.kind])} · ${dayShort(item.update.begin)} → ${item.update.end ? dayShort(item.update.end) : "en curso"} · clics por día</div><div class="trio">${cell("Antes", item.before)}${cell("Durante", item.during)}${cell("Después", item.after)}</div><p>${esc(item.verdict)}</p></div>`;
    })
    .join("");
  const body = `<div class="sheet rv">
<div class="tabs"><button class="on" data-metric="clicks">Clics</button><button data-metric="impressions">Impresiones</button><button data-metric="position">Posición</button></div>
<div class="chartbox"><svg id="chart" role="img" aria-label="Evolución diaria"></svg><div class="tip" id="tip"></div></div>
<div class="legend"><span><i></i>Este periodo</span>${snapshot.period.comparable ? `<span><i class="prev"></i>Periodo anterior</span>` : ""}${legend}</div>
${cards ? `<div class="uimp">${cards}</div>` : ""}
</div>`;
  return section(
    "evolucion",
    "Evolución",
    "Evolución del tráfico y actualizaciones de Google",
    snapshot.updates.length > 0
      ? "Las franjas de color marcan los cambios de algoritmo de Google que coincidieron con el periodo, con su efecto medido sobre los clics diarios."
      : "Evolución diaria de los resultados frente al periodo anterior. Pasar el cursor, o el dedo, por la gráfica muestra el detalle de cada día.",
    body,
    noteOf(report, "evolucion"),
  );
}

// --------------------------------------------------------------- origin

function changeBars(rows: ChangeLine[], up: boolean, withWhy: boolean): string {
  if (rows.length === 0) {
    return `<p class="empty">Sin variaciones destacables en este sentido.</p>`;
  }
  const max = Math.max(...rows.map((row) => Math.abs(row.clicksDelta)), 1);
  return rows
    .map((row) => {
      const width = Math.max(4, (Math.abs(row.clicksDelta) / max) * 100);
      const label = row.key.startsWith("http") ? pathOf(row.key) : row.key;
      const why =
        withWhy && row.queries && row.queries.length > 0
          ? `<div class="why">${row.queries
              .slice(0, 2)
              .map(
                (item) =>
                  `<span>${esc(item.query)} (${signedNum(item.clicksDelta)})</span>`,
              )
              .join("")}</div>`
          : "";
      return `<div class="brow"><span class="n" title="${esc(row.key)}">${esc(label)}</span><span class="d ${up ? "upc" : "dnc"}">${signedNum(row.clicksDelta)}</span><span class="bar"><i class="${up ? "upb" : "dnb"}" style="--w:${width.toFixed(0)}%"></i></span>${why}</div>`;
    })
    .join("");
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

function originSection(report: ReportFull): string {
  const { snapshot } = report;
  if (!snapshot.period.comparable) return "";
  const groups = contributions(snapshot);
  const net = snapshot.totals.clicks - snapshot.prevTotals.clicks;
  const body = `${
    groups.length > 0
      ? `<div class="sheet rv"><div class="grid g3">${groups.map((group) => divergeBlock(group.title, group.rows)).join("")}</div></div>`
      : ""
  }
<div class="grid g2" style="margin-top:18px">
<div class="sheet rv"><h3>Páginas que suben</h3>${changeBars(snapshot.pageWinners, true, true)}</div>
<div class="sheet rv d1"><h3>Páginas que bajan</h3>${changeBars(snapshot.pageLosers, false, true)}</div>
<div class="sheet rv"><h3>Búsquedas que suben</h3>${changeBars(snapshot.queryWinners, true, false)}</div>
<div class="sheet rv d1"><h3>Búsquedas que bajan</h3>${changeBars(snapshot.queryLosers, false, false)}</div>
</div>`;
  return section(
    "origen",
    "Origen del cambio",
    net >= 0
      ? `Origen de los ${signedNum(net)} clics: qué páginas y búsquedas lo explican`
      : "Origen de la variación: qué páginas y búsquedas la explican",
    "Cuánto suma o resta cada tipo de página, dispositivo y tipo de búsqueda al total, y las páginas y búsquedas concretas que más se mueven.",
    body,
    noteOf(report, "origen"),
  );
}

// ------------------------------------------------------------ positions

const BAND_COLORS = ["#f11c41", "#1a1a1a", "#7a7a84", "#c4c4cb"];

function bandsSection(report: ReportFull): string {
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
    .map((band, index) => {
      const share = totalClicks > 0 ? (band.clicks / totalClicks) * 100 : 0;
      return `<div class="bcard rv d${(index % 3) + 1}"><div class="bk">${esc(band.label)}</div><div class="bn">${num(band.queries)}</div><div class="bs">búsquedas</div>${comparable ? `<div class="bd">${countDelta(band.queries, band.prevQueries)} frente al periodo anterior</div>` : ""}<div class="pair"><div class="now"><i style="--w:${((band.queries / maxQueries) * 100).toFixed(0)}%"></i></div>${comparable ? `<div class="old"><i style="--w:${((band.prevQueries / maxQueries) * 100).toFixed(0)}%"></i></div>` : ""}</div><div class="bm"><b>${num(band.clicks)}</b> clics · <b>${Math.round(share)} %</b> del total</div></div>`;
    })
    .join("");
  const entered = snapshot.bands[0]?.entered ?? [];
  const movers = entered.length
    ? `<div class="sheet rv" style="margin-top:22px"><h3>Búsquedas que entran en el top 3</h3><table class="mvt"><tbody>${entered
        .map(
          (move) =>
            `<tr><td>${esc(move.query)}</td><td>${move.prevPosition !== null ? `${one.format(move.prevPosition)} → ` : "Nueva · "}<span class="dl up">${move.position !== null ? one.format(move.position) : ""}</span></td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : "";
  return section(
    "posiciones",
    "Posicionamiento",
    "Distribución de las búsquedas por posición en Google",
    `Cuántas búsquedas tiene la web en cada tramo de posiciones y cuántos clics aporta cada uno. En las tarjetas, la barra roja indica el periodo actual${comparable ? " y la gris el anterior" : ""}.`,
    `<div class="sheet rv"><h3>Reparto de los clics por tramo de posición</h3><div class="stk">${stacked}</div><div class="stl">${legend}</div></div><div class="bands">${cards}</div>${movers}`,
    noteOf(report, "posiciones"),
  );
}

// --------------------------------------------------------------- topics

function topicsSection(report: ReportFull): string {
  const { snapshot } = report;
  if (snapshot.topics.length === 0) return "";
  const cards = snapshot.topics
    .map((topic, index) => {
      const delta = snapshot.period.comparable
        ? pctDelta(topic.clicks, topic.prevClicks)
        : "";
      const queries = topic.topQueries
        .map((item) => `<li>${esc(item.query)}</li>`)
        .join("");
      const reach = Math.round(topic.nearTopShare * 100);
      return `<div class="topic rv d${(index % 3) + 1}"><div class="tn">${esc(topic.label)}</div><div class="tk"><b>${num(topic.clicks)}</b><span>clics</span>${delta}</div><small>${num(topic.queries)} búsquedas · ${num(topic.impressions)} impresiones · posición media ${one.format(topic.position)}</small><ul class="tq">${queries}</ul><div><small>Impresiones en posiciones 4 a 20: ${reach} %</small><div class="meter"><i style="--w:${reach}%"></i></div></div></div>`;
    })
    .join("");
  return section(
    "temas",
    "Temas",
    "Temas con más tráfico orgánico",
    "Las búsquedas se agrupan por tema para identificar dónde está la autoridad del sitio. La barra indica qué parte del tema está en posiciones 4 a 20, la más fácil de subir.",
    `<div class="topics">${cards}</div>`,
    noteOf(report, "temas"),
  );
}

// -------------------------------------------------------------- queries

function queriesSection(report: ReportFull): string {
  const { topQueries } = report.snapshot;
  if (topQueries.length === 0) return "";
  const rows = topQueries
    .map(
      (item, index) =>
        `<tr><td><b>${index + 1}.</b> ${esc(item.query)}</td><td class="r">${num(item.clicks)}</td><td class="r">${num(item.impressions)}</td><td class="r">${one.format(item.position)}</td></tr>`,
    )
    .join("");
  return section(
    "consultas",
    "Búsquedas",
    "Búsquedas que más tráfico aportan",
    "Se excluyen las búsquedas de marca, para mostrar las que atraen a usuarios que todavía no conocían el proyecto.",
    `<div class="sheet rv"><table class="qt"><thead><tr><th>Búsqueda</th><th class="r">Clics</th><th class="r">Impresiones</th><th class="r">Posición</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    noteOf(report, "consultas"),
  );
}

// ------------------------------------------------------------- audience

function audienceCard(
  title: string,
  lines: SegmentLine[],
  comparable: boolean,
): string {
  if (lines.length === 0) return "";
  const top = lines.slice(0, 6);
  const rows = top
    .map((line, index) => {
      const delta = comparable ? pctDelta(line.clicks, line.prevClicks) : "";
      return `<div class="arow${index === 0 ? " first" : ""}"><span class="an" title="${esc(line.label)}">${esc(line.label)}</span><span class="ap">${one.format(line.share * 100)} %</span><span class="dl-slot">${delta || ""}</span><div class="ab"><i style="--w:${Math.max(2, line.share * 100).toFixed(1)}%"></i></div></div>`;
    })
    .join("");
  return `<div class="sheet rv"><h3>${esc(title)}</h3>${rows}</div>`;
}

function audienceSection(report: ReportFull): string {
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
  return section(
    "reparto",
    "Audiencia",
    "Perfil del tráfico orgánico",
    `Porcentaje de los clics que corresponde a cada grupo${comparable ? " y su variación frente al periodo anterior" : ""}.`,
    `<div class="aud">${blocks}</div>`,
    noteOf(report, "reparto"),
  );
}

// ----------------------------------------------------------------- week

function weekSection(report: ReportFull): string {
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
  return section(
    "semana",
    "Ritmo semanal",
    "Distribución semanal del tráfico",
    "Clics medios por día de la semana durante el periodo. Permite decidir cuándo publicar y cuándo actualizar contenido.",
    `<div class="sheet rv"><div class="wk">${rows}</div></div>`,
    noteOf(report, "semana"),
  );
}

// -------------------------------------------------------- opportunities

function opportunitiesSection(report: ReportFull): string {
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
      const ai = idea
        ? `<div class="oai"><b>Análisis y acciones</b><p>${esc(idea.analysis)}</p>${
            idea.actions.filter((a) => a.trim()).length
              ? `<ul>${idea.actions
                  .filter((action) => action.trim())
                  .map((action) => `<li>${esc(action)}</li>`)
                  .join("")}</ul>`
              : ""
          }</div>`
        : "";
      return `<div class="opp"><div class="oh"><div class="rk">${index + 1}</div><div><div class="q">${esc(row.query)}</div><div class="m">${row.kind === "push" ? "A un paso del top 3" : "Se muestra mucho y se clica poco"} · posición ${one.format(row.position)} · ${num(row.impressions)} impresiones${row.page ? ` · ${esc(pathOf(row.page))}` : ""}</div></div><div class="g">+${num(row.potentialClicks)}<small>clics posibles</small></div></div>${ai}</div>`;
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
  return section(
    "oportunidades",
    "Oportunidades",
    `Oportunidades de crecimiento: unas ${num(total)} visitas más al alcance`,
    "Búsquedas en las que la web ya aparece y que, con una mejora concreta de título, contenido o enlaces, pueden traducirse en más clics. Ordenadas por la ganancia estimada.",
    `<div class="sheet rv">${list}${content}</div>`,
    noteOf(report, "oportunidades"),
  );
}

// ------------------------------------------------------------- AI notes

function diagnosisSection(report: ReportFull): string {
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
      return `<article class="dgc rv"><div class="u">${esc(pathOf(item.url))}</div>${meta}<p>${esc(item.text)}</p>${fixes ? `<h3>Actuaciones previstas</h3><ul class="fix">${fixes}</ul>` : ""}</article>`;
    })
    .join("");
  return section(
    "diagnostico",
    "Diagnóstico",
    "Diagnóstico de las páginas que pierden tráfico",
    "Se ha revisado cada página y las búsquedas que más han caído. Todas tienen recuperación posible: cuentan ya con historial en Google y solo requieren refuerzo.",
    `<div class="dg">${cards}</div>`,
    noteOf(report, "diagnostico"),
  );
}

function titlesSection(report: ReportFull): string {
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
      return `<article class="tic rv"><div class="tq2">«${esc(item.query)}»</div>${item.current ? `<div class="cur">Título actual: ${esc(item.current)}</div>` : ""}${options}</article>`;
    })
    .join("");
  return section(
    "titulos",
    "Títulos",
    "Propuestas de títulos y descripciones",
    "En estas búsquedas la web ya aparece, pero recibe pocos clics. Se proponen títulos y descripciones alternativos, tal como se verían en los resultados de Google.",
    `<div class="tid">${cards}</div>`,
    noteOf(report, "titulos"),
  );
}

// --------------------------------------------------------------- health

function healthSection(report: ReportFull): string {
  const health = report.snapshot.health;
  if (!health || health.inSitemap < 5) return "";
  const covered = Math.max(0, 1 - health.unseen / health.inSitemap);
  const tile = (value: number, label: string) =>
    `<div><b>${num(value)}</b><small>${label}</small></div>`;
  return section(
    "tecnico",
    "Estado técnico",
    "Estado técnico: cobertura del sitemap en Google",
    "Se compara el sitemap con las páginas que Google ha mostrado en los últimos 3 meses.",
    `<div class="sheet rv"><div class="hlt"><div class="ring"><svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="15.9155" stroke="#ececee"/><circle cx="21" cy="21" r="15.9155" stroke="#1a1a1a" stroke-linecap="round" stroke-dasharray="${(covered * 100).toFixed(1)} ${(100 - covered * 100).toFixed(1)}"/></svg><div class="ct"><b>${Math.round(covered * 100)} %</b><small>con visibilidad</small></div></div><div class="hs">${tile(health.inSitemap, "páginas en el sitemap")}${tile(health.pagesWithImpressions, "páginas con impresiones")}${tile(health.unseen, "sin impresiones todavía")}${tile(health.notInSitemap, "con impresiones fuera del sitemap")}${tile(health.sitemapErrors, "errores de sitemap")}</div></div></div>`,
    noteOf(report, "tecnico"),
  );
}

// -------------------------------------------------------------- discover

function discoverSection(report: ReportFull): string {
  const discover = report.snapshot.discover;
  if (!discover) return "";
  const max = Math.max(...discover.topPages.map((item) => item.clicks), 1);
  const pages = discover.topPages
    .map(
      (page) =>
        `<div class="brow"><span class="n" title="${esc(page.url)}">${esc(pathOf(page.url))}</span><span class="d">${num(page.clicks)}</span><span class="bar"><i class="upb" style="--w:${Math.max(4, (page.clicks / max) * 100).toFixed(0)}%"></i></span></div>`,
    )
    .join("");
  return section(
    "discover",
    "Google Discover",
    "Tráfico procedente de Google Discover",
    "Discover recomienda contenido a usuarios con intereses afines aunque no hayan buscado nada: es tráfico adicional al de las búsquedas.",
    `<div class="sheet rv"><div class="grid g2"><div><h3>Clics desde Discover</h3><div class="topic" style="border:0;box-shadow:none;padding:0"><div class="tk"><b data-count="${discover.clicks}" data-kind="int">${num(discover.clicks)}</b>${report.snapshot.period.comparable ? pctDelta(discover.clicks, discover.prevClicks) : ""}</div><small>${num(discover.impressions)} impresiones</small></div></div><div><h3>Contenido más recomendado</h3>${pages}</div></div></div>`,
    noteOf(report, "discover"),
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
<div class="kick rv">Próximos pasos</div><h2 class="rv">Hoja de ruta para el próximo periodo</h2>
<ol class="steps rv">${steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>
${note ? `<div class="note rv" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);color:#f6f6f6"><b style="color:#ffb3c0">Nota de Carlos</b>${esc(note)}</div>` : ""}
<a class="big-cta rv" href="https://carlosortega.page" target="_blank" rel="noopener">Contactar con Carlos Ortega</a>
<div class="foot"><span class="fm">${LOGO_MARK_LIGHT}</span><span>Informe generado el ${day(report.snapshot.generatedAt.slice(0, 10))} con datos de Google Search Console · carlosortega.page</span></div>
</div></footer>`;
}

// ----------------------------------------------------------------- page

const SHORT: Record<string, string> = {
  hallazgos: "Conclusiones",
  evolucion: "Evolución",
  origen: "Origen",
  posiciones: "Posiciones",
  temas: "Temas",
  consultas: "Búsquedas",
  reparto: "Audiencia",
  semana: "Semana",
  oportunidades: "Oportunidades",
  titulos: "Títulos",
  diagnostico: "Diagnóstico",
  tecnico: "Técnico",
  discover: "Discover",
};

export type RenderMode = "public" | "preview";

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
  const builders: Record<Exclude<SectionId, "proximos">, () => string> = {
    hallazgos: () => insightsSection(report),
    evolucion: () => trendSection(report),
    origen: () => originSection(report),
    posiciones: () => bandsSection(report),
    temas: () => topicsSection(report),
    consultas: () => queriesSection(report),
    reparto: () => audienceSection(report),
    semana: () => weekSection(report),
    oportunidades: () => opportunitiesSection(report),
    titulos: () => titlesSection(report),
    diagnostico: () => diagnosisSection(report),
    tecnico: () => healthSection(report),
    discover: () => discoverSection(report),
  };
  const built = REPORT_SECTIONS.flatMap((item) => {
    if (item.id === "proximos" || hidden.has(item.id)) return [];
    const html = builders[item.id]();
    return html ? [{ id: item.id, html }] : [];
  });
  const menu = built
    .map(
      (item) => `<a href="#${item.id}">${esc(SHORT[item.id] ?? item.id)}</a>`,
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
<div class="top" id="top"><div class="wrap"><span class="iso">${LOGO_MARK_LIGHT}</span><nav class="nav">${menu}<a href="#proximos">Próximos pasos</a></nav><button class="cta" type="button" onclick="window.print()">${mode === "preview" ? "Vista previa · " : ""}Imprimir / PDF</button></div></div>
${hero(report, host)}
${messageSection(report)}
${built.map((item) => item.html).join("\n")}
${hidden.has("proximos") ? "" : closing(report)}
<button class="totop" id="totop" type="button" aria-label="Volver arriba"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
<script type="application/json" id="report-data">${jsonForScript(data)}</script>
<script>${REPORT_SCRIPT}</script>
</body></html>`;
}
