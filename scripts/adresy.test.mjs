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
      assert.match(h, /^#\/wefiz\/[a-z]+\/1\/[a-z]\d+$/, h);
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
