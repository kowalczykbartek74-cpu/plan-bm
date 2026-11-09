// Etap 5 (cały US): parser PDF WPiA i kolejka zatwierdzeń. Tekst PDF-u z pozycjami zapisany wcześniej
// (scripts/fixtures/wpia/I-SSP-26.json = wynik scripts/us/pdf_tekst.py dla I roku Prawa, 8.11.2026), więc test nie potrzebuje Pythona.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { siatka, stronaNaZajecia, terminyWPiA, poPolsku, czesciKomorki, plikNaPlan } from "./us/wpia-pdf.mjs";
import { naPozycje, zDecyzjami, zZatwierdzonego, przezKolejke } from "./us/kolejka.mjs";
import { waliduj } from "./us/wspolne.mjs";

const tekst = JSON.parse(fs.readFileSync(new URL("./fixtures/wpia/I-SSP-26.json", import.meta.url), "utf8"));
const strona = tekst.strony[0];
const wynik = stronaNaZajecia(strona);
const znajdz = (pg, d) => wynik.wpisy.filter((w) => w.pg === pg && (d == null || w.d === d));

test("siatka: 5 dni z linii przecinających nagłówek, 14 bloków po 45 min", () => {
  const s = siatka(strona);
  assert.deepEqual(s.dni.map((d) => d.d), [0, 1, 2, 3, 4]);
  assert.equal(s.bloki.length, 14);
  assert.deepEqual([s.bloki[0].od, s.bloki.at(-1).do], ["08:15", "20:15"]);
});

test("skróty z pliku: [WP], [K] przy wykładach, legenda warsztatów", () => {
  assert.deepEqual(wynik.skroty, { LTS: "Legal Tech start", SRzS: "Sposoby radzenia ze stresem na studiach", OCiEN: "Organizacja czasu i efektywna nauka",
    WP: "Wstęp do prawoznawstwa", K: "Prawo konstytucyjne - zasady i źródła prawa" });
});

test("I rok Prawa: 92 zajęcia, każde z prowadzącym, salą i rodzajem; przypadki z pilota", () => {
  assert.equal(wynik.wpisy.length, 92);
  assert.deepEqual(wynik.ostrzezenia, []);
  assert.ok(wynik.wpisy.every((w) => w.p && w.r && w.k !== "X"), wynik.wpisy.filter((w) => !w.p || !w.r || w.k === "X").map((w) => w.pl).join("; "));
  const [lts1] = znajdz("Legal Tech start:1");
  assert.deepEqual([lts1.d, lts1.time, lts1.p, lts1.r, lts1.daty], [1, ["08:15", "10:45"], "mgr J. Cieślicki", "s. 118 al. Piastów 40b", ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"]]);
  assert.match(lts1.n, /24\.XI trwają 1 godz/);
  const [srzs5] = znajdz("Sposoby radzenia ze stresem na studiach:5");
  assert.deepEqual([srzs5.time, srzs5.p, srzs5.daty[0]], [["11:00", "13:30"], "dr M. Mikut", "2026-12-01"], "druga część komórki bierze godzinę z komórki, nie z wyjątku");
  assert.equal(znajdz("Sposoby radzenia ze stresem na studiach").length + wynik.wpisy.filter((w) => /^Sposoby/.test(w.pg || "")).length, 12);
  const k5 = znajdz("Prawo konstytucyjne - zasady i źródła prawa:5", 3)[0];
  assert.deepEqual([k5.time, k5.p, k5.daty.length], [["10:00", "11:30"], "mgr B. Boryca", 10]);
  const ocien = znajdz("Organizacja czasu i efektywna nauka:1", 2)[0];
  assert.deepEqual([ocien.time, ocien.r], [["08:15", "09:45"], "s. 118 Narutowicza"], "kolumna środowych warsztatów pocięta liniami poziomymi");
  const lac4 = znajdz("Łacińska terminologia prawnicza:4", 3)[0];
  assert.deepEqual([lac4.time, lac4.r, lac4.daty.length], [["18:45", "20:15"], "s. 222 Narutowicza", 5], "ostatnia komórka wystająca poza siatkę");
  const etos = wynik.wpisy.find((w) => /Etos/.test(w.pl) && w.d === 4);
  assert.deepEqual([etos.r, etos.daty], ["aula Wydziału Nauk Społecznych ul. Krakowska 71-79", ["2026-12-18"]]);
  const wyklad = wynik.wpisy.find((w) => w.pl === "Wstęp do prawoznawstwa" && w.d === 2 && w.k === "W");
  assert.deepEqual(wyklad.time, ["17:00", "19:30"], "„UWAGA! wykład w dn. 28.X … 17.00-20.15” to notka, nie godzina");
  assert.ok(!wynik.wpisy.some((w) => /Konsultacje/.test(w.pl)));
});

test("terminy, angielskie pliki (IEBL), podział komórki", () => {
  assert.deepEqual(terminyWPiA("warsztaty w terminach: 4.XI, 25.XI, 2.XII, 16.XII, 20.I godz. 8.15 - 9.45"), ["2026-11-04", "2026-11-25", "2026-12-02", "2026-12-16", "2027-01-20"]);
  assert.equal(terminyWPiA("wykład w terminach: co tydzień"), null);
  assert.deepEqual(terminyWPiA("konwersatorium w terminie: 18.XII"), ["2026-12-18"]);
  const en = poPolsku("Legal English (25 hours) mgr A. K. discussion class, 17.00 - 18.30 room 117 Narutowicza 7.X, 14.X, 21.X");
  assert.match(en, /\(25 godz\.\)/); assert.match(en, /ćwiczenia godz\. 17\.00 - 18\.30/); assert.match(en, /s\. 117/); assert.match(en, /w terminach: 7\.X/);
  assert.deepEqual(czesciKomorki(["godz. 8.15 - 10.45", "s. 118", "LTS (10 godz.)", "gr. 1", "godz. 11.00 - 13.30", "SRzS (10 godz.)", "gr. 1"]),
    ["godz. 8.15 - 10.45 s. 118 LTS (10 godz.) gr. 1", "godz. 11.00 - 13.30 SRzS (10 godz.) gr. 1"]);
});

test("plan z PDF: format planu (time, dates, pg) przechodzi sprawdzenie", () => {
  const { groups, zajec } = plikNaPlan(null, "PRAWO1", { tekst });
  assert.equal(zajec, 92);
  assert.deepEqual(waliduj({ groups }), []);
  assert.ok(groups.PRAWO1.odd.some((e) => e.pg === "Wstęp do prawoznawstwa:8" && e.dates?.length));
});

test("kolejka: pozycje panelu, „tak” dla niezmienionych, zatwierdzony plan tej wersji pliku trafia na stronę", async () => {
  const { groups } = plikNaPlan(null, "PRAWO1", { tekst });
  const poz = naPozycje(groups);
  assert.equal(poz.length, 92, "wpis tygodniowy w odd i even = jedna pozycja „oba”");
  assert.ok(poz.every((p) => p.tydzien === "oba" && /^\d{2}:\d{2}$/.test(p.od)));
  const zmienione = poz.map((p, i) => (i === 0 ? { ...p, r: "s. 999" } : p));
  const d = zDecyzjami(zmienione, poz);
  assert.equal(d.filter((p) => p.decyzja === "tak").length, 91);
  // zatwierdzony plan z panelu: godziny „8:15”, s = -1 (eksport importy.js) → format plan-bm
  const zPanelu = { PRAWO1: { odd: [{ d: 1, s: -1, time: ["8:15", "10:45"], pl: "Legal Tech start", k: "CW", pg: "Legal Tech start:1", dates: ["2026-11-03"] }], even: [] } };
  assert.deepEqual(zZatwierdzonego(zPanelu).PRAWO1.odd[0].time, ["08:15", "10:45"]);
  assert.ok(!("s" in zZatwierdzonego(zPanelu).PRAWO1.odd[0]));
  const r = { id: "wpia-prawo-0-st-2026", kierunek: { pl: "Prawo" }, stopien: 0, rok: 1, groups, sha256: "a".repeat(64), source: "https://wpia.usz.edu.pl/wp-content/uploads/I-SSP-26.pdf" };
  const wywolania = [];
  const baza = (odp) => async (nazwa, body) => { wywolania.push([nazwa, body]); return odp[nazwa]; };
  const ten = await przezKolejke(r, { wydzial: "WPiA", naSucho: true, fetchFn: baza({ nauka_import_plan_publiczny: { ok: true, sha: "a".repeat(64), groups: zPanelu } }) });
  assert.equal(ten.status, "zatwierdzony"); assert.equal(ten.groups.PRAWO1.odd.length, 1);
  const nowy = await przezKolejke(r, { wydzial: "WPiA", naSucho: true, token: "t".repeat(64), fetchFn: baza({ nauka_import_plan_publiczny: { ok: true, sha: "b".repeat(64), groups: zPanelu } }) });
  assert.equal(nowy.status, "czeka na zatwierdzenie"); assert.equal(nowy.doDecyzji, 92, "zatwierdzona pozycja różni się od nowej (inny prowadzący) → do decyzji");
  assert.ok(nowy.poprzedni, "na stronie zostaje poprzedni zatwierdzony plan");
  assert.ok(!wywolania.some(([n]) => n === "nauka_import_szkic_automat"), "na sucho nic nie wysyła");
  const wysl = await przezKolejke(r, { wydzial: "WPiA", katalog: fs.mkdtempSync("/tmp/szkice-"), token: "t".repeat(64), fetchFn: baza({ nauka_import_plan_publiczny: { ok: false }, nauka_import_szkic_automat: { ok: true, id: "x" } }) });
  assert.equal(wysl.wyslany, true);
  const [, body] = wywolania.find(([n]) => n === "nauka_import_szkic_automat");
  assert.equal(body.p_rocznik, "wpia-prawo-0-st-2026"); assert.equal(body.p_pozycje.length, 92); assert.equal(body.p_wydzial, "WPiA");
  // sekret wklejony ze spacją / nową linią / w cudzysłowie → do bazy idzie sam token
  wywolania.length = 0;
  await przezKolejke(r, { wydzial: "WPiA", katalog: fs.mkdtempSync("/tmp/szkice-"), token: ` "${"t".repeat(64)}"\n`, fetchFn: baza({ nauka_import_plan_publiczny: { ok: false }, nauka_import_szkic_automat: { ok: true, id: "y" } }) });
  assert.equal(wywolania.find(([n]) => n === "nauka_import_szkic_automat")[1].p_token, "t".repeat(64));
});
