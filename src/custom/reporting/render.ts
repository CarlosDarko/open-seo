// Turns a stored client report into one self-contained web page in Carlos
// Ortega's brand: a dark cover, findings that cross the data, interactive
// charts and a closing call. Everything that comes from data is escaped here.
// Numbers and lists are written on the server (the page reads without
// scripts and prints well); a small script adds the reveals and the chart.
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
  type IconName,
  type Insight,
} from "@/custom/reporting/insights";
import {
  buildVerdict,
  percentChange,
  signedPercent,
} from "@/custom/reporting/narrative";
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

const ICONS: Record<IconName, string> = {
  up: "M3 17l6-6 4 4 8-8M15 7h6v6",
  down: "M3 7l6 6 4-4 8 8M15 17h6v-6",
  alert:
    "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  target:
    "M12 21a9 9 0 100-18 9 9 0 000 18zM12 17a5 5 0 100-10 5 5 0 000 10zM12 13a1 1 0 100-2 1 1 0 000 2z",
  calendar:
    "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z",
  phone:
    "M7 2h10a2 2 0 012 2v16a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2zM12 18h.01",
  bolt: "M13 2L3 14h8l-1 8 10-12h-8l1-8z",
  layers: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  star: "M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2z",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  shield: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3zM9 12l2 2 4-4",
  link: "M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7",
};

const icon = (name: IconName) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;

const SPARK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z"/></svg>`;

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

function deltaPill(now: number, before: number, invert = false): string {
  const change = percentChange(now, before);
  if (change === null) return "";
  if (Math.abs(change) < 0.005) return `<span class="pill flat">= igual</span>`;
  const better = invert ? change < 0 : change > 0;
  return `<span class="pill ${better ? "good" : "bad"}">${signedPercent(change)}</span>`;
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
    pill: string,
  ) =>
    `<div class="kpi"><div class="l">${label}</div><div class="v" data-count="${value}" data-kind="${kind}">${shown}</div>${pill}</div>`;
  const positionPill = (() => {
    const diff = prevTotals.position - totals.position;
    if (!comparable || prevTotals.position <= 0) return "";
    if (Math.abs(diff) < 0.05) return `<span class="pill flat">= igual</span>`;
    return `<span class="pill ${diff > 0 ? "good" : "bad"}">${diff > 0 ? "▲" : "▼"} ${one.format(Math.abs(diff))} posiciones</span>`;
  })();
  const chips = highlights(snapshot)
    .map((text) => `<span class="chip">${esc(text)}</span>`)
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
<div class="chips rv d3">${chips}</div>
<div class="kpis rv d3">
${kpi("Clics", totals.clicks, "int", num(totals.clicks), comparable ? deltaPill(totals.clicks, prevTotals.clicks) : "")}
${kpi("Impresiones", totals.impressions, "int", num(totals.impressions), comparable ? deltaPill(totals.impressions, prevTotals.impressions) : "")}
${kpi("CTR", totals.ctr * 100, "pct", `${one.format(totals.ctr * 100)} %`, comparable ? deltaPill(totals.ctr, prevTotals.ctr) : "")}
${kpi("Posición media", totals.position, "dec", one.format(totals.position), positionPill)}
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
    .map((stat) => `<span>${esc(stat.label)} <b>${esc(stat.value)}</b></span>`)
    .join("");
  const upside = item.upside
    ? `<div class="up">${SPARK_ICON}<span>${esc(item.upside)}</span></div>`
    : "";
  return `<article class="in-card ${item.tone}${index === 0 ? " big" : ""} rv d${(index % 3) + 1}"><div class="ic">${icon(item.icon)}</div><div class="t">${esc(item.title)}</div><p class="b">${esc(item.body)}</p><div class="st">${stats}</div>${upside}</article>`;
}

function insightsSection(report: ReportFull): string {
  const items = buildInsights(report.snapshot).slice(0, 9);
  if (items.length === 0) return "";
  return section(
    "hallazgos",
    "Lo esencial",
    "Qué ha pasado y qué significa",
    "Cruzamos todas las fuentes de Search Console para contarte, en claro, lo que de verdad importa este periodo y qué hacer con ello.",
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
      return `<div class="ucard rv" style="--uc:${color}"><div class="un">${esc(item.update.label)} <span class="pill red" style="background:${color}22;color:${color}">${esc(KIND_NAME[item.update.kind])}</span></div><div class="ud">${dayShort(item.update.begin)} → ${item.update.end ? dayShort(item.update.end) : "en curso"} · clics por día</div><div class="trio">${cell("Antes", item.before)}${cell("Durante", item.during)}${cell("Después", item.after)}</div><p>${esc(item.verdict)}</p></div>`;
    })
    .join("");
  const body = `<div class="card rv">
<div class="tabs"><button class="on" data-metric="clicks">Clics</button><button data-metric="impressions">Impresiones</button><button data-metric="position">Posición</button></div>
<div class="chartbox"><svg id="chart" role="img" aria-label="Evolución diaria"></svg><div class="tip" id="tip"></div></div>
<div class="legend"><span><i></i>Este periodo</span>${snapshot.period.comparable ? `<span><i class="prev"></i>Periodo anterior</span>` : ""}${legend}</div>
${cards ? `<div class="uimp">${cards}</div>` : ""}
</div>`;
  return section(
    "evolucion",
    "Evolución",
    "Día a día, con Google de fondo",
    snapshot.updates.length > 0
      ? "Las franjas de color son los cambios de algoritmo de Google que coincidieron con el periodo, con su efecto medido sobre tus clics."
      : "Cómo se han movido tus resultados cada día frente al periodo anterior. Pasa el ratón o el dedo por la gráfica.",
    body,
    noteOf(report, "evolucion"),
  );
}

// --------------------------------------------------------------- origin

function changeBars(rows: ChangeLine[], up: boolean, withWhy: boolean): string {
  if (rows.length === 0) {
    return `<p class="empty">Nada destacable en este sentido.</p>`;
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
                  `<em>${esc(item.query)} ${signedNum(item.clicksDelta)}</em>`,
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
      ? `<div class="card rv"><div class="grid g3">${groups.map((group) => divergeBlock(group.title, group.rows)).join("")}</div></div>`
      : ""
  }
<div class="grid g2" style="margin-top:18px">
<div class="card rv"><h3>Páginas que suben</h3>${changeBars(snapshot.pageWinners, true, true)}</div>
<div class="card rv d1"><h3>Páginas que bajan</h3>${changeBars(snapshot.pageLosers, false, true)}</div>
<div class="card rv"><h3>Búsquedas que suben</h3>${changeBars(snapshot.queryWinners, true, false)}</div>
<div class="card rv d1"><h3>Búsquedas que bajan</h3>${changeBars(snapshot.queryLosers, false, false)}</div>
</div>`;
  return section(
    "origen",
    "De dónde viene el cambio",
    net >= 0
      ? `Los ${signedNum(net)} clics, desglosados`
      : "Dónde se concentra el cambio",
    "Quién suma y quién resta dentro del total: por tipo de página, por dispositivo y por marca, y las páginas y búsquedas concretas que explican el movimiento.",
    body,
    noteOf(report, "origen"),
  );
}

// ------------------------------------------------------------ positions

function bandsSection(report: ReportFull): string {
  const { snapshot } = report;
  if (snapshot.bands.length === 0) return "";
  const maxQueries = Math.max(
    ...snapshot.bands.map((band) => Math.max(band.queries, band.prevQueries)),
    1,
  );
  const rows = snapshot.bands
    .map((band) => {
      const now = (band.queries / maxQueries) * 100;
      const before = (band.prevQueries / maxQueries) * 100;
      const diff = band.queries - band.prevQueries;
      return `<div class="band"><span class="bl">${esc(band.label)}</span><span><span class="tr"><i style="--w:${now.toFixed(0)}%"></i></span>${snapshot.period.comparable ? `<span class="tr old"><i style="--w:${before.toFixed(0)}%"></i></span>` : ""}</span><span class="bn"><b>${num(band.queries)}</b> búsquedas${snapshot.period.comparable ? `<small>${diff === 0 ? "igual que antes" : `${signedNum(diff)} que antes`}</small>` : ""}<small>${num(band.clicks)} clics</small></span></div>`;
    })
    .join("");
  const entered = snapshot.bands[0]?.entered ?? [];
  const movers = entered.length
    ? `<h3 style="margin-top:22px">Han entrado al top 3</h3><div class="movers">${entered
        .map(
          (move) =>
            `<span class="mv">${esc(move.query)} <b>${move.prevPosition !== null ? `${one.format(move.prevPosition)} → ` : ""}${move.position !== null ? one.format(move.position) : ""}</b></span>`,
        )
        .join("")}</div>`
    : "";
  return section(
    "posiciones",
    "Posicionamiento",
    "Cuántas búsquedas, y en qué posición",
    `Barra roja: ahora${snapshot.period.comparable ? "; barra gris: antes" : ""}. Cada paso hacia arriba multiplica los clics: el top 3 se lleva la mayoría.`,
    `<div class="card rv">${rows}${movers}</div>`,
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
        ? deltaPill(topic.clicks, topic.prevClicks)
        : "";
      const queries = topic.topQueries
        .map((item) => `<span>${esc(item.query)}</span>`)
        .join("");
      return `<div class="topic rv d${(index % 3) + 1}"><div class="tn">${esc(topic.label)}</div><div class="tk"><b>${num(topic.clicks)}</b><span>clics</span>${delta}</div><small>${num(topic.queries)} búsquedas · ${num(topic.impressions)} impresiones · posición ${one.format(topic.position)}</small><div class="tq">${queries}</div><div><small>Al alcance de subir: ${Math.round(topic.nearTopShare * 100)} %</small><div class="meter"><i style="--w:${Math.round(topic.nearTopShare * 100)}%"></i></div></div></div>`;
    })
    .join("");
  return section(
    "temas",
    "Temas",
    "De qué te buscan",
    "Agrupamos tus búsquedas por temas para ver dónde está tu autoridad. La barra indica qué parte del tema está en posiciones 4 a 20: la más fácil de subir.",
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
    "Búsquedas estrella",
    "Las búsquedas que más te traen",
    "Sin contar las de tu marca: las que atraen a gente que no te conocía.",
    `<div class="card rv"><table><thead><tr><th>Búsqueda</th><th class="r">Clics</th><th class="r">Impresiones</th><th class="r">Posición</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    noteOf(report, "consultas"),
  );
}

// -------------------------------------------------------------- donuts

const PALETTE = [
  "#f11c41",
  "#1a1a1a",
  "#f59e0b",
  "#2563eb",
  "#22a755",
  "#8b5cf6",
  "#0891b2",
  "#9ca3af",
];

function donut(
  title: string,
  lines: SegmentLine[],
  comparable: boolean,
): string {
  if (lines.length === 0) return "";
  let offset = 0;
  const circles = lines
    .map((line, index) => {
      const part = line.share * 100;
      const circle = `<circle cx="21" cy="21" r="15.9155" stroke="${PALETTE[index % PALETTE.length]}" stroke-dasharray="${part.toFixed(2)} ${(100 - part).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`;
      offset += part;
      return circle;
    })
    .join("");
  const legend = lines
    .map((line, index) => {
      const delta = comparable ? deltaPill(line.clicks, line.prevClicks) : "";
      return `<span><i class="dot" style="background:${PALETTE[index % PALETTE.length]}"></i>${esc(line.label)} <b>${one.format(line.share * 100)} %</b> ${delta}</span>`;
    })
    .join("");
  return `<div class="card rv"><h3>${esc(title)}</h3><div class="dn"><svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="15.9155" stroke="#ececee"/>${circles}</svg><div class="lg">${legend}</div></div></div>`;
}

function splitSection(report: ReportFull): string {
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
    donut("Dispositivo", snapshot.segments.device, comparable),
    donut("Tipo de página", snapshot.segments.pageType, comparable),
    donut("Marca y no marca", brandLines, comparable),
    donut("Intención de búsqueda", snapshot.segments.intent, comparable),
  ].join("");
  if (!blocks) return "";
  return section(
    "reparto",
    "Audiencia",
    "Quién te trae el tráfico",
    "Cómo se reparten los clics y cuánto ha crecido cada parte.",
    `<div class="donuts">${blocks}</div>`,
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
  const cols = stats
    .map(
      (item) =>
        `<div class="wd${item === best ? " best" : ""}"><b>${num(item.average)}</b><div class="col" style="--h:${Math.max(4, (item.average / max) * 100).toFixed(0)}%"></div><span>${item.label}</span></div>`,
    )
    .join("");
  return section(
    "semana",
    "Ritmo",
    "Cuándo te visitan más",
    "Clics medios por día de la semana en este periodo. Sirve para decidir cuándo publicar y cuándo actualizar.",
    `<div class="card rv"><div class="week">${cols}</div></div>`,
    noteOf(report, "semana"),
  );
}

// -------------------------------------------------------- opportunities

function opportunitiesSection(report: ReportFull): string {
  const rows = [...report.snapshot.opportunities].sort(
    (a, b) => b.potentialClicks - a.potentialClicks,
  );
  if (rows.length === 0) return "";
  const max = Math.max(...rows.map((row) => row.potentialClicks), 1);
  const list = rows
    .slice(0, 8)
    .map(
      (row, index) =>
        `<div class="opp"><div class="rk">${index + 1}</div><div><div class="q">${esc(row.query)}</div><div class="m"><em>${row.kind === "push" ? "A un paso del top 3" : "Se ve mucho, se clica poco"}</em><em>posición ${one.format(row.position)}</em><em>${num(row.impressions)} impresiones</em>${row.page ? `<em>${esc(pathOf(row.page))}</em>` : ""}</div></div><div class="g">+${num(row.potentialClicks)}<small>clics posibles</small></div><div class="obar"><i style="--w:${((row.potentialClicks / max) * 100).toFixed(0)}%"></i></div></div>`,
    )
    .join("");
  const total = rows.reduce((sum, row) => sum + row.potentialClicks, 0);
  return section(
    "oportunidades",
    "Oportunidades",
    `Unas ${num(total)} visitas más al alcance`,
    "Búsquedas donde ya apareces y un pequeño empujón (mejor título, más enlaces, contenido más completo) se traduce en clics. Ordenadas por lo que ganarías.",
    `<div class="card rv">${list}</div>`,
    noteOf(report, "oportunidades"),
  );
}

// --------------------------------------------------------------- health

function healthSection(report: ReportFull): string {
  const health = report.snapshot.health;
  if (!health || health.inSitemap < 5) return "";
  const covered = Math.max(0, 1 - health.unseen / health.inSitemap);
  const color =
    covered >= 0.85 ? "#22a755" : covered >= 0.6 ? "#f59e0b" : "#f11c41";
  const tile = (value: number, label: string) =>
    `<div><b>${num(value)}</b><small>${label}</small></div>`;
  return section(
    "tecnico",
    "Salud técnica",
    covered >= 0.85
      ? "Google ya conoce casi todo tu sitio"
      : "Páginas por activar en Google",
    "Cruzamos tu sitemap con lo que Google ha mostrado en los últimos 3 meses.",
    `<div class="card rv"><div class="hl"><div class="ring"><svg viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="15.9155" stroke="#ececee"/><circle cx="21" cy="21" r="15.9155" stroke="${color}" stroke-linecap="round" stroke-dasharray="${(covered * 100).toFixed(1)} ${(100 - covered * 100).toFixed(1)}"/></svg><div class="ct"><b>${Math.round(covered * 100)} %</b><small>con visibilidad</small></div></div><div class="hs">${tile(health.inSitemap, "páginas en el sitemap")}${tile(health.pagesWithImpressions, "páginas con impresiones")}${tile(health.unseen, "sin impresiones aún")}${tile(health.notInSitemap, "con impresiones fuera del sitemap")}${tile(health.sitemapErrors, "errores de sitemap")}</div></div></div>`,
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
    `${num(discover.clicks)} clics sin que te busquen`,
    "Discover recomienda tu contenido a personas con intereses afines, aunque no hayan buscado nada. Es tráfico extra.",
    `<div class="card rv"><div class="grid g2"><div><h3>Resumen</h3><div class="kpi" style="background:#1a1a1a;color:#f6f6f6;border-radius:16px"><div class="l">Clics desde Discover</div><div class="v" data-count="${discover.clicks}" data-kind="int">${num(discover.clicks)}</div>${report.snapshot.period.comparable ? deltaPill(discover.clicks, discover.prevClicks) : ""}</div></div><div><h3>Contenido recomendado</h3>${pages}</div></div></div>`,
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
      `Revisar y reforzar ${pathOf(loser.key)}: es la página con más margen de recuperación.`,
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
      `Publicar más contenido sobre «${topic.label}», tu tema con más tirón.`,
    );
  }
  if (steps.length === 0) {
    steps.push(
      "Mantener el ritmo de publicación y vigilar la evolución del próximo periodo.",
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
<div class="kick rv">Próximos pasos</div><h2 class="rv">Y ahora, a por lo siguiente</h2>
<ol class="steps rv">${steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>
${note ? `<div class="note rv" style="background:rgba(255,255,255,.08);color:#f6f6f6"><b style="color:#ffb3c0">Nota de Carlos</b>${esc(note)}</div>` : ""}
<a class="big-cta rv" href="https://carlosortega.page" target="_blank" rel="noopener">Hablemos del siguiente paso</a>
<div class="foot"><span class="fm">${LOGO_MARK_LIGHT}</span><span>Informe generado el ${day(report.snapshot.generatedAt.slice(0, 10))} con datos de Google Search Console · carlosortega.page</span></div>
</div></footer>`;
}

// ----------------------------------------------------------------- page

const SHORT: Record<string, string> = {
  hallazgos: "Hallazgos",
  evolucion: "Evolución",
  origen: "Origen",
  posiciones: "Posiciones",
  temas: "Temas",
  consultas: "Búsquedas",
  reparto: "Audiencia",
  semana: "Ritmo",
  oportunidades: "Oportunidades",
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
    reparto: () => splitSection(report),
    semana: () => weekSection(report),
    oportunidades: () => opportunitiesSection(report),
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
<script>document.documentElement.className="js";</script>
<style>${REPORT_CSS}</style></head>
<body>
<div class="top" id="top"><div class="wrap"><span class="iso">${LOGO_MARK_LIGHT}</span><nav class="nav">${menu}<a href="#proximos">Próximos pasos</a></nav><button class="cta" type="button" onclick="window.print()">${mode === "preview" ? "Vista previa · " : ""}Imprimir / PDF</button></div></div>
${hero(report, host)}
${messageSection(report)}
${built.map((item) => item.html).join("\n")}
${hidden.has("proximos") ? "" : closing(report)}
<script type="application/json" id="report-data">${jsonForScript(data)}</script>
<script>${REPORT_SCRIPT}</script>
</body></html>`;
}
