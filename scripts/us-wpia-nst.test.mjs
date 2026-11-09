// Etap 7 (cały US): studia niestacjonarne WPiA (PDF, pasy piątek/sobota/niedziela, kolumny = daty zjazdów). Tekst PDF z pozycjami
// zapisany 9.11.2026 (scripts/us/pdf_tekst.py):
//   fixtures/wpia-nst/I-NSP-8.json   – Prawo, studia niestacjonarne jednolite magisterskie, I rok
//   fixtures/wpia-nst/III-NPSM.json  – Prawo służb mundurowych, niestacjonarne I st., III rok (komórki nad 1. blokiem, sala poza wydziałem)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { siatkaNst, stronaNst, zlozNst, plikNaPlanNst } from "./us/wpia-nst.mjs";
import { waliduj } from "./us/wspolne.mjs";

const wczytaj = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/wpia-nst/${f}`, import.meta.url), "utf8"));
const lista = (f) => zlozNst(wczytaj(f).strony.flatMap((s) => stronaNst(s).wpisy));
const dzien = (d) => (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7;

test("siatka: trzy pasy dni, kolumny = daty zjazdów (także „9.10.2026” bez zera), bloki 45 min", () => {
  const { pasy, ostrzezenia } = siatkaNst(wczytaj("I-NSP-8.json").strony[0]);
  assert.deepEqual(ostrzezenia, []);
  assert.deepEqual(pasy.map((p) => p.d), [4, 5, 6]);
  assert.equal(pasy[0].kolumny.length, 12);
  assert.equal(pasy[0].kolumny[1].data, "2026-10-09");
  assert.deepEqual([pasy[1].bloki[0].od, pasy[1].bloki.at(-1).do], ["08:15", "20:15"]);
});

test("Prawo nst I rok: wykłady ze skrótem [WP]/[K] = W, „WP 3”/„K 1” = ćwiczenia z grupą, daty w dniach kolumn", () => {
  const l = lista("I-NSP-8.json");
  const wyk = l.find(({ e }) => e.pl === "Wstęp do prawoznawstwa" && e.k === "W" && e.d === 4 && e.r.startsWith("s. 7-9"));
  assert.deepEqual([wyk.e.time, wyk.e.p, wyk.daty], [["17:00", "20:15"], "dr B. Kanarek, prof. US", ["2026-10-02", "2026-10-09", "2026-11-13"]]);
  assert.match(wyk.e.n, /zajęcia hybrydowe; kod MS Teams: xg89ox1/);
  const cw = l.filter(({ e }) => e.pg?.startsWith("Wstęp do prawoznawstwa:"));
  assert.deepEqual([...new Set(cw.map(({ e }) => e.pg))].sort(), ["Wstęp do prawoznawstwa:1", "Wstęp do prawoznawstwa:2", "Wstęp do prawoznawstwa:3", "Wstęp do prawoznawstwa:4"]);
  assert.ok(cw.every(({ e }) => e.k === "CW" && e.p === "mgr M. Sowa"));
  assert.ok(l.some(({ e }) => e.pg === "Prawo konstytucyjne - zasady i źródła prawa:2" && e.r === "s. 102 al. Piastów 40b"), "„Piastow” bez ó");
  assert.ok(l.every(({ e, daty }) => daty.length && daty.every((d) => dzien(d) === e.d)));
  assert.ok(l.every(({ e }) => e.pl && !/godz\.|\[|\(/.test(e.pl)));
});

test("PSM nst III rok: komórka nad pierwszym blokiem z nazwą, wykład ogólnouczelniany z wykazem w notce, sala ICKiBS", () => {
  const l = lista("III-NPSM.json");
  const tb = l.find(({ e, daty }) => e.pl === "Typologia broni" && daty.includes("2026-10-24"));
  assert.deepEqual([tb.e.time, tb.e.p, tb.e.r], [["08:15", "10:45"], "mgr W. Szelestowicz", "s. 107 ICKiBS przy ul. Krakowskiej 71/79 (strzelnica)"]);
  const wo = l.filter(({ e }) => e.pl === "Wykład z dziedziny nauk humanistycznych");
  assert.ok(wo.length && wo.every(({ e }) => e.k === "W" && /wykaz wykładów: https:\/\/wpia\.usz\.edu\.pl\/rozklady-zajec\//.test(e.n)));
  assert.ok(!l.some(({ e }) => !e.pl), "każda komórka ma nazwę");
});

test("plan z PDF: jedna grupa na rocznik, format przechodzi sprawdzenie, wszystko z datami", () => {
  for (const f of ["I-NSP-8.json", "III-NPSM.json"]) {
    const { groups, ostrzezenia, zajec } = plikNaPlanNst(null, "G1", { tekst: wczytaj(f) });
    assert.deepEqual(ostrzezenia, [], f);
    assert.ok(zajec > 40, f);
    assert.deepEqual(waliduj({ groups }), [], f);
    assert.ok(groups.G1.odd.every((e) => e.dates?.length), f);
  }
});
