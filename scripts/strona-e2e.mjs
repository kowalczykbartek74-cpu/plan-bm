// Etap 8: sprawdzenie strony w przeglądarce (Playwright, Chromium): PL i EN, szerokość 375 i 1280, konsola bez błędów,
// bez poziomego przewijania, tytuł i karty dni. Próbka roczników: BM, WEFiZ st/nst, WKFiZ nst, WH st/nst + stan.html.
// Playwright nie jest zależnością repozytorium – bierzemy go z innego projektu na tym Macu (albo PLAYWRIGHT_DIR):
//   PLAYWRIGHT_DIR=~/matura-app/node_modules node scripts/strona-e2e.mjs [kod …]
//   node scripts/strona-e2e.mjs --wszystkie     każdy rocznik z sitemap.xml, tylko 375 px (PL i EN)
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const katalog = process.env.PLAYWRIGHT_DIR || path.join(os.homedir(), "matura-app/node_modules");
const { chromium } = createRequire(path.join(katalog, "x.js"))("playwright");
const TYPY = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".js": "text/javascript", ".xml": "application/xml", ".txt": "text/plain", ".ics": "text/calendar", ".css": "text/css" };
const WSZYSTKIE = process.argv.includes("--wszystkie");
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const zMapy = () => [null, ...[...fs.readFileSync("sitemap.xml", "utf8").matchAll(/\?k=([^<&]+)/g)].map((m) => decodeURIComponent(m[1]))];
const PROBKA = WSZYSTKIE ? zMapy() : args.length ? args : [null, "afm26", "fir26", "firn26", "wfn26", "fan26", "fa26", "hist26"];
const SZEROKOSCI = WSZYSTKIE ? [375] : [375, 1280];

const serwer = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const f = path.join(process.cwd(), p.endsWith("/") ? p + "index.html" : p);
  if (!f.startsWith(process.cwd()) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPY[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => serwer.listen(0, "127.0.0.1", r));
const baza = `http://127.0.0.1:${serwer.address().port}/`;
const przegladarka = await chromium.launch();
const bledy = [];
let stron = 0;
try {
  const cele = [...PROBKA.map((k) => ({ k, url: k ? `${baza}?k=${k}` : baza })), { k: "stan.html", url: `${baza}stan.html` }];
  for (const { k, url } of cele) for (const jezyk of k === "stan.html" ? ["pl"] : ["pl", "en"]) for (const szer of SZEROKOSCI) {
    const ctx = await przegladarka.newContext({ viewport: { width: szer, height: 900 }, locale: jezyk === "en" ? "en-GB" : "pl-PL" });
    const s = await ctx.newPage();
    const konsola = [];
    s.on("console", (m) => { if (m.type() === "error") konsola.push(m.text()); });
    s.on("pageerror", (e) => konsola.push(String(e)));
    const opis = `${k || "BM"} ${jezyk} ${szer}px`;
    try {
      await s.goto(url + (jezyk === "en" && k !== "stan.html" ? "#en" : ""), { waitUntil: "networkidle" });
      await s.waitForTimeout(300);
      const w = await s.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, tytul: document.title, karty: document.querySelectorAll("#days > *, .day, h2").length, lang: document.documentElement.lang }));
      stron++;
      if (konsola.length) bledy.push(`${opis}: konsola – ${konsola.slice(0, 2).join(" | ")}`);
      if (w.sw > w.iw + 1) bledy.push(`${opis}: poziome przewijanie (${w.sw} > ${w.iw})`);
      if (!w.tytul) bledy.push(`${opis}: brak tytułu`);
      if (!w.karty) bledy.push(`${opis}: brak kart dni / sekcji`);
      if (k && k !== "stan.html" && !/Plan zajęć|Timetable/.test(w.tytul)) bledy.push(`${opis}: tytuł „${w.tytul}”`);
      if (k !== "stan.html" && jezyk === "en" && !/Timetable/.test(w.tytul)) bledy.push(`${opis}: strona nie przeszła na angielski („${w.tytul}”)`);
      if (!WSZYSTKIE) console.log(`${opis}: ${w.tytul} · szer. ${w.sw}/${w.iw}`);
    } catch (e) { bledy.push(`${opis}: ${e.message}`); }
    await ctx.close();
  }
} finally { await przegladarka.close(); serwer.close(); }
console.log(`\nStron: ${stron}. ${bledy.length ? "Problemy:\n- " + bledy.join("\n- ") : "Bez problemów."}`);
process.exit(bledy.length ? 1 : 0);
