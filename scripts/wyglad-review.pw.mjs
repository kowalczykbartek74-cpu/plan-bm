// Przegląd wyglądu planu (Playwright + axe-core): zrzuty, kontrast i cele dotyku, poziome przewijanie, błędy konsoli, link do nauki.
// Uruchom: npm i playwright axe-core (albo node_modules z innego projektu) → node scripts/wyglad-review.pw.mjs <nr rundy>
// Strony idą z lokalnego serwera statycznego (katalog repo). Dane planu się nie zmieniają: dzień z odwołanymi zajęciami
// to prawdziwy wpis z plan.json (23.10.2026), a „teraz” to zegar przeglądarki ustawiony na czwartek 19.11.2026, 10:40.
// Skrzynka dostaje podstawione odpowiedzi bazy (bez internetu, nic nie zapisuje). Wynik: docs/wyglad-review/runda-N/.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNDA = process.argv[2] || "1";
const OUT = path.join(ROOT, "docs/wyglad-review", "runda-" + RUNDA);
fs.mkdirSync(OUT, { recursive: true });
const AXE = fs.readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const TYPY = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".ics": "text/calendar", ".js": "text/javascript", ".png": "image/png" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end("brak"); }
  res.writeHead(200, { "content-type": TYPY[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const ROZM = { "360": { width: 360, height: 780 }, "375": { width: 375, height: 812 }, "1280": { width: 1280, height: 900 } };
const T_TERAZ = "2026-11-19T10:40:00", T_WOLNE = "2026-11-16T09:00:00", T_ODW = "2026-10-23T09:00:00";
const SKRZYNKA = {
  prosby: [
    { id: 3, created_at: "2026-11-15T18:20:00Z", updated_at: "2026-11-16T08:00:00Z", tresc: "Czy kolokwium z Makroekonomii może być przesunięte o tydzień? W tym samym dniu mamy dwa inne zaliczenia.", autor: null, grupa: "C112", pilnosc: 3, status: "przekazana", odpowiedz: null, ukryta: false },
    { id: 2, created_at: "2026-11-12T10:05:00Z", updated_at: "2026-11-13T09:00:00Z", tresc: "Prośba o udostępnienie slajdów z wykładu z Prawa.", autor: "Ola", grupa: "C111", pilnosc: 1, status: "odpowiedz", odpowiedz: "Slajdy są już w Teams, w zakładce Pliki.", ukryta: false },
  ],
  komentarze: [{ id: 1, created_at: "2026-11-15T19:00:00Z", prosba_id: 3, tresc: "Popieram, też mamy wtedy Analizę.", autor: "Kuba", ukryty: false }],
  reakcje: [{ prosba_id: 3, emoji: "👍", ile: 14, moja: true }, { prosba_id: 3, emoji: "🙏", ile: 5, moja: false }, { prosba_id: 2, emoji: "❤️", ile: 3, moja: false }],
};

const browser = await chromium.launch();
const raport = [];
async function strona({ nazwa, url, czas = T_TERAZ, rozmiary = ["360", "375", "1280"], motywy = ["jasny", "ciemny"], lang = "pl", ls = {}, przed, calaStrona = true, js = true }) {
  for (const r of rozmiary) for (const m of motywy) {
    const ctx = await browser.newContext({ viewport: ROZM[r], locale: lang === "en" ? "en-GB" : "pl-PL", timezoneId: "Europe/Warsaw", colorScheme: m === "ciemny" ? "dark" : "light", reducedMotion: "reduce", javaScriptEnabled: js });
    await ctx.route(/supabase\.co\/rest\/v1\//, (route) => {
      const u = route.request().url();
      const body = /\/prosby/.test(u) ? SKRZYNKA.prosby : /\/komentarze/.test(u) ? SKRZYNKA.komentarze : /reakcje_podsumowanie/.test(u) ? SKRZYNKA.reakcje : [];
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    const page = await ctx.newPage();
    const bledy = [];
    page.on("console", (msg) => { if (msg.type() === "error") bledy.push(msg.text()); });
    page.on("pageerror", (e) => bledy.push(String(e)));
    if (js) await page.clock.setFixedTime(new Date(czas));
    await page.addInitScript((d) => { try { if (!sessionStorage.getItem("ustawione")) { localStorage.clear(); for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v); sessionStorage.setItem("ustawione", "1"); } } catch (e) {} }, { "bm-lang": lang, ...ls });
    await page.goto(BASE + url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    await page.waitForTimeout(400);
    if (przed) await przed(page);
    await page.waitForTimeout(300);
    const plik = `${nazwa}-${r}-${m}${lang === "en" ? "-en" : ""}`;
    await page.screenshot({ path: path.join(OUT, plik + ".png"), fullPage: calaStrona });
    if (calaStrona && r !== "1280") await page.screenshot({ path: path.join(OUT, plik + "-ekran1.png") });
    const pomiar = await page.evaluate(() => {
      const learn = [...document.querySelectorAll("a")].filter((a) => /Zdawalni/.test(a.textContent) && /Ucz się|Study on/.test(a.textContent));
      const txt = document.body.innerText;
      return {
        poziomo: document.documentElement.scrollWidth - window.innerWidth,
        learnHref: learn.map((a) => a.getAttribute("href")),
        staryTekst: /Przenieś do Skrótu|Przejdź do Skrótu|Skrót BM ↗/.test(txt),
        skrotbmLink: [...document.querySelectorAll("a[href]")].some((a) => /skrotbm\.pl/.test(a.getAttribute("href"))),
        maleCele: [...document.querySelectorAll("button, a[href], select, summary, input")].filter((el) => {
          const b = el.getBoundingClientRect(); if (!b.width || !b.height || getComputedStyle(el).visibility === "hidden") return false;
          if (el.closest("label") || el.closest("p, li, .foot > div:not(.zapis), .dz, .dznote, .brak-planu, .tip, .muted, .hint, .help-panel .sign")) return false;   // linki w tekście (WCAG 2.5.8: wyjątek „inline”)
          return b.height < 44 || b.width < 44;
        }).map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${[...el.classList].join(".")} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)} „${(el.textContent || "").trim().slice(0, 30)}”`).slice(0, 15),
      };
    }).catch(() => ({}));
    const bledyPrzedAxe = [...bledy];   // axe przy kontraście pobiera arkusze CSS (CSP connect-src je blokuje) – to nie są błędy strony
    let axe = { violations: [] };
    if (js) {
      await page.addScriptTag({ content: AXE });
      axe = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, preload: false }));
    }
    const nar = axe.violations.map((v) => ({ id: v.id, ile: v.nodes.length, przyklady: v.nodes.slice(0, 3).map((n) => (n.failureSummary || "").split("\n").slice(1, 2).join(" ").trim() + " @ " + n.target.join(" ")) }));
    raport.push({ plik, url, czas, lang, ...pomiar, bledyKonsoli: bledyPrzedAxe, axe: nar });
    await ctx.close();
  }
}

const BM_A = { "bm-group": "C112", "bm-sub": "A" };
const rozwin = async (p) => { if (await p.isVisible("#ctlToggle") && (await p.getAttribute("#ctlToggle", "aria-expanded")) === "false") await p.click("#ctlToggle"); };
await strona({ nazwa: "bm-c112a-teraz", url: "/", ls: BM_A });
await strona({ nazwa: "bm-c112a-teraz", url: "/", ls: BM_A, lang: "en", rozmiary: ["375", "1280"], motywy: ["jasny", "ciemny"] });
await strona({ nazwa: "bm-c112a-dzis-wolne", url: "/", ls: BM_A, czas: T_WOLNE, rozmiary: ["375", "1280"] });
await strona({ nazwa: "bm-c112a-odwolane", url: "/", ls: BM_A, czas: T_ODW });
await strona({ nazwa: "zarz-c151", url: "/#/wefiz/zarz/1/c151" });
await strona({ nazwa: "ustawienia-rozwiniete", url: "/", ls: BM_A, rozmiary: ["360"], calaStrona: false, przed: rozwin });
await strona({ nazwa: "bm-tydzien-nieparzysty", url: "/", ls: BM_A, rozmiary: ["375", "1280"], przed: async (p) => { await rozwin(p); await p.click("#mode-odd"); await p.click("#ctlToggle").catch(() => {}); } });
await strona({
  nazwa: "wybor-kierunku-bez-planu", url: "/", ls: BM_A, rozmiary: ["375", "1280"], calaStrona: false,
  przed: async (p) => { await rozwin(p); const v = await p.$eval("#kier", (s) => [...s.options].find((o) => o.value.startsWith("brak|"))?.value); if (v) await p.selectOption("#kier", v); await p.$eval(".controls", (e) => e.scrollIntoView()); },
});
await strona({ nazwa: "kalendarz-okno", url: "/", ls: BM_A, rozmiary: ["375", "1280"], calaStrona: false, przed: async (p) => { await rozwin(p); await p.click("#calBtn"); } });
await strona({ nazwa: "pomoc", url: "/", ls: BM_A, rozmiary: ["375"], calaStrona: false, przed: (p) => p.click("#help summary") });
await strona({ nazwa: "skrzynka", url: "/skrzynka.html", ls: { "bm-lang": "pl" } });
await strona({ nazwa: "skrzynka", url: "/skrzynka.html", lang: "en", rozmiary: ["375"], motywy: ["jasny"] });
await strona({ nazwa: "przenies-bez-js", url: "/przenies.html", js: false, rozmiary: ["375", "1280"], calaStrona: false });

await browser.close();
server.close();

// blad-wczytywania: plan rocznika niedostępny – osobny kontekst z zablokowanym plikiem
{
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: ROZM["375"], locale: "pl-PL", colorScheme: "light" });
  const srv = http.createServer((req, res) => { if (/^\/plan\//.test(req.url)) { res.writeHead(404); return res.end(); } server.emit("request", req, res); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const page = await ctx.newPage(); await page.goto(`http://127.0.0.1:${srv.address().port}/#/wefiz/zarz/1/c151`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "blad-planu-404-375-jasny.png"), fullPage: true });
  await b.close(); srv.close();
}

const podsum = {
  runda: RUNDA, stron: raport.length,
  poziomePrzewijanie: raport.filter((x) => x.poziomo > 0).map((x) => `${x.plik}: +${x.poziomo}px`),
  bledyKonsoli: raport.filter((x) => x.bledyKonsoli?.length).map((x) => `${x.plik}: ${x.bledyKonsoli.join(" | ")}`),
  axe: raport.filter((x) => x.axe.length).map((x) => `${x.plik}: ${x.axe.map((v) => `${v.id}×${v.ile} (${v.przyklady.join("; ")})`).join(" · ")}`),
  maleCeleDotyku: raport.filter((x) => x.maleCele?.length).map((x) => `${x.plik}: ${x.maleCele.join(", ")}`),
  linkNauki: raport.filter((x) => x.learnHref).map((x) => `${x.plik}: ${JSON.stringify(x.learnHref)}`),
  linkNaukiZly: raport.filter((x) => x.learnHref && x.learnHref.some((h) => !/^https:\/\/zdawalni\.pl(\/|$)/.test(h))).map((x) => x.plik),
  staryTekstSkrotu: raport.filter((x) => x.staryTekst).map((x) => x.plik),
  linkSkrotbm: raport.filter((x) => x.skrotbmLink).map((x) => x.plik),
};
fs.writeFileSync(path.join(OUT, "raport.json"), JSON.stringify({ podsum, strony: raport }, null, 2));
const md = [`# Runda ${RUNDA} – raport automatyczny`, "", `Stron: ${podsum.stron}`, "",
  ...Object.entries(podsum).filter(([k]) => !["runda", "stron"].includes(k)).flatMap(([k, v]) => [`## ${k}`, v.length ? v.map((x) => "- " + x).join("\n") : "- brak", ""])].join("\n");
fs.writeFileSync(path.join(OUT, "raport.md"), md);
console.log(md);
