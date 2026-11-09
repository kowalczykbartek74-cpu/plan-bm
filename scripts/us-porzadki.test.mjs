// Porządki nazw zajęć US (scripts/us/porzadki.mjs) – przypadki z przeglądu wszystkich planów 9.11.2026.
import test from "node:test";
import assert from "node:assert/strict";
import { porzadkujWpis, porzadkujGroups } from "./us/porzadki.mjs";

const p = (pl, k = "X") => { const e = porzadkujWpis({ d: 0, time: ["08:15", "09:45"], pl, k, p: "", r: "" }); return [e.pl, e.k, e.n || ""]; };

test("dopiski, adresy i godziny z nazwy → notka; nic nie ginie", () => {
  assert.deepEqual(p("Wychowanie fizyczne [30h] Akademickie Centrum Wychowania Fizycznego i Sportu https://swfis.usz.edu.pl/"), ["Wychowanie fizyczne", "CW", "szczegóły: https://swfis.usz.edu.pl/"]);
  assert.deepEqual(p("Wykład ogólnouczelniany [15h]* I lub II połowa semestru (w zależności od wybranego przedmiotu)"), ["Wykład ogólnouczelniany", "W", "I lub II połowa semestru (w zależności od wybranego przedmiotu)"]);
  assert.deepEqual(p("Wykład z dziedziny nauk humanistycznych (wykaz wykładów dostępny jest na stronie: https://wpia.usz.edu.pl/rozklady-zajec/)")[2], "wykaz: https://wpia.usz.edu.pl/rozklady-zajec/");
  assert.deepEqual(p("wychowanie fizyczne Uwaga wyjątkowo 12:00 – 13:00 odbędzie się szkolenie z obrony cywilnej"), ["Wychowanie fizyczne", "CW", "Uwaga wyjątkowo 12:00 – 13:00 odbędzie się szkolenie z obrony cywilnej"]);
  assert.deepEqual(p("22.10. godz. 12:00 szkolenie z obrony cywilnej Aula I p. ul. Wielkopolska 15")[0], "Szkolenie z obrony cywilnej");
  assert.deepEqual(p("ekonomia godz. 9.00-egzamin").slice(0, 2), ["Ekonomia – egzamin", "X"]);
  assert.deepEqual(p("9:00-12:00 Water chemistry Water chemistry"), ["Water chemistry", "X", "9:00-12:00"]);
  assert.deepEqual(p("2.12 do 9.00 praktyczna nauka języka niemieckiego – kurs podstawowy").slice(0, 2), ["Praktyczna nauka języka niemieckiego – kurs podstawowy", "CW"]);
  assert.deepEqual(p("Chemia ogólna i analityczna w/15h]")[0], "Chemia ogólna i analityczna");
  assert.deepEqual(p("DNI ADAPTACYJNE")[0], "Dni adaptacyjne");
  assert.deepEqual(p("seminarium dyplomowe (20h)").slice(0, 2), ["Seminarium dyplomowe", "S"]);
  assert.deepEqual(p("Historia prawa"), ["Historia prawa", "X", ""], "bez zmian, rodzaj nieznany zostaje X");
  assert.deepEqual(p("PNJA: Fonetyka", "LAB"), ["PNJA: Fonetyka", "LAB", ""]);
});

test("grupa z przodu nazwy → pg; resztka komórki (sam prowadzący) przy innych zajęciach znika, sama zostaje", () => {
  const e = porzadkujWpis({ d: 1, time: ["10:00", "11:30"], pl: "1 gr lab: Metodyka pracy opiekuńczo-wychowawczej", k: "LAB" });
  assert.deepEqual([e.pl, e.pg], ["Metodyka pracy opiekuńczo-wychowawczej", "lab:1"]);
  const g = { G: { odd: [
    { d: 0, time: ["08:15", "09:45"], pl: "Pedagogika specjalna", k: "W" },
    { d: 0, time: ["08:15", "09:45"], pl: "Dziaczkowska, prof. US", k: "X" },
    { d: 2, time: ["08:15", "09:45"], pl: "dr A. Kowalska", k: "X" }], even: [] } };
  assert.deepEqual(porzadkujGroups(g).G.odd.map((x) => x.pl), ["Pedagogika specjalna", "dr A. Kowalska"]);
});
