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

test("walidacja importu: pusty plan, brak grupy, spadek o ponad 30%", async () => {
  const { sprawdz } = await import("./update-plan.mjs");
  const e = (n) => ({ odd: Array(n).fill({ d: 0 }), even: [] });
  const K = { wymagane: ["C151", "C152"] };
  assert.throws(() => sprawdz(K, { C151: e(10) }, null), /Brak grupy C152/);
  assert.throws(() => sprawdz(K, { C151: e(6), C152: e(7) }, { groups: { C151: e(10), C152: e(10) } }), /spadła z 20 do 13/);
  assert.equal(sprawdz(K, { C151: e(7), C152: e(7) }, { groups: { C151: e(10), C152: e(10) } }), 14);
  assert.throws(() => sprawdz({ wymagane: [] }, {}, null), /pusty/);
});

test("roczniki: kierunki/ ma pierwszeństwo, BM i kierunki bez planu pominięte, budynek → DOS", async () => {
  const { roczniki, budynek, DOS } = await import("./roczniki.mjs");
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "rocz-"));
  fs.mkdirSync(path.join(d, "k"));
  fs.writeFileSync(path.join(d, "k/wefiz-zarz-1-st-2026.json"), JSON.stringify({ id: "wefiz-zarz-1-st-2026", opis: "skrot-bm" }));
  const k = (id, maPlan, grupy) => ({ id, kod: id.split("-")[1] + "26", kierunek: "X", pl: id, en: null, stopien: 1, rok: 1, tryb: "st", nabor: 2026,
    system: { nazwa: id + " (X)", rok: "1 rokI" }, maPlan, grupy: grupy.map((nazwa) => ({ nazwa, podgrupy: [] })) });
  fs.writeFileSync(path.join(d, "cfg.json"), JSON.stringify({ wydzial: { kod: "WEFiZ" }, kierunki: [k("wefiz-bm-1-st-2026", true, ["C111"]),
    k("wefiz-zarz-1-st-2026", true, ["C151"]), k("wefiz-log-1-st-2026", true, ["C131"]), k("wefiz-ds-1-st-2026", false, [])] }));
  const r = roczniki({ dir: path.join(d, "k"), config: path.join(d, "cfg.json") });
  assert.deepEqual(r.map((c) => [c.id, c.opis === "skrot-bm"]), [["wefiz-log-1-st-2026", false], ["wefiz-zarz-1-st-2026", true]]);
  assert.equal(r[0].plik, "plan/wefiz-log-1-st-2026.json"); assert.deepEqual(r[0].grupy, ["C131"]); assert.equal(r[0].kierunek.en, "wefiz-log-1-st-2026");
  assert.equal(budynek({ groups: { M1: { odd: [{ r: "s. 104 Mic.64" }, { r: "s. 5 Mic.64" }], even: [{ r: "s. 1 Cuk.8" }] } } }), "mic");
  assert.equal(budynek({ groups: { C1: { odd: [{ r: "s. 1 Cuk.8" }], even: [] } } }), null);
  assert.equal(budynek({ groups: { M110: { odd: [{ r: "s. S03" }, { r: "s. N203 MBA" }, { r: "s. 607" }], even: [] } } }), "mic");
  assert.equal(budynek({ groups: { C131: { odd: [{ r: "s. 607" }, { r: "s. SIL 315" }, { r: "s. N104" }], even: [] } } }), null);
  assert.match(DOS.mic, /mickiewicza/);
});
