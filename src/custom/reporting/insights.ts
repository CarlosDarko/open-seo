// What the numbers of a report mean once they are put side by side: instead of
// listing figures, it crosses them (clicks with impressions and position, the
// Google updates with the daily trend, segments with the total change, pages
// with the queries behind them) and says it in plain Spanish. Pure, so it can
// be tested and handed to an AI that rewrites it.
import { integer } from "@/custom/radar/format";
import type { GoogleUpdate } from "@/custom/radar/googleUpdates";
import type { DailyPoint } from "@/custom/radar/radarAnalysis";
import type { ChangeLine, ReportSnapshot } from "@/custom/reporting/types";

export type IconName =
  | "up"
  | "down"
  | "alert"
  | "target"
  | "calendar"
  | "phone"
  | "bolt"
  | "layers"
  | "star"
  | "search"
  | "shield"
  | "link";

export type Insight = {
  id: string;
  tone: "good" | "warn" | "bad" | "info";
  icon: IconName;
  title: string;
  body: string;
  stats: { label: string; value: string }[];
  /** Higher = shown earlier. */
  weight: number;
  /** The hopeful reading: what can be done or what already works. */
  upside?: string;
};

export type UpdateImpact = {
  update: GoogleUpdate;
  /** Average clicks per day in the 14 days before, during, and 14 days after. */
  before: number | null;
  during: number | null;
  after: number | null;
  verdict: string;
};

export type WeekdayStat = { label: string; average: number; days: number };

export type Contribution = {
  title: string;
  rows: { label: string; delta: number }[];
};

const DAY_MS = 86_400_000;
const one = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const num = (value: number) => integer.format(Math.round(value));
const pct = (value: number) => `${one.format(Math.abs(value) * 100)} %`;
const signed = (value: number) =>
  `${value >= 0 ? "+" : "−"}${num(Math.abs(value))}`;
const signedPct = (value: number) =>
  `${value >= 0 ? "+" : "−"}${one.format(Math.abs(value) * 100)} %`;

const change = (now: number, before: number): number | null =>
  before > 0 ? (now - before) / before : null;

const CAUSE: Record<string, string> = {
  posicion: "ha perdido posición",
  demanda: "se busca menos ese tema",
  ctr: "su título atrae menos clics",
  mixto: "hay varias causas a la vez",
  nueva: "es una página nueva",
  perdida: "ya no recibe clics",
};

export function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search || "/";
  } catch {
    return url;
  }
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function averageClicks(
  daily: DailyPoint[],
  from: string,
  to: string,
  minDays: number,
): number | null {
  const rows = daily.filter((point) => point.date >= from && point.date <= to);
  if (rows.length < minDays) return null;
  return rows.reduce((sum, point) => sum + point.clicks, 0) / rows.length;
}

/** How the daily clicks behaved before, during and after each Google update. */
export function updateImpacts(snapshot: ReportSnapshot): UpdateImpact[] {
  const { daily } = snapshot;
  if (daily.length < 8) return [];
  const last = daily[daily.length - 1].date;
  return snapshot.updates.map((update) => {
    const begin = Date.parse(`${update.begin}T12:00:00Z`);
    const end = update.end ?? last;
    const before = averageClicks(
      daily,
      isoDay(begin - 14 * DAY_MS),
      isoDay(begin - DAY_MS),
      5,
    );
    const during = averageClicks(
      daily,
      update.begin,
      end < last ? end : last,
      3,
    );
    const after =
      update.end && update.end < last
        ? averageClicks(
            daily,
            isoDay(Date.parse(`${update.end}T12:00:00Z`) + DAY_MS),
            isoDay(Date.parse(`${update.end}T12:00:00Z`) + 14 * DAY_MS),
            3,
          )
        : null;

    let verdict =
      "No hay suficientes días antes del cambio para medir su efecto.";
    if (before !== null && during !== null) {
      const delta = change(during, before);
      if (delta === null || Math.abs(delta) < 0.07) {
        verdict =
          "Durante el despliegue tus clics no se movieron de forma clara.";
      } else if (delta < 0) {
        verdict = `Durante el despliegue tus clics diarios bajaron un ${pct(delta)} (${num(before)} → ${num(during)} al día).`;
      } else {
        verdict = `Durante el despliegue tus clics diarios subieron un ${pct(delta)} (${num(before)} → ${num(during)} al día).`;
      }
      if (after !== null) {
        const back = change(after, before);
        if (back !== null && delta !== null && delta < -0.07) {
          verdict +=
            back >= -0.05
              ? " Después te has recuperado hasta el nivel anterior."
              : ` Después sigues un ${pct(back)} por debajo del nivel anterior.`;
        } else if (back !== null && delta !== null && delta > 0.07) {
          verdict +=
            back >= 0.03
              ? " Y la mejora se ha mantenido."
              : " Pero la mejora no se ha mantenido.";
        }
      }
    }
    return { update, before, during, after, verdict };
  });
}

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** Average clicks per day of the week, Monday first. */
export function weekdayStats(daily: DailyPoint[]): WeekdayStat[] {
  const sums = WEEKDAYS.map(() => ({ total: 0, days: 0 }));
  for (const point of daily) {
    const day = new Date(`${point.date}T12:00:00Z`).getUTCDay();
    const slot = sums[(day + 6) % 7];
    slot.total += point.clicks;
    slot.days += 1;
  }
  return WEEKDAYS.map((label, index) => ({
    label,
    average: sums[index].days > 0 ? sums[index].total / sums[index].days : 0,
    days: sums[index].days,
  }));
}

/** Where the net change in clicks comes from, by segment. */
export function contributions(snapshot: ReportSnapshot): Contribution[] {
  if (!snapshot.period.comparable) return [];
  const out: Contribution[] = [];
  const add = (
    title: string,
    rows: { label: string; clicks: number; prevClicks: number }[],
  ) => {
    if (rows.length < 2) return;
    out.push({
      title,
      rows: rows
        .map((row) => ({
          label: row.label,
          delta: row.clicks - row.prevClicks,
        }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 6),
    });
  };
  add("Por tipo de página", snapshot.segments.pageType);
  add("Por dispositivo", snapshot.segments.device);
  if (snapshot.brand.hasBrand) {
    add("Marca y no marca", [
      {
        label: "Búsquedas de marca",
        clicks: snapshot.brand.clicks,
        prevClicks: snapshot.brand.prevClicks,
      },
      {
        label: "Resto de búsquedas",
        clicks: snapshot.brand.otherClicks,
        prevClicks: snapshot.brand.prevOtherClicks,
      },
    ]);
  }
  return out;
}

function trafficInsight(snapshot: ReportSnapshot): Insight | null {
  const { totals, prevTotals } = snapshot;
  if (!snapshot.period.comparable || prevTotals.impressions <= 0) return null;
  const clicks = change(totals.clicks, prevTotals.clicks) ?? 0;
  const impressions = change(totals.impressions, prevTotals.impressions) ?? 0;
  const positionDiff = prevTotals.position - totals.position;
  const stats = [
    { label: "Clics", value: signedPct(clicks) },
    { label: "Impresiones", value: signedPct(impressions) },
    {
      label: "Posición media",
      value: `${one.format(prevTotals.position)} → ${one.format(totals.position)}`,
    },
  ];
  const base = { id: "traffic", icon: "up" as IconName, stats };
  if (clicks >= 0.05 && impressions >= 0.05) {
    return {
      ...base,
      tone: "good",
      weight: 90,
      title: "Crecimiento sano: Google te enseña más y te clican más",
      body: `Las impresiones suben un ${pct(impressions)} y los clics un ${pct(clicks)}. ${positionDiff >= 0.3 ? "Además tu posición media mejora, así que el avance viene de posicionar mejor, no solo de que se busque más." : "La posición se mantiene, así que el empuje viene sobre todo de más demanda o de más búsquedas en las que apareces."}`,
    };
  }
  if (clicks >= 0.05) {
    return {
      ...base,
      tone: "good",
      weight: 85,
      title: "Más clics sin necesitar más visibilidad",
      body: `Los clics suben un ${pct(clicks)} con impresiones casi iguales: la gente que ya te veía ahora te elige más. Señal de que tus títulos y descripciones funcionan mejor o de que subes posiciones en búsquedas clave.`,
    };
  }
  if (clicks <= -0.05 && impressions >= 0.03) {
    return {
      ...base,
      icon: "alert",
      tone: "warn",
      weight: 95,
      title: "Te ven igual o más, pero te clican menos",
      body: `Las impresiones ${impressions > 0 ? `suben un ${pct(impressions)}` : "se mantienen"} y los clics bajan un ${pct(clicks)}. Suele indicar un problema de atractivo del resultado (título, descripción) o que Google muestra por encima respuestas de IA, vídeos o recuadros que se llevan el clic.`,
    };
  }
  if (clicks <= -0.05 && positionDiff <= -0.3) {
    return {
      ...base,
      icon: "down",
      tone: "bad",
      weight: 100,
      title: "Pierdes tráfico porque pierdes posiciones",
      body: `Los clics bajan un ${pct(clicks)} y las impresiones un ${pct(impressions)}, con la posición media empeorando de ${one.format(prevTotals.position)} a ${one.format(totals.position)}. Hay competidores pasándote o contenido que ha perdido relevancia: conviene revisar las páginas que más caen.`,
    };
  }
  if (clicks <= -0.05) {
    return {
      ...base,
      icon: "down",
      tone: Math.abs(clicks) >= 0.2 ? "bad" : "warn",
      weight: 92,
      title: "Menos búsquedas, no peor posicionamiento",
      body: `Los clics bajan un ${pct(clicks)} y las impresiones un ${pct(impressions)}, pero tu posición media apenas cambia. Lo más probable es una caída de la demanda (estacionalidad o interés del tema), no un problema técnico.`,
    };
  }
  return {
    ...base,
    tone: "info",
    weight: 50,
    title: "Periodo estable",
    body: `Clics e impresiones casi no varían (${signedPct(clicks)} y ${signedPct(impressions)}). No hay señales de alarma ni de despegue: es buen momento para invertir en las oportunidades que se detallan más abajo.`,
  };
}

function sourceInsight(snapshot: ReportSnapshot): Insight | null {
  const groups = contributions(snapshot);
  const pageType = groups.find((group) => group.title === "Por tipo de página");
  if (!pageType) return null;
  const net = pageType.rows.reduce((sum, row) => sum + row.delta, 0);
  if (Math.abs(net) < 10) return null;
  const same = pageType.rows.filter(
    (row) => Math.sign(row.delta) === Math.sign(net),
  );
  const top = same[0];
  if (!top) return null;
  const sameTotal = same.reduce((sum, row) => sum + row.delta, 0);
  const share = sameTotal !== 0 ? top.delta / sameTotal : 0;
  if (share < 0.45) return null;
  const up = net > 0;
  return {
    id: "source",
    icon: "layers",
    tone: up ? "good" : "warn",
    weight: 70,
    title: up
      ? `El crecimiento viene sobre todo de «${top.label}»`
      : `La caída se concentra en «${top.label}»`,
    body: `${pct(share)} de ${up ? "lo que has ganado" : "lo que has perdido"} sale de ese tipo de página (${signed(top.delta)} clics). ${up ? "Es donde mejor está funcionando tu estrategia: merece la pena replicarla en el resto." : "Arreglar esa zona recupera la mayor parte de la caída."}`,
    stats: pageType.rows.slice(0, 3).map((row) => ({
      label: row.label,
      value: `${signed(row.delta)} clics`,
    })),
  };
}

function pageInsight(
  row: ChangeLine | undefined,
  kind: "winner" | "loser",
): Insight | null {
  if (!row || Math.abs(row.clicksDelta) < 10) return null;
  const queries = (row.queries ?? [])
    .slice(0, 2)
    .map((item) => `«${item.query}» (${signed(item.clicksDelta)})`);
  const up = kind === "winner";
  const cause = row.cause ? CAUSE[row.cause] : undefined;
  return {
    id: kind,
    icon: up ? "star" : "alert",
    tone: up ? "good" : "bad",
    weight: up ? 66 : 88,
    title: up
      ? `${pathOf(row.key)} es tu mayor avance (${signed(row.clicksDelta)} clics)`
      : `${pathOf(row.key)} es tu mayor caída (${signed(row.clicksDelta)} clics)`,
    body: `${up ? "Pasa" : "Pasa"} de ${num(row.prevClicks)} a ${num(row.clicks)} clics.${queries.length ? ` Lo explican ${queries.join(" y ")}.` : ""}${!up && cause ? ` Causa probable: ${cause}.` : ""}${up ? " Mira qué tiene esa página (formato, enlaces, actualización) y repítelo en páginas parecidas." : " Es la primera página que revisaría."}`,
    stats: [
      {
        label: "Posición",
        value:
          row.position !== null && row.prevPosition !== null
            ? `${one.format(row.prevPosition)} → ${one.format(row.position)}`
            : "—",
      },
      { label: "Clics", value: `${num(row.prevClicks)} → ${num(row.clicks)}` },
    ],
  };
}

function updateInsight(snapshot: ReportSnapshot): Insight | null {
  const impacts = updateImpacts(snapshot).filter(
    (item) => item.before !== null && item.during !== null,
  );
  if (impacts.length === 0) return null;
  const biggest = [...impacts].sort(
    (a, b) =>
      Math.abs((b.during ?? 0) - (b.before ?? 0)) -
      Math.abs((a.during ?? 0) - (a.before ?? 0)),
  )[0];
  const delta = change(biggest.during ?? 0, biggest.before ?? 0) ?? 0;
  const relevant = Math.abs(delta) >= 0.07;
  return {
    id: "update",
    icon: "bolt",
    tone: !relevant ? "info" : delta < 0 ? "warn" : "good",
    weight: relevant ? 94 : 45,
    title: relevant
      ? `El ${biggest.update.label} coincide con un cambio en tus clics`
      : `El ${biggest.update.label} no ha alterado tu tráfico`,
    body: `${biggest.verdict} Que coincidan en fechas no prueba que sea la causa, pero sí es una pista para interpretar el resto de movimientos.`,
    stats: [
      { label: "Antes", value: `${num(biggest.before ?? 0)} clics/día` },
      { label: "Durante", value: `${num(biggest.during ?? 0)} clics/día` },
      ...(biggest.after !== null
        ? [{ label: "Después", value: `${num(biggest.after)} clics/día` }]
        : []),
    ],
  };
}

function concentrationInsight(snapshot: ReportSnapshot): Insight | null {
  const { topPages, pageClicksTotal } = snapshot;
  if (pageClicksTotal < 50 || topPages.length < 3) return null;
  const top3 = topPages.slice(0, 3).reduce((sum, page) => sum + page.clicks, 0);
  const share = top3 / pageClicksTotal;
  if (share < 0.4) {
    return {
      id: "concentration",
      icon: "shield",
      tone: "good",
      weight: 40,
      title: "Tu tráfico está bien repartido",
      body: `Tus 3 páginas principales suman el ${pct(share)} de los clics: no dependes de una sola página.`,
      stats: [{ label: "Top 3 páginas", value: pct(share) }],
    };
  }
  return {
    id: "concentration",
    icon: "shield",
    tone: share >= 0.6 ? "warn" : "info",
    weight: share >= 0.6 ? 74 : 48,
    title: `${pct(share)} de tus clics dependen de 3 páginas`,
    body: `${pathOf(topPages[0].url)} por sí sola aporta el ${pct(topPages[0].clicks / pageClicksTotal)}. ${share >= 0.6 ? "Es mucha dependencia: una caída en una de ellas se nota en todo el sitio. Conviene proteger esas páginas y trabajar otras para repartir el riesgo." : "Hay cierta dependencia; vigila que esas páginas no pierdan posiciones."}`,
    stats: topPages.slice(0, 3).map((page) => ({
      label: pathOf(page.url).slice(0, 28),
      value: `${num(page.clicks)} clics`,
    })),
  };
}

function brandInsight(snapshot: ReportSnapshot): Insight | null {
  const { brand } = snapshot;
  const total = brand.clicks + brand.otherClicks;
  if (!brand.hasBrand || total < 50) return null;
  const share = brand.clicks / total;
  const otherChange = change(brand.otherClicks, brand.prevOtherClicks);
  return {
    id: "brand",
    icon: "search",
    tone: share >= 0.5 ? "warn" : "info",
    weight: share >= 0.5 ? 68 : 42,
    title:
      share >= 0.5
        ? `${pct(share)} de tus clics son de gente que ya te conoce`
        : `${pct(1 - share)} de tus clics vienen de búsquedas sin marca`,
    body:
      share >= 0.5
        ? `Más de la mitad llega buscando tu nombre. Es tráfico valioso, pero no demuestra que Google te descubra: el SEO que capta clientes nuevos está en el resto de búsquedas${otherChange !== null ? `, que este periodo ${otherChange >= 0 ? "crecen" : "caen"} un ${pct(otherChange)}` : ""}.`
        : `La mayor parte del tráfico llega de gente que no te buscaba por nombre, que es justo el tráfico que capta clientes nuevos${otherChange !== null ? ` (${signedPct(otherChange)} frente al periodo anterior)` : ""}.`,
    stats: [
      { label: "Marca", value: `${num(brand.clicks)} clics` },
      { label: "Sin marca", value: `${num(brand.otherClicks)} clics` },
    ],
  };
}

function opportunityInsight(snapshot: ReportSnapshot): Insight | null {
  const potential = snapshot.opportunities.reduce(
    (sum, item) => sum + item.potentialClicks,
    0,
  );
  if (potential < 10) return null;
  const best = [...snapshot.opportunities].sort(
    (a, b) => b.potentialClicks - a.potentialClicks,
  )[0];
  const share =
    snapshot.totals.clicks > 0 ? potential / snapshot.totals.clicks : 0;
  return {
    id: "opportunities",
    icon: "target",
    tone: "good",
    weight: 72,
    title: `Hay unas ${num(potential)} visitas más al alcance${share >= 0.03 ? ` (+${pct(share)})` : ""}`,
    body: `Se consiguen subiendo a ${snapshot.opportunities.some((item) => item.kind === "push") ? "las primeras posiciones" : "su CTR habitual"} las búsquedas que ya te muestran. La más rentable es «${best.query}»: ${num(best.impressions)} impresiones y solo ${num(best.clicks)} clics, con posible ganancia de +${num(best.potentialClicks)}.`,
    stats: [
      { label: "Visitas posibles", value: `+${num(potential)}` },
      { label: "Búsquedas", value: `${snapshot.opportunities.length}` },
    ],
  };
}

function topThreeInsight(snapshot: ReportSnapshot): Insight | null {
  const band = snapshot.bands[0];
  if (!band || !snapshot.period.comparable) return null;
  const diff = band.queries - band.prevQueries;
  if (diff === 0 && band.queries === 0) return null;
  const names = band.entered
    .slice(0, 2)
    .map((move) => `«${move.query}»`)
    .join(" y ");
  return {
    id: "top3",
    icon: "link",
    tone: diff >= 0 ? "good" : "warn",
    weight: diff >= 3 ? 64 : 46,
    title:
      diff > 0
        ? `${diff} ${diff === 1 ? "búsqueda más" : "búsquedas más"} en el top 3`
        : diff < 0
          ? `${Math.abs(diff)} ${Math.abs(diff) === 1 ? "búsqueda sale" : "búsquedas salen"} del top 3`
          : "El top 3 se mantiene",
    body: `Ahora tienes ${num(band.queries)} búsquedas en las 3 primeras posiciones (antes ${num(band.prevQueries)}), que traen ${num(band.clicks)} clics.${names && diff > 0 ? ` Entran, por ejemplo, ${names}.` : ""} El top 3 es donde está la mayor parte de los clics.`,
    stats: [
      { label: "Ahora", value: `${num(band.queries)}` },
      { label: "Antes", value: `${num(band.prevQueries)}` },
    ],
  };
}

function weekdayInsight(snapshot: ReportSnapshot): Insight | null {
  if (snapshot.daily.length < 21) return null;
  const stats = weekdayStats(snapshot.daily).filter((item) => item.days >= 3);
  if (stats.length < 5) return null;
  const sorted = [...stats].sort((a, b) => b.average - a.average);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (worst.average <= 0 || best.average / worst.average < 1.25) return null;
  return {
    id: "weekday",
    icon: "calendar",
    tone: "info",
    weight: 38,
    title: `Tu mejor día es ${best.label === "Sáb" ? "el sábado" : best.label === "Dom" ? "el domingo" : `el ${best.label.toLowerCase()}`}`,
    body: `Recibes de media ${num(best.average)} clics ese día frente a ${num(worst.average)} los ${worst.label === "Sáb" ? "sábados" : worst.label === "Dom" ? "domingos" : `${worst.label.toLowerCase()}`}: ${one.format(best.average / worst.average)} veces más. Publica y actualiza contenido antes de tus días fuertes.`,
    stats: [
      { label: "Mejor día", value: `${best.label} · ${num(best.average)}` },
      { label: "Peor día", value: `${worst.label} · ${num(worst.average)}` },
    ],
  };
}

function deviceInsight(snapshot: ReportSnapshot): Insight | null {
  const mobile = snapshot.segments.device.find(
    (item) => item.label === "Móvil",
  );
  if (!mobile || mobile.share < 0.65) return null;
  const delta = change(mobile.clicks, mobile.prevClicks);
  return {
    id: "mobile",
    icon: "phone",
    tone: "info",
    weight: 36,
    title: `${pct(mobile.share)} de tus clics llegan desde el móvil`,
    body: `La experiencia móvil es la que decide tu resultado${delta !== null ? ` (clics en móvil: ${signedPct(delta)})` : ""}. Cualquier problema de velocidad o de diseño en pantallas pequeñas te cuesta tráfico directamente.`,
    stats: [{ label: "Móvil", value: pct(mobile.share) }],
  };
}

function queriesInsight(snapshot: ReportSnapshot): Insight | null {
  if (!snapshot.period.comparable || snapshot.newQueries < 5) return null;
  return {
    id: "queries",
    icon: "search",
    tone: snapshot.newQueries >= snapshot.lostQueries ? "good" : "info",
    weight: 44,
    title: `${num(snapshot.newQueries)} búsquedas nuevas te muestran por primera vez`,
    body: `Han aparecido ${num(snapshot.newQueries)} búsquedas con impresiones que antes no tenías y se han perdido ${num(snapshot.lostQueries)}. Es una buena señal de que Google amplía los temas en los que te considera relevante.`,
    stats: [
      { label: "Nuevas", value: `${num(snapshot.newQueries)}` },
      { label: "Perdidas", value: `${num(snapshot.lostQueries)}` },
    ],
  };
}

function topicInsight(snapshot: ReportSnapshot): Insight | null {
  const topics = snapshot.topics.filter((topic) => topic.clicks > 0);
  if (topics.length < 2) return null;
  const growing = [...topics]
    .map((topic) => ({ topic, delta: topic.clicks - topic.prevClicks }))
    .sort((a, b) => b.delta - a.delta)[0];
  const biggest = topics[0];
  const reach = [...topics].sort((a, b) => b.nearTopShare - a.nearTopShare)[0];
  const star = snapshot.period.comparable && growing.delta > 5 ? growing : null;
  return {
    id: "topics",
    icon: "layers",
    tone: star ? "good" : "info",
    weight: star ? 69 : 47,
    title: star
      ? `«${star.topic.label}» es tu tema en alza (${signed(star.delta)} clics)`
      : `«${biggest.label}» es el tema que más tráfico te da`,
    body: `${star ? `Es el tema que más crece: de ${num(star.topic.prevClicks)} a ${num(star.topic.clicks)} clics. ` : ""}Tu mayor tema por tráfico es «${biggest.label}» (${num(biggest.clicks)} clics en ${num(biggest.queries)} búsquedas)${reach && reach.label !== biggest.label && reach.nearTopShare >= 0.4 ? `; y «${reach.label}» tiene el ${pct(reach.nearTopShare)} de sus impresiones en posiciones 4 a 20, justo al alcance de subir` : ""}.`,
    stats: topics.slice(0, 3).map((topic) => ({
      label: topic.label,
      value: `${num(topic.clicks)} clics`,
    })),
  };
}

function healthInsight(snapshot: ReportSnapshot): Insight | null {
  const health = snapshot.health;
  if (!health || health.inSitemap < 5) return null;
  const covered = 1 - health.unseen / health.inSitemap;
  return {
    id: "health",
    icon: "shield",
    tone: covered >= 0.85 ? "good" : covered >= 0.6 ? "info" : "warn",
    weight: covered >= 0.85 ? 43 : 60,
    title:
      covered >= 0.85
        ? `El ${pct(covered)} de tu sitemap ya aparece en Google`
        : `${num(health.unseen)} páginas de tu sitemap aún no tienen visibilidad`,
    body: `Tu sitemap declara ${num(health.inSitemap)} páginas y Google ha mostrado ${num(health.inSitemap - health.unseen)} de ellas en los últimos 3 meses.${health.notInSitemap > 0 ? ` Además, ${num(health.notInSitemap)} páginas que ya reciben impresiones no están en el sitemap.` : ""}${health.sitemapErrors > 0 ? ` Search Console informa de ${num(health.sitemapErrors)} errores en los sitemaps.` : ""}`,
    stats: [
      { label: "En el sitemap", value: num(health.inSitemap) },
      { label: "Sin impresiones", value: num(health.unseen) },
    ],
  };
}

function discoverInsight(snapshot: ReportSnapshot): Insight | null {
  const discover = snapshot.discover;
  if (!discover || discover.clicks < 10) return null;
  const delta = change(discover.clicks, discover.prevClicks);
  return {
    id: "discover",
    icon: "star",
    tone: delta !== null && delta < -0.15 ? "info" : "good",
    weight: 52,
    title: `Google Discover te trae ${num(discover.clicks)} clics`,
    body: `Discover recomienda tu contenido a gente que no lo estaba buscando${delta !== null ? ` (${signedPct(delta)} frente al periodo anterior)` : ""}. Es tráfico extra sobre el de las búsquedas.`,
    stats: [{ label: "Impresiones", value: num(discover.impressions) }],
  };
}

const UPSIDE: Record<string, (tone: Insight["tone"]) => string> = {
  traffic: (tone) =>
    tone === "good"
      ? "Lo importante ahora es no tocar lo que funciona y apoyarlo con más contenido del mismo estilo."
      : "Lo bueno: tu sitio sigue siendo visible, y recuperar clics en páginas que ya conoce Google es más rápido que ganar visibilidad nueva.",
  update: (tone) =>
    tone === "warn"
      ? "Los cambios de Google son temporales y suelen corregirse reforzando la calidad del contenido; ya sabemos dónde mirar."
      : "Tu sitio ha resistido o aprovechado el cambio: buena señal de calidad a ojos de Google.",
  source: (tone) =>
    tone === "good"
      ? "Tienes una fórmula que funciona: replicarla en otras secciones es el camino más corto para seguir creciendo."
      : "Al estar concentrado, el arreglo también está concentrado: poco trabajo bien dirigido puede recuperar casi todo.",
  winner: () =>
    "Replica lo que hace bien esta página en las parecidas y el efecto se multiplica.",
  loser: () =>
    "Es recuperable: la página ya tiene historial y autoridad en Google, y basta con reforzarla para volver a subir.",
  concentration: (tone) =>
    tone === "good"
      ? "Un tráfico repartido es un tráfico seguro."
      : "Lo positivo: tienes páginas fuertes que sirven de plataforma para empujar a las demás con enlaces internos.",
  brand: () =>
    "Una marca que se busca es un activo: cada persona que te busca por nombre ya confía en ti.",
  opportunities: () =>
    "Son victorias rápidas: no hace falta crear contenido nuevo, solo mejorar lo que ya existe.",
  top3: (tone) =>
    tone === "good"
      ? "Cada búsqueda que entra al top 3 multiplica sus clics."
      : "Con ajustes puntuales de contenido y enlaces, esas búsquedas pueden volver al top 3.",
  weekday: () =>
    "Úsalo a tu favor: programa lo importante para tus días fuertes.",
  mobile: () => "Una buena experiencia móvil es ventaja competitiva inmediata.",
  queries: () =>
    "Cada búsqueda nueva es una puerta de entrada más para clientes potenciales.",
  topics: () =>
    "Saber qué temas te funcionan permite apostar por ellos con seguridad.",
  health: (tone) =>
    tone === "good"
      ? "Tu base técnica es sólida: Google encuentra y valora tus páginas."
      : "Activar esas páginas es trabajo técnico sencillo con mucho potencial de tráfico.",
  discover: () =>
    "Discover es un canal extra que no depende de que te busquen.",
};

/** The most encouraging fact of the period, always: even a hard period has
 *  something that works, and the report says it first. */
export function silverLining(snapshot: ReportSnapshot): string {
  const { totals, prevTotals } = snapshot;
  const comparable = snapshot.period.comparable && prevTotals.clicks > 0;
  const clicks = comparable
    ? (change(totals.clicks, prevTotals.clicks) ?? 0)
    : 0;
  if (clicks >= 0.05) {
    return `Tu tráfico crece: ${signed(totals.clicks - prevTotals.clicks)} clics más que en el periodo anterior.`;
  }
  const band = snapshot.bands[0];
  if (comparable && band && band.queries > band.prevQueries) {
    return `Tienes ${band.queries - band.prevQueries} búsquedas más en el top 3 que antes.`;
  }
  const winner = [...snapshot.pageWinners].sort(
    (a, b) => b.clicksDelta - a.clicksDelta,
  )[0];
  if (winner && winner.clicksDelta >= 10) {
    return `${pathOf(winner.key)} ha crecido ${signed(winner.clicksDelta)} clics: tu mejor página del periodo.`;
  }
  if (snapshot.newQueries >= 5) {
    return `Has ganado ${num(snapshot.newQueries)} búsquedas nuevas en las que antes no aparecías.`;
  }
  const potential = snapshot.opportunities.reduce(
    (sum, item) => sum + item.potentialClicks,
    0,
  );
  if (potential >= 10) {
    return `Hay unas ${num(potential)} visitas más al alcance con mejoras muy concretas.`;
  }
  return `Tu web recibió ${num(totals.clicks)} clics de Google: la base sobre la que seguir creciendo.`;
}

/** Up to three good facts to show on the cover. */
export function highlights(snapshot: ReportSnapshot): string[] {
  const out: string[] = [];
  const { totals, prevTotals } = snapshot;
  const comparable = snapshot.period.comparable && prevTotals.clicks > 0;
  if (comparable && totals.clicks > prevTotals.clicks) {
    out.push(
      `${signed(totals.clicks - prevTotals.clicks)} clics frente al periodo anterior`,
    );
  }
  if (comparable && prevTotals.position - totals.position >= 0.3) {
    out.push(
      `Posición media: de ${one.format(prevTotals.position)} a ${one.format(totals.position)}`,
    );
  }
  const band = snapshot.bands[0];
  if (comparable && band && band.queries > band.prevQueries) {
    out.push(`${band.queries - band.prevQueries} búsquedas más en el top 3`);
  }
  if (snapshot.newQueries >= 5) {
    out.push(`${num(snapshot.newQueries)} búsquedas nuevas`);
  }
  if (out.length === 0) {
    out.push(`${num(totals.impressions)} veces visible en Google`);
  }
  return out.slice(0, 3);
}

/** All the findings, most important first. */
export function buildInsights(snapshot: ReportSnapshot): Insight[] {
  const loser = [...snapshot.pageLosers].sort(
    (a, b) => a.clicksDelta - b.clicksDelta,
  )[0];
  const winner = [...snapshot.pageWinners].sort(
    (a, b) => b.clicksDelta - a.clicksDelta,
  )[0];
  const all = [
    trafficInsight(snapshot),
    updateInsight(snapshot),
    sourceInsight(snapshot),
    pageInsight(loser, "loser"),
    pageInsight(winner, "winner"),
    concentrationInsight(snapshot),
    brandInsight(snapshot),
    opportunityInsight(snapshot),
    topThreeInsight(snapshot),
    topicInsight(snapshot),
    healthInsight(snapshot),
    discoverInsight(snapshot),
    weekdayInsight(snapshot),
    deviceInsight(snapshot),
    queriesInsight(snapshot),
  ];
  return all
    .filter((item): item is Insight => item !== null)
    .map((item) => ({ ...item, upside: UPSIDE[item.id]?.(item.tone) }))
    .sort((a, b) => b.weight - a.weight);
}
