// Etap 3: adres każdego planu (#/wefiz/<kierunek>/<rok>/<grupa>) w index.html. Funkcje tras wycięte z index.html, bez przeglądarki.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { lista } from "./kierunki.mjs";

const html = fs.readFileSync("index.html", "utf8");
const kod = html.slice(html.indexOf("const kodBase"), html.indexOf("const ROUTE"));
const bm = JSON.parse(html.match(/const ROCZNIK_BM = (\{.*?\});/)[1].replace(/(\w+):/g, '"$1":'));
const ROCZNIKI = [bm, ...lista()];
const { trasa, czytajTrase } = new Function("ROCZNIKI", kod + "; return { trasa, czytajTrase };")(ROCZNIKI);

test("każdy plan (rocznik × grupa) ma własny, unikalny adres i adres prowadzi do tego planu", () => {
  const adresy = new Set();
  let planow = 0;
  for (const r of ROCZNIKI) {
    const plan = JSON.parse(fs.readFileSync(r.plik, "utf8"));
    for (const g of Object.keys(plan.groups)) {
      planow++;
      const h = trasa(r, g);
      assert.match(h, /^#\/wefiz\/[a-z]+\/[1-5]\/[a-z]\d+$/, h);
      assert.ok(!adresy.has(h), "powtórzony adres " + h); adresy.add(h);
      const t = czytajTrase(h);
      assert.strictEqual(t.r.id, r.id, h); assert.strictEqual(t.g, g, h);
    }
  }
  assert.strictEqual(adresy.size, planow);
});

test("przykłady z zadania i stare adresy", () => {
  assert.strictEqual(czytajTrase("#/wefiz/zarz/1/c151").r.id, "wefiz-zarz-1-st-2026");
  assert.strictEqual(czytajTrase("#/WEFiZ/zarz/1/C151/").g, "C151");
  assert.strictEqual(czytajTrase("#/wefiz/bm/1/c112").r.id, "wefiz-bm-1-st-2026");
  assert.strictEqual(czytajTrase("#/wefiz/zarz/1").g, null);
  for (const h of ["#en", "#parzysty", "#/wefiz/nieznany/1/c1", "#/wefiz/zarz/9/c151", ""]) assert.strictEqual(czytajTrase(h), null, h);
});

test("BM w index.html: adres #/… tylko gdy był w linku; ?k= nadal działa", () => {
  assert.match(html, /if \(isBM\(\) && !\/\^#\\\/\/\.test\(location\.hash\)\) return;/);
  assert.match(html, /new URLSearchParams\(location\.search\)\.get\("k"\)/);
});

test("ten sam kierunek I i II stopnia, kilka lat: osobne adresy i osobne pozycje w wyborze", () => {
  const rr = [
    { id: "wefiz-ek-1-st-2026", kod: "ek26", pl: "Ekonomia", rok: 1, stopien: 1, wydzial: "WEFiZ" },
    { id: "wefiz-ek-1-st-2025", kod: "ek25", pl: "Ekonomia", rok: 2, stopien: 1, wydzial: "WEFiZ" },
    { id: "wefiz-ek-2-st-2026", kod: "ekm26", pl: "Ekonomia", rok: 1, stopien: 2, wydzial: "WEFiZ" },
    { id: "wefiz-ek-2-st-2025", kod: "ekm25", pl: "Ekonomia", rok: 2, stopien: 2, wydzial: "WEFiZ" },
  ];
  const f = new Function("ROCZNIKI", kod + "; return { trasa, czytajTrase };")(rr);
  const h = rr.map((r) => f.trasa(r, "M100"));
  assert.deepStrictEqual(h, ["#/wefiz/ek/1/m100", "#/wefiz/ek/2/m100", "#/wefiz/ekm/1/m100", "#/wefiz/ekm/2/m100"]);
  rr.forEach((r, i) => assert.strictEqual(f.czytajTrase(h[i]).r.id, r.id));
  const kl = html.match(/const kluczK = (.*);/)[1];
  const kluczK = new Function("r", "return (" + kl + ")(r)");
  assert.strictEqual(new Set(rr.map(kluczK)).size, 2, "I i II stopień to dwie pozycje kierunku, lata w kroku Rok");
});
