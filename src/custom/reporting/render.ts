// Turns a stored client report into one self-contained HTML page: the numbers
// and lists are written on the server (so the page reads without scripts and
// prints well), and a small script adds the interactive chart and the
// checklist. Everything that comes from data is escaped here.
import { integer } from "@/custom/radar/format";
import { KIND_NAME } from "@/custom/radar/googleUpdates";
import {
  buildVerdict,
  percentChange,
  signedPercent,
} from "@/custom/reporting/narrative";
import { REPORT_CSS } from "@/custom/reporting/renderStyles";
import { REPORT_SCRIPT } from "@/custom/reporting/renderScript";
import {
  REPORT_SECTIONS,
  type ChangeLine,
  type ReportFull,
  type ReportTask,
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

const num = (value: number) => integer.format(Math.round(value));
const day = (iso: string) => dateFormat.format(new Date(`${iso}T12:00:00Z`));

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search || "/";
  } catch {
    return url;
  }
}

/** The JSON that travels in a script tag: "<" is written as a unicode escape
 *  so the data can never close the tag. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", `${BACKSLASH}u003c`);
}

function deltaPill(
  now: number,
  before: number,
  options: { invert?: boolean } = {},
): string {
  const change = percentChange(now, before);
  if (change === null) return `<span class="pill flat">sin comparar</span>`;
  if (Math.abs(change) < 0.005) return `<span class="pill flat">= igual</span>`;
  const better = options.invert ? change < 0 : change > 0;
  return `<span class="pill ${better ? "good" : "bad"}">${signedPercent(change)}</span>`;
}

function positionPill(now: number, before: number): string {
  const diff = before - now;
  if (before <= 0 || Math.abs(diff) < 0.05)
    return `<span class="pill flat">= igual</span>`;
  return `<span class="pill ${diff > 0 ? "good" : "bad"}">${diff > 0 ? "▲" : "▼"} ${one.format(Math.abs(diff))}</span>`;
}

function spark(values: number[], invert = false): string {
  if (values.length < 2) return "";
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const width = 200;
  const height = 34;
  const points = values.map((value, index) => {
    const t = (value - lo) / span;
    const y = (invert ? t : 1 - t) * (height - 6) + 3;
    return `${((index * width) / (values.length - 1)).toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points.join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}

function note(report: ReportFull, id: SectionId): string {
  const text = report.notes.sectionNotes[id]?.trim();
  return text
    ? `<div class="note"><b>Nota de Carlos</b>${esc(text)}</div>`
    : "";
}

function kpis(report: ReportFull): string {
  const { snapshot } = report;
  const { totals, prevTotals, daily } = snapshot;
  const comparable = snapshot.period.comparable && prevTotals.impressions > 0;
  const cards = [
    {
      label: "Clics",
      value: num(totals.clicks),
      pill: comparable ? deltaPill(totals.clicks, prevTotals.clicks) : "",
      spark: spark(daily.map((point) => point.clicks)),
    },
    {
      label: "Impresiones",
      value: num(totals.impressions),
      pill: comparable
        ? deltaPill(totals.impressions, prevTotals.impressions)
        : "",
      spark: spark(daily.map((point) => point.impressions)),
    },
    {
      label: "CTR",
      value: `${one.format(totals.ctr * 100)} %`,
      pill: comparable ? deltaPill(totals.ctr, prevTotals.ctr) : "",
      spark: spark(
        daily.map((point) =>
          point.impressions > 0 ? point.clicks / point.impressions : 0,
        ),
      ),
    },
    {
      label: "Posición media",
      value: one.format(totals.position),
      pill: comparable
        ? positionPill(totals.position, prevTotals.position)
        : "",
      spark: spark(
        daily.map((point) => point.position),
        true,
      ),
    },
  ];
  return `<div class="kpis">${cards
    .map(
      (card) =>
        `<div class="kpi"><div class="l">${card.label}</div><div class="v">${card.value}</div>${card.pill}${card.spark}</div>`,
    )
    .join("")}</div>`;
}

function summarySection(report: ReportFull): string {
  const verdict = buildVerdict(report.snapshot);
  const message = report.notes.message.trim();
  return `<section id="resumen">
<div class="verdict ${verdict.tone}"><p>${esc(verdict.headline)}</p></div>
${message ? `<div class="msg">${esc(message)}<small>— Carlos Ortega</small></div>` : ""}
${kpis(report)}
${
  verdict.points.length > 0
    ? `<div class="card" style="margin-top:14px"><h3>Lo más importante</h3><ul class="points">${verdict.points.map((point) => `<li>${esc(point)}</li>`).join("")}</ul>${
        verdict.firstAction
          ? `<div class="first"><b>Empieza por</b><span>${esc(verdict.firstAction)}</span></div>`
          : ""
      }</div>`
    : ""
}
${note(report, "resumen")}
</section>`;
}

function trendSection(report: ReportFull): string {
  const { snapshot } = report;
  const hasUpdates = snapshot.updates.length > 0;
  return `<section id="evolucion"><div class="card">
<h2>Evolución</h2>
<p class="lead">Día a día en el periodo${snapshot.period.comparable ? ", con la línea discontinua del periodo anterior" : ""}. Pasa el ratón (o el dedo) por la gráfica.</p>
<div class="tabs"><button class="on" data-metric="clicks">Clics</button><button data-metric="impressions">Impresiones</button><button data-metric="position">Posición</button></div>
<div class="chartbox"><svg id="chart" role="img" aria-label="Evolución diaria"></svg><div class="tip" id="tip"></div></div>
<div class="legend"><span><i></i>Este periodo</span>${snapshot.period.comparable ? `<span><i class="prev"></i>Periodo anterior</span>` : ""}${hasUpdates ? `<span><i class="upd"></i>Cambio de Google en marcha</span>` : ""}</div>
${note(report, "evolucion")}
</div></section>`;
}

function changeRows(rows: ChangeLine[], up: boolean): string {
  if (rows.length === 0)
    return `<p class="empty">${up ? "Ninguna sube de forma notable." : "Ninguna baja de forma notable."}</p>`;
  const max = Math.max(...rows.map((row) => Math.abs(row.clicksDelta)), 1);
  return `<div class="blist">${rows
    .map((row) => {
      const width = Math.max(4, (Math.abs(row.clicksDelta) / max) * 100);
      const label = row.key.startsWith("http") ? pathOf(row.key) : row.key;
      return `<div class="brow"><span class="n" title="${esc(row.key)}">${esc(label)}</span><span class="d ${up ? "up" : "down"}">${up ? "+" : "−"}${num(Math.abs(row.clicksDelta))}</span><span class="bar"><i class="${up ? "up-bg" : "down-bg"}" style="width:${width.toFixed(0)}%"></i></span></div>`;
    })
    .join("")}</div>`;
}

function changesSection(report: ReportFull): string {
  const { snapshot } = report;
  if (!snapshot.period.comparable) {
    return `<section id="cambios"><div class="card"><h2>Qué ha subido y qué ha bajado</h2><p class="empty">Este periodo es demasiado largo para compararlo con el anterior (Google guarda 16 meses de datos).</p></div></section>`;
  }
  return `<section id="cambios"><div class="card">
<h2>Qué ha subido y qué ha bajado</h2>
<p class="lead">Variación de clics frente al periodo anterior. Han aparecido ${num(snapshot.newQueries)} búsquedas nuevas con impresiones y se han perdido ${num(snapshot.lostQueries)}.</p>
<div class="cols">
<div><h3>Páginas que suben</h3>${changeRows(snapshot.pageWinners, true)}</div>
<div><h3>Páginas que bajan</h3>${changeRows(snapshot.pageLosers, false)}</div>
</div>
<div class="cols" style="margin-top:22px">
<div><h3>Búsquedas que suben</h3>${changeRows(snapshot.queryWinners, true)}</div>
<div><h3>Búsquedas que bajan</h3>${changeRows(snapshot.queryLosers, false)}</div>
</div>
${note(report, "cambios")}
</div></section>`;
}

function bandsSection(report: ReportFull): string {
  const { snapshot } = report;
  const maxQueries = Math.max(
    ...snapshot.bands.map((band) => Math.max(band.queries, band.prevQueries)),
    1,
  );
  const rows = snapshot.bands
    .map((band) => {
      const now = (band.queries / maxQueries) * 100;
      const before = (band.prevQueries / maxQueries) * 100;
      const diff = band.queries - band.prevQueries;
      return `<div class="band"><span class="bl">${esc(band.label)}</span><span class="tracks"><span class="tr"><i style="width:${now.toFixed(0)}%"></i></span>${snapshot.period.comparable ? `<span class="tr old"><i style="width:${before.toFixed(0)}%"></i></span>` : ""}</span><span class="bn"><b>${num(band.queries)}</b> búsquedas${snapshot.period.comparable ? `<small>${diff === 0 ? "igual que antes" : `${diff > 0 ? "+" : "−"}${num(Math.abs(diff))} que antes`}</small>` : ""}<small>${num(band.clicks)} clics</small></span></div>`;
    })
    .join("");
  return `<section id="posiciones"><div class="card">
<h2>Dónde posicionas</h2>
<p class="lead">Cuántas búsquedas te traen visitas según tu posición en Google${snapshot.period.comparable ? " (barra de color: ahora; barra gris: antes)" : ""}. Estar en el top 3 es lo que más clics da.</p>
${rows}
${note(report, "posiciones")}
</div></section>`;
}

const PALETTE = [
  "#b3173a",
  "#2563eb",
  "#15803d",
  "#a15c07",
  "#7c3aed",
  "#0e7490",
  "#be185d",
  "#52525b",
];

function segmentBlock(title: string, lines: SegmentLine[]): string {
  if (lines.length === 0) return "";
  const stack = lines
    .map(
      (line, index) =>
        `<i style="width:${(line.share * 100).toFixed(1)}%;background:${PALETTE[index % PALETTE.length]}" title="${esc(line.label)}"></i>`,
    )
    .join("");
  const legend = lines
    .map((line, index) => {
      const change = percentChange(line.clicks, line.prevClicks);
      return `<span><span class="dot" style="background:${PALETTE[index % PALETTE.length]}"></span>${esc(line.label)} <b>${one.format(line.share * 100)} %</b>${change === null ? "" : ` <span class="pill ${change >= 0 ? "good" : "bad"}">${signedPercent(change)}</span>`}</span>`;
    })
    .join("");
  return `<div class="seg"><h3>${title}</h3><div class="stack">${stack}</div><div class="slegend">${legend}</div></div>`;
}

function segmentsSection(report: ReportFull): string {
  const { segments } = report.snapshot;
  const blocks = [
    segmentBlock("Por dispositivo", segments.device),
    segmentBlock("Por tipo de página", segments.pageType),
    segmentBlock("Por intención de búsqueda", segments.intent),
  ].join("");
  return `<section id="segmentos"><div class="card">
<h2>Quién te trae el tráfico</h2>
<p class="lead">Reparto de los clics y su variación frente al periodo anterior.</p>
${blocks || `<p class="empty">No hay datos suficientes.</p>`}
${note(report, "segmentos")}
</div></section>`;
}

function opportunityTable(
  rows: ReportFull["snapshot"]["opportunities"],
  head: string,
): string {
  if (rows.length === 0)
    return `<p class="empty">No hay oportunidades claras ahora mismo.</p>`;
  return `<table><thead><tr><th>${head}</th><th class="r">Posición</th><th class="r">Impresiones</th><th class="r">Visitas posibles</th></tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr><td><b>${esc(row.query)}</b>${row.page ? `<div class="path">${esc(pathOf(row.page))}</div>` : ""}</td><td class="r">${num(row.position)}</td><td class="r">${num(row.impressions)}</td><td class="r"><span class="pill good">+${num(row.potentialClicks)}</span></td></tr>`,
    )
    .join("")}</tbody></table>`;
}

function opportunitiesSection(report: ReportFull): string {
  const { opportunities } = report.snapshot;
  const snippet = opportunities.filter((item) => item.kind === "snippet");
  const push = opportunities.filter((item) => item.kind === "push");
  return `<section id="oportunidades"><div class="card">
<h2>Oportunidades</h2>
<p class="lead">Dónde hay visitas al alcance con poco esfuerzo.</p>
<h3>A un paso del top 3</h3>
${opportunityTable(push, "Búsqueda")}
<h3 style="margin-top:20px">Se ven mucho pero se clica poco</h3>
${opportunityTable(snippet, "Búsqueda")}
${note(report, "oportunidades")}
</div></section>`;
}

const KIND_LABEL: Record<ReportTask["kind"], string> = {
  loss: "Recuperar",
  snippet: "Mejorar título",
  push: "Subir posición",
  question: "Contestar pregunta",
  cannibal: "Páginas que compiten",
  traction: "Dar tracción",
  emerging: "Aprovechar tendencia",
};

const EFFORT_LABEL = {
  bajo: "Esfuerzo bajo",
  medio: "Esfuerzo medio",
  alto: "Esfuerzo alto",
} as const;
const EFFORT_TONE = { bajo: "good", medio: "warn", alto: "bad" } as const;

function taskCard(
  task: ReportTask,
  checks: ReportFull["checks"],
  index: number,
): string {
  const check = checks[task.id];
  const when = check
    ? `Marcada el ${day(check.at.slice(0, 10))} (${check.by})`
    : "";
  const stats = task.stats
    .map(
      (stat) =>
        `<span class="pill flat">${esc(stat.label)}: ${esc(stat.value)}</span>`,
    )
    .join("");
  const lines = task.lines.length
    ? `<div><h4>Qué dicen los datos</h4><ul>${task.lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul></div>`
    : "";
  const steps = task.steps.length
    ? `<div><h4>Qué hacer</h4><ol>${task.steps.map((step) => `<li>${esc(step)}</li>`).join("")}</ol></div>`
    : "";
  return `<div class="task${check ? " done" : ""}" data-id="${esc(task.id)}" data-effort="${task.effort}">
<div class="head"><input type="checkbox" aria-label="Marcar como hecha"${check ? " checked" : ""}>
<div class="tb"><div class="tt">${index}. ${esc(task.title)}</div><div class="ts">${esc(task.subtitle)}</div>
<div class="tags"><span class="pill acc">${KIND_LABEL[task.kind]}</span><span class="pill ${EFFORT_TONE[task.effort]}">${EFFORT_LABEL[task.effort]}</span>${task.gain ? `<span class="pill good">hasta +${num(task.gain)} clics</span>` : ""}${stats}</div>
<div class="when">${esc(when)}</div></div></div>
${lines || steps ? `<details><summary>Ver detalle y pasos</summary><div class="dbody">${lines}${steps}</div></details>` : ""}
</div>`;
}

function extraTaskCard(
  task: { id: string; title: string; detail: string },
  checks: ReportFull["checks"],
  index: number,
): string {
  const check = checks[task.id];
  return `<div class="task${check ? " done" : ""}" data-id="${esc(task.id)}" data-effort="medio">
<div class="head"><input type="checkbox" aria-label="Marcar como hecha"${check ? " checked" : ""}>
<div class="tb"><div class="tt">${index}. ${esc(task.title)}</div>${task.detail ? `<div class="ts">${esc(task.detail)}</div>` : ""}
<div class="tags"><span class="pill acc">Propuesta de Carlos</span></div>
<div class="when">${check ? esc(`Marcada el ${day(check.at.slice(0, 10))} (${check.by})`) : ""}</div></div></div></div>`;
}

function tasksSection(report: ReportFull): string {
  const { snapshot, notes, checks } = report;
  const total = snapshot.tasks.length + notes.extraTasks.length;
  if (total === 0) {
    return `<section id="tareas"><div class="card"><h2>Plan de acción</h2><p class="empty">No hay acciones pendientes: no se han detectado pérdidas ni oportunidades claras.</p></div></section>`;
  }
  const cards = [
    ...snapshot.tasks.map((task, index) => taskCard(task, checks, index + 1)),
    ...notes.extraTasks.map((task, index) =>
      extraTaskCard(task, checks, snapshot.tasks.length + index + 1),
    ),
  ].join("");
  return `<section id="tareas"><div class="card">
<h2>Plan de acción</h2>
<p class="lead">Lo que más resultado puede dar, ordenado por visitas en juego. Marca cada tarea cuando esté hecha: tu progreso se guarda.</p>
<div class="progress"><div class="pbar"><i id="pbar" style="width:0"></i></div><span class="pnum" id="pnum"></span></div>
<div class="chips"><button class="on" data-filter="all">Todas</button><button data-filter="easy">Fáciles</button><button data-filter="todo">Pendientes</button></div>
<div class="tasks">${cards}</div>
${note(report, "tareas")}
</div></section>`;
}

function googleSection(report: ReportFull): string {
  const { updates } = report.snapshot;
  const rows = updates
    .map(
      (update) =>
        `<div class="upd"><span class="dt">${day(update.begin)}${update.end ? ` → ${day(update.end)}` : " → en curso"}</span><span><b>${esc(update.label)}</b> <span class="pill warn">${esc(KIND_NAME[update.kind])}</span></span><a href="${esc(update.url)}" rel="noopener" target="_blank" style="margin-left:auto">Ver en Google</a></div>`,
    )
    .join("");
  return `<section id="google"><div class="card">
<h2>Cambios de Google en el periodo</h2>
<p class="lead">Google actualiza su algoritmo varias veces al año. Si coinciden con un cambio en tus clics, conviene tenerlo en cuenta antes de sacar conclusiones.</p>
<div class="upds">${rows}</div>
${note(report, "google")}
</div></section>`;
}

function nextSection(report: ReportFull): string {
  const lines = report.notes.nextSteps
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  return `<section id="proximos"><div class="card"><h2>Próximos pasos</h2><ol class="steps">${lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ol>${note(report, "proximos")}</div></section>`;
}

const SHORT: Record<SectionId, string> = {
  resumen: "Resumen",
  evolucion: "Evolución",
  cambios: "Cambios",
  posiciones: "Posiciones",
  segmentos: "Tráfico",
  oportunidades: "Oportunidades",
  tareas: "Plan de acción",
  google: "Google",
  proximos: "Próximos pasos",
};

export type RenderMode = "public" | "preview";

export function renderReportDocument(
  report: ReportFull,
  mode: RenderMode,
): string {
  const { snapshot } = report;
  const hidden = new Set(report.notes.hidden);
  const wanted: Record<SectionId, () => string> = {
    resumen: () => summarySection(report),
    evolucion: () => trendSection(report),
    cambios: () => changesSection(report),
    posiciones: () => bandsSection(report),
    segmentos: () => segmentsSection(report),
    oportunidades: () => opportunitiesSection(report),
    tareas: () => tasksSection(report),
    google: () => (snapshot.updates.length > 0 ? googleSection(report) : ""),
    proximos: () => nextSection(report),
  };
  const shown = REPORT_SECTIONS.filter(
    (section) => !hidden.has(section.id) && wanted[section.id]() !== "",
  );
  const body = shown.map((section) => wanted[section.id]()).join("\n");
  const menu = shown
    .map((section) => `<a href="#${section.id}">${esc(SHORT[section.id])}</a>`)
    .join("");
  const host = snapshot.siteUrl.startsWith("sc-domain:")
    ? snapshot.siteUrl.slice("sc-domain:".length)
    : (() => {
        try {
          return new URL(snapshot.siteUrl).hostname;
        } catch {
          return snapshot.siteUrl;
        }
      })();
  const data = {
    cfg: {
      checkUrl: `/c/${report.token}/check`,
      by: mode === "preview" ? "consultor" : "cliente",
    },
    comparable:
      snapshot.period.comparable && snapshot.prevTotals.impressions > 0,
    daily: snapshot.daily,
    updates: snapshot.updates.map((update) => ({
      begin: update.begin,
      end: update.end,
      label: update.label,
    })),
    checks: report.checks,
  };
  const title = `${report.title}${report.clientName ? ` · ${report.clientName}` : ""}`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title>
<style>${REPORT_CSS}</style></head>
<body>
<header class="top"><div class="wrap"><div class="brand">Carlos <b>Ortega</b><span> · SEO</span></div><nav class="nav">${menu}</nav><button class="printbtn" id="print" type="button">Imprimir / PDF</button></div></header>
<main class="wrap">
<div class="hero"><div class="eyebrow">Informe SEO${mode === "preview" ? " · vista previa" : ""}</div><h1>${esc(report.title)}</h1>
<div class="sub">${report.clientName ? `<b>${esc(report.clientName)}</b> · ` : ""}${esc(host)} · del ${day(snapshot.range.startDate)} al ${day(snapshot.range.endDate)}${snapshot.period.comparable ? ` · comparado con ${snapshot.period.compare === "year" ? "el mismo periodo del año anterior" : "el periodo anterior"}` : ""}${snapshot.scope === "sin marca" ? " · sin contar búsquedas de marca" : ""}</div></div>
${body}
<div class="foot">Informe generado el ${day(snapshot.generatedAt.slice(0, 10))} con datos de Google Search Console · Carlos Ortega</div>
</main>
<script type="application/json" id="report-data">${jsonForScript(data)}</script>
<script>${REPORT_SCRIPT}</script>
</body></html>`;
}
