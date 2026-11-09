// Etap 3 (cały US): importer WKFiZ na próbce danych aplikacji z 8.11.2026 (scripts/fixtures/wkfiz/schedule-3grupy.json:
// WF 1 rok I st., DS 3 rok I st., ZP 2 rok II st. i ERASMUS +).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { terminy, wpis, zbuduj, importuj } from "./us/wkfiz.mjs";
import { waliduj } from "./us/wspolne.mjs";

const dane = JSON.parse(fs.readFileSync(new URL("./fixtures/wkfiz/schedule-3grupy.json", import.meta.url), "utf8"));
const kierunki = JSON.parse(fs.readFileSync(new URL("../config/kierunki-us.json", import.meta.url), "utf8")).wydzialy.wkfiz.kierunki;
// zajęcia unikalne: wpis tygodniowy jest w odd i even (jak w planach WEFiZ), więc liczymy po treści
const unikalne = (g) => new Set(["odd", "even"].flatMap((w) => g[w].map((e) => JSON.stringify(e)))).size;

test("terminy: zakresy co tydzień i listy dat w różnych zapisach", () => {
  const pn = terminy("8.10-25.01.27", 0);
  assert.equal(pn[0], "2026-10-12"); assert.equal(pn.at(-1), "2027-01-25"); assert.equal(pn.length, 16);
  assert.deepEqual(terminy("5-26.10", 0), ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
  assert.deepEqual(terminy("3,10.11; 1.12; 12.01.27", 1), ["2026-11-03", "2026-11-10", "2026-12-01", "2027-01-12"]);
  assert.deepEqual(terminy("29.10; 5,12,11; 3,10.12", 3), ["2026-10-29", "2026-11-05", "2026-11-12", "2026-12-03", "2026-12-10"]);
  assert.deepEqual(terminy("7,21.10, 4,25.11, 13.01.27", 2), ["2026-10-07", "2026-10-21", "2026-11-04", "2026-11-25", "2027-01-13"]);
  assert.equal(terminy("8.10--28.01.27", 3).length, 17);
  assert.equal(terminy("5.10-14.12.26 oraz 11,18.01.27", 0).length, 13);
  assert.equal(terminy("praktyki", 0), null);
});

test("wpis: prawdziwa godzina z nazwy, podgrupa, rodzaj, sala", () => {
  const w = wpis({ subject: "8:00-9:30; teoria i metodyka lekkiej atletyki 30h, 1ćs (8.10-25.01.27)", type: "Ćwiczenia specjalistyczne", teacher: "mgr Justyna Pyrgiel",
    day: "Poniedziałek", startTime: "08:15", endTime: "09:45", room: "stadion lekkoatletyczny ul.Litewska 20" });
  assert.deepEqual(w.wpis, { d: 0, time: ["08:00", "09:30"], pl: "teoria i metodyka lekkiej atletyki", k: "CW", p: "mgr Justyna Pyrgiel", r: "stadion lekkoatletyczny ul.Litewska 20", pg: "ćs1" });
  assert.equal(w.daty.length, 16);
  const s = wpis({ subject: "seminarium magisterskie 30h, [4gr]", type: "Seminarium", teacher: "dr X,", day: "Wtorek", startTime: "10:00", endTime: "11:30", room: "sala 313" });
  assert.deepEqual([s.wpis.pg, s.wpis.k, s.wpis.p, s.wpis.r, s.daty], ["sem4", "S", "dr X", "s. 313", null]);
  const c = wpis({ subject: "kurs na wychowacę wypoczynku 20h, w (3,10,17,24.11; 1,8,15,22.12; 12,19.01.27)", type: "Wykład", day: "Wtorek", startTime: "15:15", endTime: "16:45" });
  assert.equal(c.wpis.pg, undefined, "„w” = cały rok"); assert.equal(c.daty.length, 10);
});

test("4 grupy z aplikacji (z ERASMUS +): tyle samo zajęć co w aplikacji, plan przechodzi sprawdzenie", () => {
  const { wyniki, pominiete } = zbuduj(dane, kierunki, { teraz: new Date("2026-11-08") });
  const app = {}; for (const c of dane.classes) app[c.group] = (app[c.group] || 0) + 1;
  assert.deepEqual(wyniki.map((w) => w.id).sort(), ["wkfiz-ds-1-st-2024", "wkfiz-eras-1-st-2026", "wkfiz-wf-1-st-2026", "wkfiz-zp-2-st-2025"]);
  for (const w of wyniki) {
    const g = Object.values(w.groups)[0];
    assert.equal(unikalne(g), app[w.grupaAplikacji], w.grupaAplikacji);
    assert.deepEqual(waliduj(w), [], w.id);
    assert.equal(w.source, "https://planyzajec-kfz.usz.edu.pl/index.html");
    assert.match(w.wersja, /^dane-[0-9a-f]{12}$/);
  }
  assert.ok(!pominiete.some((p) => /ERASMUS/.test(p)));
  const wf = wyniki.find((w) => w.id === "wkfiz-wf-1-st-2026");
  assert.deepEqual(Object.keys(wf.groups), ["WF1"]);
  assert.equal(wf.kod, "wf26");
  const pg = new Set(wf.groups.WF1.odd.map((e) => e.pg).filter(Boolean));
  for (const x of ["ćs1", "ćs2", "ćs3", "lb1", "lb4", "ć1", "ć3"]) assert.ok(pg.has(x), x);
  // wersja zależy tylko od treści (znacznik czasu aplikacji zmienia się przy każdym zapytaniu)
  assert.equal(zbuduj({ ...dane, timestamp: "inny" }, kierunki, { teraz: new Date("2026-11-08") }).wyniki[0].wersja, wyniki[0].wersja);
});

test("importer: kontrakt importuj.mjs, odpowiedź bez success = błąd", async () => {
  const p = (t) => ({ strona: async () => t });
  const w = await importuj({ zrodla: [], kierunki, pobieracz: p(JSON.stringify(dane)) });
  assert.equal(w.length, 4);
  await assert.rejects(importuj({ zrodla: [], kierunki, pobieracz: p('{"success":false}') }), /success=false/);
  await assert.rejects(importuj({ zrodla: [], kierunki, pobieracz: p(null) }), /nie odpowiada/);
});
