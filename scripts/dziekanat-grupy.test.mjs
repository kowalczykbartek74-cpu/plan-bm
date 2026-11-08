// Etap 1 (cały US): komunikaty DOS dla wszystkich lat i II stopnia WEFiZ – grupy C/M 1xx–6xx z prawdziwych tytułów
// (próbki list DOS z 8.11.2026 w scripts/fixtures/dos/).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseList, groupsOf } from "./dziekanat.mjs";
import { roczniki, DOS } from "./roczniki.mjs";

const lista = (f, u) => parseList(fs.readFileSync(new URL(`./fixtures/dos/${f}.html`, import.meta.url), "utf8"), u).posts;

test("Cukrowa: grupy lat 2–4 i II stopnia z tytułów", () => {
  const p = lista("cukrowa", "https://dos.usz.edu.pl/cukrowa/zajecia-cukrowa/");
  const known = ["C111", "C112", "C113", "C161", "C211", "C212", "C321", "C322", "C341", "C351", "C352", "C461", "C521", "C531", "C532", "C593", "C611"];
  const trafione = new Set(p.flatMap((x) => groupsOf(x.title, known).map((g) => g.g)));
  for (const g of ["C211", "C212", "C351", "C461", "C531", "C532", "C593", "C611"]) assert.ok(trafione.has(g), g);
  assert.ok(p.filter((x) => groupsOf(x.title, known).length).length >= 17, "prawie każdy wpis Cukrowej to wpis dla grup z planu");
});

test("Mickiewicza: grupy M (dotąd zamieniane na C)", () => {
  const p = lista("mickiewicza", "https://dos.usz.edu.pl/mickiewicza/zajecia-mickiewicza/");
  const t = p.find((x) => /M150, M151/.test(x.title));
  assert.deepEqual(groupsOf(t.title, ["M150", "M151", "M160", "M240"]).map((g) => g.g), ["M150", "M151", "M160", "M240"]);
  assert.deepEqual(groupsOf("M230- odwołanie zajęć w dniu 27.10.2026 r.", ["M230", "C230"]).map((g) => g.g), ["M230"]);
});

test("BM jak dotąd; numer bez litery tylko jako grupa", () => {
  const bm = ["C111", "C112", "C113"];
  assert.deepEqual(groupsOf("GRUPA C111, C112, C113", bm).map((g) => g.g), bm);
  assert.deepEqual(groupsOf("GRUPA C112a", bm), [{ g: "C112", sub: "A" }]);
  assert.deepEqual(groupsOf("GRUPA C111, 112", bm).map((g) => g.g), ["C111", "C112"]);
  assert.deepEqual(groupsOf("GRUPA 111, 112", bm).map((g) => g.g), ["C111", "C112"]);
  assert.deepEqual(groupsOf("Zmiana sali 112 w dniu 3.11.2026", bm), []);
});

test("roczniki: grupy M → DOS Mickiewicza także dla plików kierunki/", () => {
  const d = fs.mkdtempSync("/tmp/roczniki-");
  fs.mkdirSync(`${d}/k`);
  fs.writeFileSync(`${d}/k/wefiz-tir-1-st-2025.json`, JSON.stringify({ id: "wefiz-tir-1-st-2025", grupy: ["M230"], plik: "brak.json" }));
  fs.writeFileSync(`${d}/k/wefiz-zarz-1-st-2025.json`, JSON.stringify({ id: "wefiz-zarz-1-st-2025", grupy: ["C251"], plik: "brak.json" }));
  fs.writeFileSync(`${d}/k/wefiz-x-1-st-2025.json`, JSON.stringify({ id: "wefiz-x-1-st-2025", grupy: ["M1"], dos: "https://dos.usz.edu.pl/inny/zajecia-inny/" }));
  const r = Object.fromEntries(roczniki({ dir: `${d}/k`, config: null }).map((c) => [c.id, c.dos]));
  assert.equal(r["wefiz-tir-1-st-2025"], DOS.mic);
  assert.equal(r["wefiz-zarz-1-st-2025"], undefined);
  assert.equal(r["wefiz-x-1-st-2025"], "https://dos.usz.edu.pl/inny/zajecia-inny/");
});
