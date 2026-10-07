import { describe, expect, it } from "vitest";
import {
  mergeUpdates,
  parseHistory,
  parseIncidents,
  updatesBetween,
} from "@/custom/radar/googleUpdates";

const incident = (id: string, title: string, begin: string, end?: string) => ({
  id,
  external_desc: title,
  begin: `${begin}T10:00:00+00:00`,
  ...(end ? { end: `${end}T10:00:00+00:00` } : {}),
  uri: `incidents/${id}`,
});

describe("parseIncidents", () => {
  it("keeps ranking updates, drops outages and junk, newest first", () => {
    const updates = parseIncidents([
      incident("a", "March 2026 core update", "2026-03-27", "2026-04-08"),
      incident("b", "Serving was experiencing an issue", "2026-02-25"),
      incident("c", "September 2026 spam update", "2026-09-24"),
      { nonsense: true },
    ]);
    expect(updates.map((u) => [u.id, u.kind])).toEqual([
      ["c", "spam"],
      ["a", "core"],
    ]);
    expect(updates[1].label).toBe("Core update (marzo de 2026)");
    expect(updates[0].end).toBeNull();
    expect(updates[1].url).toBe("https://status.search.google.com/incidents/a");
  });

  it("returns nothing for something that is not a list", () => {
    expect(parseIncidents({ error: "x" })).toEqual([]);
  });
});

describe("updatesBetween", () => {
  const updates = parseIncidents([
    incident("core", "May 2026 core update", "2026-05-21", "2026-06-02"),
    incident("spam", "September 2026 spam update", "2026-09-24"),
  ]);
  it("finds the updates that overlap the days, including one still running", () => {
    expect(
      updatesBetween(updates, "2026-06-01", "2026-06-10").map((u) => u.id),
    ).toEqual(["core"]);
    expect(
      updatesBetween(updates, "2026-10-01", "2026-10-07").map((u) => u.id),
    ).toEqual(["spam"]);
    expect(updatesBetween(updates, "2026-07-01", "2026-07-31")).toEqual([]);
  });
});

describe("parseHistory and mergeUpdates", () => {
  const row = (id: string, title: string, date: string, duration: string) =>
    `<tr> <th><a href="../../incidents/${id}"> <span class="x__summary-text">${title}</span> </a></th> <td class="x__date">${date}</td> <td> <span class="x__duration-text">${duration}</span> </td> </tr>`;
  const html = `<table><thead><tr><th>Summary</th></tr></thead><tbody>${row("m", "May 2026 core update", "21 May 2026", "11 days, 21 hours")}${row("n", "Nov 2021 helper", "5 Nov 2021", "2 days")}${row("o", "November 2021 core update", "17 Nov 2021", "2 weeks")}</tbody></table>`;

  it("reads the rows of the history page", () => {
    const updates = parseHistory(html);
    expect(updates.map((u) => u.id)).toEqual(["m", "o"]);
    expect(updates[0]).toMatchObject({
      begin: "2026-05-21",
      end: "2026-06-02",
      kind: "core",
    });
    expect(updates[0].url).toBe("https://status.search.google.com/incidents/m");
  });

  it("keeps the first copy of an update that appears in both sources", () => {
    const fromJson = parseIncidents([
      incident("m", "May 2026 core update", "2026-05-21", "2026-06-03"),
    ]);
    const merged = mergeUpdates(fromJson, parseHistory(html));
    expect(merged.map((u) => u.id)).toEqual(["m", "o"]);
    expect(merged[0].end).toBe("2026-06-03");
  });
});
