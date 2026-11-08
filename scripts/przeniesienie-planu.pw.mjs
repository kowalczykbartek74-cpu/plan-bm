// Test przejścia plan.skrotbm.pl → plan.zdawalni.pl (Playwright, bez internetu: obie domeny podstawione z plików).
//   stary adres = docs/plan-skrotbm-przekierowanie/ (repo plan-skrotbm-przekierowanie), nowy = katalog główny plan-bm.
// Uruchom: npm i playwright (albo globalny) → node scripts/przeniesienie-planu.pw.mjs
// Nie ma końcówki .test.mjs, żeby `node --test scripts/*.test.mjs` (bez przeglądarki) go nie łapał.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const STARY = path.join(ROOT, "docs/plan-skrotbm-przekierowanie");
const TYPY = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".ics": "text/calendar; charset=utf-8" };

function plik(baza, url, nieMa) {
  let p = decodeURIComponent(new URL(url).pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(baza, p);
  if (f.startsWith(baza) && fs.existsSync(f) && fs.statSync(f).isFile())
    return { status: 200, body: fs.readFileSync(f), contentType: TYPY[path.extname(f)] || "application/octet-stream" };
  return nieMa ? { status: 404, body: fs.readFileSync(path.join(baza, nieMa)), contentType: TYPY[".html"] } : { status: 404, body: "brak" };
}

let ok = 0, zle = 0;
const sprawdz = (nazwa, warunek, extra = "") => { if (warunek) { ok++; console.log("  ✓", nazwa); } else { zle++; console.log("  ✗", nazwa, extra); } };

const browser = await chromium.launch({ executablePath: fs.existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined });
async function nowyKontekst() {
  const ctx = await browser.newContext({ locale: "pl-PL" });
  await ctx.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith("https://plan.skrotbm.pl/")) {
      if (new URL(u).pathname === "/ustaw.html") return route.fulfill({ status: 200, contentType: TYPY[".html"], body: "<!doctype html><title>ustaw</title>" });
      return route.fulfill(plik(STARY, u, "404.html"));
    }
    if (u.startsWith("https://plan.zdawalni.pl/")) return route.fulfill(plik(ROOT, u));
    return route.abort();
  });
  return ctx;
}
const ustawStare = async (page, dane) => {
  await page.goto("https://plan.skrotbm.pl/ustaw.html");
  await page.evaluate((d) => { localStorage.clear(); for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v); }, dane);
};
const czekajNaNowy = (page) => page.waitForURL((u) => u.host === "plan.zdawalni.pl" && !u.pathname.startsWith("/przenies"), { timeout: 15000 });
const noweDane = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));

// 1. BM: ustawienia ze starej domeny jadą na nową, obce klucze nie
{
  const ctx = await nowyKontekst(); const page = await ctx.newPage();
  await ustawStare(page, { "bm-group": "C113", "bm-sub": "B", "bm-theme": "dark", "obcy-klucz": "x" });
  await page.goto("https://plan.skrotbm.pl/");
  await czekajNaNowy(page);
  const d = await noweDane(page);
  sprawdz("1a stary adres → plan.zdawalni.pl/", page.url() === "https://plan.zdawalni.pl/", page.url());
  sprawdz("1b grupa, podgrupa i motyw przeniesione", d["bm-group"] === "C113" && d["bm-sub"] === "B" && d["bm-theme"] === "dark", JSON.stringify(d));
  sprawdz("1c obcy klucz nie przeniesiony", !("obcy-klucz" in d));
  await page.waitForFunction(() => /C113/.test(document.getElementById("title")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
  sprawdz("1d plan otwiera się na C113", /C113/.test(await page.textContent("#title")), await page.textContent("#title"));
  await ctx.close();
}
// 2. adres po # i ?k= zachowane, ustawienie z innego kierunku przeniesione
{
  const ctx = await nowyKontekst(); const page = await ctx.newPage();
  await ustawStare(page, { "plan-group:wefiz-zarz-1-st-2026": "C152", "bm-lang": "en" });
  await page.goto("https://plan.skrotbm.pl/#/wefiz/zarz/1/c151");
  await czekajNaNowy(page);
  const d = await noweDane(page);
  sprawdz("2a #/wefiz/zarz/1/c151 zachowane", new URL(page.url()).hash.toLowerCase().startsWith("#/wefiz/zarz/1/c15"), page.url());
  sprawdz("2b klucz innego kierunku i język przeniesione", d["plan-group:wefiz-zarz-1-st-2026"] && d["bm-lang"] === "en", JSON.stringify(d));
  await page.goto("https://plan.skrotbm.pl/?k=zarz26");
  await czekajNaNowy(page);
  sprawdz("2c ?k=zarz26 dochodzi do nowej strony (strona sama zamienia go na #/…)", /k=zarz26|#\/wefiz\/zarz\//.test(page.url()), page.url());
  await ctx.close();
}
// 3. nowsze ustawienie na plan.zdawalni.pl wygrywa ze starym
{
  const ctx = await nowyKontekst(); const page = await ctx.newPage();
  await page.goto("https://plan.zdawalni.pl/przenies.html"); // pusta przesyłka → otwiera /
  await page.evaluate(() => localStorage.setItem("bm-group", "C111"));
  await ustawStare(page, { "bm-group": "C113", "bm-sub": "A" });
  await page.goto("https://plan.skrotbm.pl/");
  await czekajNaNowy(page);
  const d = await noweDane(page);
  sprawdz("3a grupa z nowej domeny nienadpisana, brakujący klucz dopisany", d["bm-group"] === "C111" && d["bm-sub"] === "A", JSON.stringify(d));
  await ctx.close();
}
// 4. bez ustawień: od razu na nowy adres; skrzynka i nieznana ścieżka
{
  const ctx = await nowyKontekst(); const page = await ctx.newPage();
  await ustawStare(page, {});
  const kroki = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) kroki.push(f.url()); });
  await page.goto("https://plan.skrotbm.pl/skrzynka.html");
  await czekajNaNowy(page);
  sprawdz("4a skrzynka.html → plan.zdawalni.pl/skrzynka.html", page.url() === "https://plan.zdawalni.pl/skrzynka.html", page.url());
  sprawdz("4b bez ustawień nie przechodzi przez przenies.html", !kroki.some((u) => u.includes("przenies")), kroki.join(" "));
  await page.goto("https://plan.skrotbm.pl/cos/nieznanego");
  await page.waitForURL((u) => u.host === "plan.zdawalni.pl", { timeout: 15000 });
  sprawdz("4c nieznana ścieżka (404.html) też przekierowuje", page.url().startsWith("https://plan.zdawalni.pl/cos/nieznanego"), page.url());
  await ctx.close();
}
// 5. przenies.html nie otwiera obcej strony i nie zapisuje cudzych kluczy
{
  const ctx = await nowyKontekst(); const page = await ctx.newPage();
  const zly = Buffer.from(JSON.stringify({ "bm-group": "C112", "sb-token": "x" })).toString("base64url");
  await page.goto("https://plan.zdawalni.pl/przenies.html#d=" + zly + "&cel=" + encodeURIComponent("//zly.example.com/"));
  await page.waitForURL((u) => !u.pathname.startsWith("/przenies"), { timeout: 15000 });
  const d = await noweDane(page);
  sprawdz("5a cel //zly.example.com → zostaje na plan.zdawalni.pl/", page.url() === "https://plan.zdawalni.pl/", page.url());
  sprawdz("5b tylko klucze bm-*/plan-*", d["bm-group"] === "C112" && !("sb-token" in d), JSON.stringify(d));
  await page.goto("https://plan.zdawalni.pl/przenies.html#d=%%%zepsute&cel=%2F%3Fk%3Dzarz26");
  await page.waitForURL((u) => !u.pathname.startsWith("/przenies"), { timeout: 15000 });
  sprawdz("5c zepsuta przesyłka: i tak otwiera plan", page.url().startsWith("https://plan.zdawalni.pl/"), page.url());
  await ctx.close();
}
// 6. kalendarze: stary adres podaje prawdziwy plik, a UID-y są te same co na nowym
{
  const stary = fs.readFileSync(path.join(ROOT, "kalendarz/C112.ics"), "utf8");
  const uid = stary.split(/\r?\n/).filter((l) => l.startsWith("UID:"));
  sprawdz("6a UID-y w .ics dalej @plan.skrotbm.pl (bez dubli w telefonach)", uid.length > 10 && uid.every((l) => l.endsWith("@plan.skrotbm.pl")));
  sprawdz("6b opis kalendarza wskazuje plan.zdawalni.pl", stary.includes("https://plan.zdawalni.pl"));
  const wf = fs.readFileSync(path.join(STARY, ".github/workflows/kopia-planu.yml"), "utf8");
  sprawdz("6c kopia kalendarzy w repo starego adresu (workflow)", /kalendarz/.test(wf) && /plan\.json/.test(wf));
}

await browser.close();
console.log(`\n${ok} OK, ${zle} błędów`);
process.exit(zle ? 1 : 0);
