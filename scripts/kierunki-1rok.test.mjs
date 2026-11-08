// Etap 1: cache stron uczelni (scripts/uczelnia.mjs) i config/kierunki-1rok.json (scripts/kierunki-1rok.mjs). Bez sieci.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { uczelnia } from "./uczelnia.mjs";
import { zbuduj, tabela } from "./kierunki-1rok.mjs";

const TERAZ = new Date(2026, 10, 8);
const atrapa = (strony) => {
  const wolania = [];
  const fetchFn = async (url) => {
    const p = url.replace("https://x/", ""); wolania.push(p);
    return p in strony ? { ok: true, status: 200, text: async () => strony[p] } : { ok: false, status: 404, text: async () => "" };
  };
  return { fetchFn, wolania };
};

test("cache: drugi przebieg bez zapytań poza stroną startową; zmiana „Aktualizacja planu” czyści cache", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "efz-"));
  const strony = { plan: "Aktualizacja planu: 01.11.2026<", "planGrup?numerGrupy=C151": "strona C151" };
  const a = atrapa(strony);
  const opt = { dir, fetchFn: a.fetchFn, pauzaMs: 0, base: "https://x/" };
  let get = uczelnia(opt);
  assert.equal(await get("planGrup?numerGrupy=C151"), "strona C151");
  assert.equal(await get("planGrup?numerGrupy=BRAK"), null);
  assert.deepEqual(a.wolania, ["plan", "planGrup?numerGrupy=C151", "planGrup?numerGrupy=BRAK"]);
  get = uczelnia(opt);
  assert.equal(await get("planGrup?numerGrupy=C151"), "strona C151");
  assert.equal(await get("planGrup?numerGrupy=BRAK"), null);
  assert.equal(get.stat.siec, 1); assert.equal(get.stat.cache, 2);
  strony.plan = "Aktualizacja planu: 08.11.2026<"; strony["planGrup?numerGrupy=C151"] = "nowa C151";
  get = uczelnia(opt);
  assert.equal(await get("planGrup?numerGrupy=C151"), "nowa C151");
  assert.equal(await get.aktualizacja(), "08.11.2026");
});

test("config: id, nazwy PL/EN, grupy z podgrupami, kierunek bez planu", () => {
  const wyniki = [{ pelna: "Zarządzanie (Z)", nazwa: "Zarządzanie", skrot: "Z", stopien: 1, rok: 1, grupy: ["C151", "C152"],
    podgrupy: { C151: ["A", "B"], C152: [] }, zrodlo: "plan kierunku" }];
  const bez = [{ pelna: "Logistyka (L)", nazwa: "Logistyka", skrot: "L", stopien: 1, rok: 1 }];
  const cfg = zbuduj(wyniki, bez, { en: { "Zarządzanie": "Management" }, teraz: TERAZ });
  assert.deepEqual(cfg.kierunki.map((k) => [k.id, k.kod, k.en, k.maPlan]),
    [["wefiz-log-1-st-2026", "log26", null, false], ["wefiz-zarz-1-st-2026", "zarz26", "Management", true]]);
  assert.deepEqual(cfg.kierunki[1].grupy, [{ nazwa: "C151", podgrupy: ["A", "B"] }, { nazwa: "C152", podgrupy: [] }]);
  assert.equal(cfg.kierunki[1].system.nazwa, "Zarządzanie (Z)");
  assert.match(tabela(cfg), /\| Zarządzanie \(Z\) \| `wefiz-zarz-1-st-2026` \| C151 A\/B, C152 \| tak \|/);
});
