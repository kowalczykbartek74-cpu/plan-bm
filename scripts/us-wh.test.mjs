// Etap 4 (cały US): importer WH (XLSX) na prawdziwych plikach pilota z 8.11.2026 (scripts/fixtures/wh/: HIST i FA „I i II st.”).
// Przypadki z docs/wh-pilot.md (10 losowych zajęć porównanych z plikiem) + zapisy terminów i godzin spotkane w plikach.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { datyZTekstu, godzinaZTekstu, grupaZTekstu, rodzajZTekstu, rozbierz, plikNaRoczniki, rocznikArkusza, arkuszNaZajecia, czesciKomorki, przedmiot } from "./us/wh-xlsx.mjs";
import { waliduj, dodaj, xlsxArkuszeDane } from "./us/wspolne.mjs";

const sem = { od: "2026-10-01", do: "2027-02-01" };
const plik = (n) => fs.readFileSync(new URL(`./fixtures/wh/${n}`, import.meta.url));
const ku = JSON.parse(fs.readFileSync(new URL("../config/kierunki-us.json", import.meta.url), "utf8")).wydzialy.wh.kierunki;
const zr = (skrot) => JSON.parse(fs.readFileSync(new URL("../config/zrodla-us.json", import.meta.url), "utf8")).wydzialy.wh.zrodla.find((z) => z.tryb === "st" && !z.pominiety && z.kierunki.some((k) => k.skrot === skrot));

test("godzina z tekstu (a nie data „12.10-16.11”)", () => {
  assert.deepEqual(godzinaZTekstu("od 8.15-10.30 I rok gr 1").time, ["08:15", "10:30"]);
  assert.deepEqual(godzinaZTekstu("wykład [ 19.00-20.30] zajęcia").time, ["19:00", "20:30"]);
  assert.deepEqual(godzinaZTekstu("19:00–20:30 ochrona").time, ["19:00", "20:30"]);
  assert.equal(godzinaZTekstu("od 12.10- 16.11..2026r."), null);
});

test("terminy z tekstu: zakresy, połowy semestru, listy z miesiącem, oprócz, pojedyncza data", () => {
  const pn = (t) => datyZTekstu(t, 0, sem);
  assert.deepEqual(pn("od 12.10- 16.11..2026r.").daty, ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]);
  assert.equal(pn("Technologie informacyjne od 30.11.26").daty[0], "2026-11-30");
  assert.equal(pn("(I poł. sem. do 30 XI. - ostatnie zajęcia 1h do godz. 10:45)").daty.at(-1), "2026-11-30");
  assert.equal(datyZTekstu("(II poł. sem. od 02 XII.- pierwsze zajęcia)", 2, sem).daty[0], "2026-12-02");
  assert.deepEqual(datyZTekstu("terminy: 01, 08,15, 22 grudnia Ochrona", 1, sem).daty, ["2026-12-01", "2026-12-08", "2026-12-15", "2026-12-22"]);
  assert.deepEqual(datyZTekstu("w dniach: 6, 13, 20 i 27 października 2026 r.", 1, sem).daty, ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"]);
  const opr = pn("PNJA: Pisanie akad. mgr Hanna Ostręga sala 201 WH oprócz 16.11").daty;
  assert.ok(opr.includes("2026-11-09") && !opr.includes("2026-11-16"));
  assert.deepEqual(datyZTekstu("odrabianie 05.11 PNJA", 3, sem).daty, ["2026-11-05"]);
  assert.equal(pn("I rok gr 8 IT (15h), (WNŚiP), sala 325*").daty, null, "„8 IT” to nie data");
});

test("grupa, rodzaj, prowadzący, sala z tekstu komórki", () => {
  assert.equal(grupaZTekstu("I rok gr lab A (30h)").pg, "lab:A");
  assert.equal(grupaZTekstu("I rok grupa ćw 2 (30h)").pg, "ćw:2");
  assert.equal(grupaZTekstu("GRUPA 1a technologia").pg, "gr:1a");
  assert.equal(grupaZTekstu("II rok specj. transl. gr specj. 2 Tłumaczenia").pg, "spec:translatoryczna 2");
  assert.deepEqual(["historia (w) (15)", "łacina (lk) (30)", "debaty (k) (15)", "PNJA: ZSJ gr lab C", "Sem. dyplomowe", "seminarium dyplomowe (s)"].map(rodzajZTekstu), ["W", "CW", "K", "LAB", "S", "S"]);
  const r = rozbierz("psychologia ogólna (w) (30) dr E. Pieńkowska al.Piastów 40b, bud. nr 4, s. 310 (WH) (zajęcia łączone z FG+FP)");
  assert.deepEqual(r.osoby, ["dr E. Pieńkowska"]); assert.deepEqual(r.sale, ["al.Piastów 40b, bud. nr 4, s. 310 (WH)"]); assert.deepEqual(r.uwagi, ["zajęcia łączone z FG+FP"]);
  assert.deepEqual(rozbierz("Pedagogika ogólna dr E, Kopaczewska sala 310 WH").osoby, ["dr E. Kopaczewska"]);
  assert.deepEqual(rozbierz("seminarium dyplomowe (s) (30) dr hab. R. Simiński gab. 079 (IH) / gab.130 (IH)").sale, ["gab. 079 (IH)", "gab.130 (IH)"]);
});

test("rocznik z nazwy arkusza i nagłówków", () => {
  const a = (n, k = {}) => rocznikArkusza({ nazwa: n, komorki: k });
  assert.deepEqual(a("Historia-II-1 "), { rok: 1, stopien: 2 });
  assert.deepEqual(a("FA III rok", { A1: "FILOLOGIA ANGIELSKA 3 rok I st. PLAN" }), { rok: 3, stopien: 1 });
  assert.deepEqual(a("FA 1 rok II st."), { rok: 1, stopien: 2 });
});

const znajdz = (rr, id, ref) => rr.roczniki.find((x) => x.r.id === id).wpisy.filter((w) => w.komorka === ref);

test("HIST: 5 arkuszy = 5 roczników, specjalności, prawdziwe godziny, sale gab.", () => {
  const rr = plikNaRoczniki(plik("HIST-I-i-II-st.xlsx"), zr("HIST"), ku, { sem });
  assert.deepEqual(rr.ostrzezenia, []);
  assert.deepEqual(rr.roczniki.map((x) => x.r.id), ["wh-hist-1-st-2026", "wh-hist-1-st-2025", "wh-hist-1-st-2024", "wh-hist-2-st-2026", "wh-hist-2-st-2025"]);
  const [b3] = znajdz(rr, "wh-hist-1-st-2026", "B3");
  assert.deepEqual([b3.d, b3.time, b3.pl, b3.k, b3.p, b3.r], [0, ["08:15", "09:45"], "wstęp do badań historycznych", "CW", "dr hab. A. Gut, prof. US", "s.073 (IH)"]);
  const [o3] = znajdz(rr, "wh-hist-1-st-2026", "O3");
  assert.equal(o3.pg, "gr:1a");
  const [b8] = znajdz(rr, "wh-hist-1-st-2025", "B8");
  assert.deepEqual([b8.time, b8.pl, b8.k], [["09:45", "11:15"], "historia nowożytna Polski", "CW"]);
  const [k24] = znajdz(rr, "wh-hist-1-st-2025", "K24");
  assert.equal(k24.pg, "spec:kpdwzn");
  const [s4] = znajdz(rr, "wh-hist-2-st-2026", "S4");
  assert.deepEqual([s4.pl, s4.k, s4.daty.at(-1)], ["historia cyfrowa", "W", "2026-11-20"]);
  assert.ok(rr.roczniki.every((x) => !x.wpisy.some((w) => /^SPECJALNOŚĆ/.test(w.pl))), "nagłówki specjalności to nie zajęcia");
  for (const x of rr.roczniki) { const g = {}; for (const { daty, komorka, tekst, ...e } of x.wpisy) dodaj(g, "H", e, { daty }); assert.deepEqual(waliduj({ groups: g }), [], x.r.id); }
});

test("FA: grupy ćw/lab/TI z nagłówków kolumn i tekstu, specjalności, terminy", () => {
  const rr = plikNaRoczniki(plik("FA-I-i-II-st.xlsx"), zr("FA"), ku, { sem });
  assert.deepEqual(rr.ostrzezenia, []);
  assert.equal(rr.roczniki.length, 5);
  const w = (id, ref) => znajdz(rr, id, ref)[0];
  assert.deepEqual([w("wh-fa-1-st-2026", "L5").pg, w("wh-fa-1-st-2026", "L5").pl, w("wh-fa-1-st-2026", "L5").r], ["lab:A", "PNJA: Fonetyka", "s. 215 WH"]);
  assert.equal(w("wh-fa-1-st-2026", "N5").pg, "ćw:2");
  assert.equal(w("wh-fa-1-st-2026", "AF30").pg, "lab:E");
  const b5 = w("wh-fa-1-st-2026", "B5");
  assert.deepEqual([b5.pg, b5.time, b5.pl, b5.daty.length], ["gr:1", ["08:15", "10:30"], "Technologie informacyjne", 6]);
  assert.equal(w("wh-fa-1-st-2026", "B20").pg, undefined, "wykład dla całego roku");
  assert.deepEqual([w("wh-fa-1-st-2025", "M11").pl, w("wh-fa-1-st-2025", "M11").pg], ["Teoria przekładu", "spec:translatoryczna"]);
  assert.equal(w("wh-fa-2-st-2025", "I11").pl, "ćwiczenia translacyjne – tłumaczenia ustne (gr lab 3)");
  const n33 = w("wh-fa-2-st-2026", "N33");
  assert.deepEqual([n33.time, n33.pg], [["17:00", "20:15"], "lab:1"]);
  const u13 = w("wh-fa-2-st-2026", "U13");
  assert.deepEqual([u13.k, u13.daty[0]], ["S", "2026-10-22"]);
});

test("plik bez nagłówków dni nie daje zajęć (ostrzeżenie zamiast zgadywania)", () => {
  const a = xlsxArkuszeDane(plik("HIST-I-i-II-st.xlsx"))[0];
  const bez = { ...a, komorki: Object.fromEntries(Object.entries(a.komorki).filter(([, v]) => !/PONIEDZIA|WTOREK|ŚRODA|CZWARTEK|PIĄTEK/.test(v))) };
  const r = arkuszNaZajecia(bez, { sem });
  assert.equal(r.wpisy.length, 0); assert.match(r.ostrzezenia[0], /brak nagłówków dni/);
});

test("pozostałe pliki WH: kilka zajęć w komórce, godziny „od … do …”, nagłówki GC i LDB, rodzaj przy godzinach", () => {
  assert.equal(czesciKomorki("seminarium dyplomowe (s) (30) prof. dr hab. A. Wątor gab.124 (IH) / dr hab. E. Krasucki, prof. US gab. 054 (IH)").length, 2);
  assert.equal(czesciKomorki("historia filozofii W-25h dr X s.227 ---------------------- zajęcia od 25.01 praktyczna nauka lb- 15h dr Y s.1").length, 2);
  assert.equal(czesciKomorki("historia lit. – średniowiecze 15h w (zajęcia w terminie: 08.10 - 26.11) historia lit. – renesans 15h w (zajęcia w terminie: 26.11 - 28.01) dr Z").length, 2);
  assert.equal(czesciKomorki("ochrona (w) dr M. Stępień s. 116 / aula").length, 1, "„/” bez drugiego prowadzącego nie dzieli");
  assert.deepEqual(godzinaZTekstu("zajęcia od 17.45 do 19.15 wykład").time, ["17:45", "19:15"]);
  assert.equal(godzinaZTekstu("od godz. 10:45 wstęp").start, "10:45");
  assert.equal(godzinaZTekstu("podstawy prawa (ć)(15) (II poł. sem. od 24 XI. - pierwsze zajęcia 1h od godz. 10:45)"), null, "godzina z dopisku o pierwszych zajęciach to nie godzina zajęć");
  assert.deepEqual(rocznikArkusza({ nazwa: "GC II rok", komorki: { A1: "Global Communication year II BA winter semester 2026/27 PONIEDZIAŁEK" } }), { rok: 2, stopien: 1 });
  assert.deepEqual(rocznikArkusza({ nazwa: "GC 1 rok II st.", komorki: { A1: "Global Communication year I MA winter semester" } }), { rok: 1, stopien: 2 });
  assert.deepEqual(rocznikArkusza({ nazwa: "LDB II", komorki: { A1: "LINGWISTYKA DLA BIZNESU I ST. 2 ROK PLAN ZAJĘĆ" } }), { rok: 2, stopien: 1 });
  assert.deepEqual(["warsztaty redakcyjne 30h ć", "rhetorics of culture 20h k", "pragmatyka językowa 30k", "Intellectual property (lecture, 8 hrs)", "technologia ćw- 15h"].map(rodzajZTekstu), ["CW", "K", "K", "W", "CW"]);
  assert.equal(grupaZTekstu("(specjalność język niemiecki w gospodarce i biznesie)").pg, "spec:język niemiecki w gospodarce i biznesie");
  assert.equal(grupaZTekstu("specjalność: kształcenie przygotowujące do zawodu nauczyciela gatunki").pg, "spec:nauczycielska");
  assert.deepEqual(rozbierz("I GC gr lab 1a (30 hr) English Phonetics dr Adriana Goldman room 214 WH").sale, ["room 214 WH"]);
  assert.equal(przedmiot("systemy kancelaryjne w Polsce (ć) (15)"), "systemy kancelaryjne w Polsce");
});

test("Etap 8: numer budynku przed datą to nie data („Wielkopolska 15 02.10 - 20.11”), rok tylko tuż po kropce", async () => {
  const { datyZTekstu } = await import("./us/wh-xlsx.mjs");
  const sem = { od: "2026-10-01", do: "2027-01-31" };
  const a = datyZTekstu("technologie informacyjne, dr F. Prątnicki, 15 ćw sala 325, Wielkopolska 15 02.10 - 20.11", 4, sem);
  assert.deepEqual([a.daty[0], a.daty.at(-1), a.daty.length], ["2026-10-02", "2026-11-20", 8]);
  const b = datyZTekstu("terminy: 30.10, 13.11, 27.11. 11.12, 18.12, 8.01, 15.01, 22.01", 4, sem);
  assert.deepEqual(b.daty, ["2026-10-30", "2026-11-13", "2026-11-27", "2026-12-11", "2026-12-18", "2027-01-08", "2027-01-15", "2027-01-22"]);
});
