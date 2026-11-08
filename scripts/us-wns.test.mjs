// Etap 5 (cały US): parser PDF Wydziału Nauk Społecznych. Tekst PDF-ów z pozycjami zapisany wcześniej (scripts/us/pdf_tekst.py, 9.11.2026):
//   fixtures/wns/SOC-1-25.json       – Socjologia I st. 1 rok (układ A: dni w kolumnach, pilot), obie strony
//   fixtures/wns/BN-I-62-s1-2.json   – Bezpieczeństwo narodowe I st., strony 1–2 (układ B: tabela na dzień, kilka roczników)
//   fixtures/wns/Psych-I-3-1-s1.json – Psychologia 1 rok, strona 1 (układ B z kolumną „lab”)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { plikNaWpisy, plikNaPlany, terminyWNS, salaWNS, etykieta } from "./us/wns-pdf.mjs";
import { waliduj } from "./us/wspolne.mjs";

const sem = { od: "2026-10-01", do: "2027-01-31" };
const wczytaj = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/wns/${f}`, import.meta.url), "utf8"));
const znajdz = (wpisy, pl, d, pg) => wpisy.filter((w) => w.pl === pl && (d == null || w.d === d) && (pg === undefined || (w.pg || null) === pg));

test("terminy po rzymsku: zakresy, listy, „Tylko”, „From … (without …)”, data w inny dzień", () => {
  assert.deepEqual(terminyWNS("Od 6X do 24 XI (24XI w godz. 8.15-9.00)", 1, sem).daty, ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27", "2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"]);
  assert.deepEqual(terminyWNS("5,12,19 X; 7,14 XII; 11,18 I", 0, sem).daty, ["2026-10-05", "2026-10-12", "2026-10-19", "2026-12-07", "2026-12-14", "2027-01-11", "2027-01-18"]);
  assert.deepEqual(terminyWNS("Tylko 9X", 4, sem).daty, ["2026-10-09"]);
  assert.deepEqual(terminyWNS("From 8X to 26 XI (without 15X)", 3, sem).daty.slice(0, 2), ["2026-10-08", "2026-10-22"]);
  const z = terminyWNS("od 2XII do 27I, 29I -pierwsze zajęcia w godz. 10.45-11.30", 2, sem);
  assert.equal(z.daty.length, 9); assert.deepEqual(z.inne, ["2027-01-29"], "piątek z planem środy → notka");
  assert.equal(terminyWNS("", 0, sem).daty, null, "brak terminów = co tydzień");
});

test("sala z budynkiem K/O i inne zapisy sal", () => {
  assert.equal(salaWNS("s. 40/O"), "s. 40 ul. Ogińskiego 16-17");
  assert.equal(salaWNS("s. 010/K i s. 009/K"), "s. 010, 009 ul. Krakowska 71-79");
  assert.equal(salaWNS("53/O"), "s. 53 ul. Ogińskiego 16-17");
  assert.equal(salaWNS("s. 106/Mickiewicza 18, bud WNŚiP"), "s. 106 ul. Mickiewicza 18");
  assert.equal(salaWNS("sala 07 H"), "s. 07H");
  assert.equal(salaWNS("S. 117"), "s. 117");
  assert.deepEqual([etykieta("BN-SI.26-11"), etykieta("PSYC-SJM.261-L.3"), etykieta("1 BP"), etykieta("2 ćw")],
    [{ typ: "gr", nr: "11" }, { typ: "lab", nr: "3" }, { typ: "spec", nr: "BP" }, { typ: "ćw", nr: "2" }]);
});

test("Socjologia I st. 1 rok (układ A, pilot): 13 zajęć, grupy z kolumn, godziny z komórki, druga strona", () => {
  const { wpisy, ostrzezenia } = plikNaWpisy(wczytaj("SOC-1-25.json"), { lata: [1], sem });
  assert.deepEqual(ostrzezenia, []);
  assert.equal(wpisy.length, 13);
  assert.ok(wpisy.every((w) => w.p && w.r && w.k !== "X" && w.rok === 1));
  const [pods] = znajdz(wpisy, "Podstawy socjologii", 0, null);
  assert.deepEqual([pods.time, pods.k, pods.p, pods.r], [["09:00", "11:30"], "W", "prof. A. Kołodziej-Durnaś", "s. 117"], "„Godz. 9.00-11.30” zamiast bloku 8.15");
  const [kom2] = znajdz(wpisy, "Socjologia komunikacji", 1, "gr:2");
  assert.deepEqual([kom2.time, kom2.k, kom2.daty.length, kom2.n], [["10:00", "11:30"], "K", 8, "24XI w godz. 10.00-10.45"]);
  assert.deepEqual(znajdz(wpisy, "Podstawy socjologii", 1).map((w) => [w.pg, w.time.join("-")]).sort(), [["gr:1", "10:00-12:15"], ["gr:2", "12:30-14:45"]]);
  const [ant] = znajdz(wpisy, "Antropologia kulturowa", 4);
  assert.deepEqual([ant.time, ant.p, ant.daty], [["10:00", "13:15"], "dr N. Maksymowicz Mróz", ["2026-10-09"]]);
  const [owi] = znajdz(wpisy, "Ochrona własności intelektualnej", 0);
  assert.deepEqual([owi.time, owi.daty], [["17:00", "20:15"], ["2026-10-19", "2026-10-26"]], "strona 2 bez nagłówka dni");
  assert.equal(znajdz(wpisy, "Historia społeczno-gospodarcza").length, 1);
  assert.ok(!wpisy.some((w) => /konsultacje/i.test(w.pl)));
});

test("Bezpieczeństwo narodowe (układ B): roczniki z kolumny „Rok”, specjalności i grupy z wierszy, „ostatnie zajęcia” w notce", () => {
  const { wpisy, ostrzezenia } = plikNaWpisy(wczytaj("BN-I-62-s1-2.json"), { lata: [1, 2, 3], sem });
  assert.deepEqual(ostrzezenia, []);
  assert.equal(wpisy.length, 19);
  const [cyb] = znajdz(wpisy, "Bezpieczeństwo w cyberprzestrzeni", 0, "spec:BP").filter((w) => w.k === "W");
  assert.deepEqual([cyb.rok, cyb.time, cyb.p, cyb.r, cyb.daty.length, cyb.n], [2, ["08:15", "09:45"], "dr inż. P. Ogonowski", "s. 239", 10, "pierwsze zajęcia w godz. 9.00-9.45"]);
  const [niem] = znajdz(wpisy, "Język niemiecki", 0);
  assert.deepEqual([niem.rok, niem.pg, niem.k, niem.daty.length], [2, undefined, "CW", 18], "komórka przez obie specjalności = cały rok");
  assert.equal(znajdz(wpisy, "Wychowanie fizyczne", 0)[0].time.join("-"), "15:15-18:30");
  const geo = znajdz(wpisy, "Geografia bezpieczeństwa", 1)[0];
  assert.deepEqual([geo.rok, geo.time, geo.pg], [1, ["08:15", "09:45"], undefined]);
  assert.deepEqual(znajdz(wpisy, "Psychologia bezpieczeństwa", 1).filter((w) => w.k === "CW").map((w) => w.pg).sort(), ["gr:11", "gr:12", "gr:13"]);
  assert.ok(!wpisy.some((w) => w.rok === 3 && w.d === 1), "„Wtorek” nad tabelą I roku nie jest zajęciami III roku");
});

test("Psychologia 1 rok: kolumna „lab” → podgrupy lab:N, grupa ćwiczeniowa → gr:NN", () => {
  const { wpisy } = plikNaWpisy(wczytaj("Psych-I-3-1-s1.json"), { lata: [1], sem });
  const bio = znajdz(wpisy, "Biologiczne podstawy zachowań", 0).filter((w) => w.k === "CW");
  assert.deepEqual(bio.map((w) => `${w.pg} ${w.time.join("-")}`).sort(), ["gr:11 08:15-11:30", "gr:12 11:45-15:00", "gr:13 13:30-15:00", "gr:14 11:45-13:15"]);
  const b11 = bio.find((w) => w.pg === "gr:11");
  assert.deepEqual([b11.daty.length, b11.r], [7, "s. 21H"]); assert.match(b11.n, /6 X \(wtorek\)/);
  assert.deepEqual(znajdz(wpisy, "Psychologia rozwoju człowieka w cyklu życia", 0).map((w) => w.pg).sort(), ["lab:1", "lab:2", "lab:3", "lab:4"]);
});

test("plan z PDF: jeden plik → plan na rocznik, format planu przechodzi sprawdzenie", () => {
  const { lata } = plikNaPlany(null, { kod: "BN", lata: [1, 2, 3], sem, tekst: wczytaj("BN-I-62-s1-2.json") });
  assert.deepEqual(Object.keys(lata).sort(), ["1", "2", "3"]);
  for (const r of Object.values(lata)) assert.deepEqual(waliduj({ groups: r.groups }), []);
  assert.ok(lata[2].groups.BN2.odd.some((e) => e.pg === "spec:WiBM" && e.dates?.length));
});
