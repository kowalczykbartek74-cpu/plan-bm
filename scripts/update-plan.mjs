// Pobiera aktualny plan z planyzajec-efz.usz.edu.pl, zapisuje plan.json,
// wstawia dane do index.html i przygotowuje listę zmian (zmiany.md).
// Uruchamiane codziennie przez GitHub Actions. Node 20+, bez zależności.
//
//   node scripts/update-plan.mjs                              Business Management (plan.json + kopia w index.html), jak dotąd
//   node scripts/update-plan.mjs --kierunek kierunki/<id>.json  inny rocznik → plan/<id>.json (konfiguracja z pliku)
//   node scripts/update-plan.mjs --wszystkie                   każdy plik z kierunki/ (bez BM)
// Pliki kierunki/<id>.json robi skrypt kierunek.mjs w repo skrot-bm; w tym skrypcie nie ma żadnego kierunku poza BM.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import https from "node:https";
import http from "node:http";
import { parseGroupPage, parseUpdated, SLOTS } from "./parse.mjs";
import { fetchImportPlan, mergeImportPlan } from "./import-plan.mjs";

const BASE = process.env.PLAN_BASE_URL || "https://planyzajec-efz.usz.edu.pl/";
// Business Management: grupy 1. roku; skrypt sprawdza też kolejne numery, gdyby uczelnia dodała grupę.
const BM = {
  kierunek: "Business Management", plik: "plan.json", html: true, opis: "1. roku Business Management",
  kandydaci: ["C111", "C112", "C113", "C114", "C115", "C116"], wymagane: ["C111", "C112", "C113"],
};

// kierunki/<id>.json → to samo, czego potrzebuje BM. Nazwa na stronie grupy to nazwa z formularza uczelni bez skrótu
// („Zarządzanie (Z)” → „Zarządzanie”). Kandydaci: grupy z pliku + 3 kolejne numery (nowa grupa = wpis w zmiany.md).
export function zKonfiguracji(c) {
  if (!c?.id || !c.system?.nazwa || !Array.isArray(c.grupy) || !c.grupy.length || c.plik !== `plan/${c.id}.json`) {
    throw new Error(`Zła konfiguracja kierunku ${c?.id || "?"} (id, system.nazwa, grupy, plik = plan/<id>.json)`);
  }
  const ost = c.grupy[c.grupy.length - 1].match(/^(.*?)(\d+)$/);
  const dalej = ost ? [1, 2, 3].map(i => ost[1] + String(+ost[2] + i).padStart(ost[2].length, "0")) : [];
  return {
    kierunek: c.system.nazwa.replace(/\s*\([^)]*\)\s*$/, "").trim(), plik: c.plik, html: false,
    opis: `${c.rok ? c.rok + ". roku " : ""}${c.kierunek.pl}`, rocznik: c.id,
    kandydaci: [...new Set([...c.grupy, ...dalej])], wymagane: c.grupy.slice(),
    // pola dla strony planu (nagłówek); BM ich nie ma, więc jego plan.json się nie zmienia
    dodatki: { id: c.id, kod: c.kod, kierunekEn: c.kierunek.en, wydzial: c.wydzial.kod, rok: c.rok },
  };
}
const MIN_ENTRIES = 5;   // mniej zajęć w grupie = podejrzana odpowiedź, nie nadpisujemy planu

const DAYS = ["Pon", "Wt", "Śr", "Czw", "Pt"];
const WEEK = { odd: "nieparzysty", even: "parzysty" };

// Zwykłe żądanie HTTP z długim limitem czasu (fetch w Node ma sztywne 10 s na połączenie,
// a serwer uczelni czasem odpowiada wolno).
function request(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(url, { headers: { "User-Agent": "plan-bm (projekt studencki, raz dziennie)" }, timeout: 60000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 500) { res.resume(); return resolve(null); }   // przekierowanie / brak strony
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", c => body += c);
      res.on("end", () => resolve(body));
    });
    req.on("timeout", () => req.destroy(new Error("brak odpowiedzi przez 60 s")));
    req.on("error", reject);
  });
}

async function get(path) {
  let lastErr;
  const waits = [15, 30, 60, 90];   // sekundy między próbami
  for (let i = 0; i <= waits.length; i++) {
    try { return await request(BASE + path); }
    catch (e) {
      lastErr = new Error(`${path}: ${e.message}${e.code ? " (" + e.code + ")" : ""}`);
      console.log(`Próba ${i + 1} nieudana: ${lastErr.message}`);
      if (i < waits.length) await new Promise(r => setTimeout(r, waits[i] * 1000));
    }
  }
  throw lastErr;
}

function describe(e) {
  const t = e.time ? `${e.time[0]}–${e.time[1]}` : SLOTS[e.s].replace(".", ":").replace("-", "–").replace(".", ":");
  const kind = { W: "wykład", CW: "ćwiczenia", LAB: "laboratorium", K: "konwersatorium", S: "seminarium", X: "" }[e.k] || "";
  return [`${DAYS[e.d]} ${t}`, e.pl + (kind ? ` (${kind})` : "") + (e.g ? `, grupa ${e.g}` : ""), e.p, e.r, e.n].filter(Boolean).join(" · ");
}

function diffGroups(oldG, newG) {
  const lines = [];
  const groups = [...new Set([...Object.keys(oldG || {}), ...Object.keys(newG)])].sort();
  for (const g of groups) {
    if (!newG[g]) { lines.push(`### ${g}\n- grupa zniknęła z planu uczelni`); continue; }
    if (!oldG || !oldG[g]) { lines.push(`### ${g}\n- nowa grupa w planie`); continue; }
    const part = [];
    for (const w of ["odd", "even"]) {
      const o = new Map(oldG[g][w].map(e => [JSON.stringify(e), e]));
      const n = new Map(newG[g][w].map(e => [JSON.stringify(e), e]));
      for (const [k, e] of o) if (!n.has(k)) part.push(`- ➖ **usunięte** (${WEEK[w]}): ${describe(e)}`);
      for (const [k, e] of n) if (!o.has(k)) part.push(`- ➕ **dodane** (${WEEK[w]}): ${describe(e)}`);
    }
    if (part.length) lines.push(`### ${g}\n${part.join("\n")}`);
  }
  return lines.join("\n\n");
}

async function main(K) {
  const planHtml = await get("plan");
  if (planHtml === null) throw new Error("Strona główna planu przekierowuje w inne miejsce");
  const updated = parseUpdated(planHtml);

  const groups = {};
  let meta = {};
  for (const g of K.kandydaci) {
    const html = await get(`planGrup?numerGrupy=${g}`);
    if (html === null) continue;   // uczelnia nie ma takiej grupy (przekierowanie)
    const page = parseGroupPage(html);
    if (page.empty || page.kierunek !== K.kierunek) continue;
    const count = page.odd.length + page.even.length;
    if (count === 0) continue;
    if (count < MIN_ENTRIES) throw new Error(`Grupa ${g} ma tylko ${count} zajęć. Nie nadpisuję planu, sprawdź stronę uczelni.`);
    groups[g] = { odd: page.odd, even: page.even };
    meta = { rokAkademicki: page.rokAkademicki, semestr: page.semestr };
  }
  // Zatwierdzony plan z kolejki importów Skrótu: tylko grupy, których strona uczelni nie podaje (scripts/import-plan.mjs).
  const fi = process.argv.indexOf("--import-file");
  const imp = await fetchImportPlan({ file: fi > 0 ? process.argv[fi + 1] : null, ...(K.rocznik ? { rocznik: K.rocznik } : {}) });
  const zImportu = mergeImportPlan(groups, imp);
  if (zImportu.length) console.log(`Plan z importu (Skrót, zatwierdzony ${imp.zatwierdzony_at}): grupy ${zImportu.join(", ")}.`);
  for (const g of K.wymagane) {
    if (!groups[g]) throw new Error(`Brak grupy ${g} w odpowiedzi uczelni. Nie nadpisuję planu.`);
  }

  const old = fs.existsSync(K.plik) ? JSON.parse(fs.readFileSync(K.plik, "utf8")) : null;
  const changed = !old || JSON.stringify(old.groups) !== JSON.stringify(groups);
  const now = new Date().toISOString();

  const data = {
    source: BASE,
    kierunek: K.kierunek,
    ...(K.dodatki || {}),
    rokAkademicki: meta.rokAkademicki,
    semestr: meta.semestr,
    updated,                                   // znacznik z planu uczelni
    changedAt: changed ? now : old.changedAt,  // kiedy skrypt ostatnio wykrył zmianę
    checkedAt: now,                            // ostatnie sprawdzenie
    groups,
    ...(zImportu.length ? { zImportu: { id: imp.id, zatwierdzony: imp.zatwierdzony_at, grupy: zImportu } } : {}),   // skąd są te grupy
    ...(old?.kalendarz ? { kalendarz: old.kalendarz } : {}),   // kalendarz roku dokłada scripts/kalendarz.mjs
    ...(old?.dziekanat ? { dziekanat: old.dziekanat } : {})    // odwołania i odrabianie: scripts/dziekanat.mjs
  };
  fs.mkdirSync(path.dirname(K.plik), { recursive: true });
  fs.writeFileSync(K.plik, JSON.stringify(data, null, 1) + "\n");

  // Kopia danych w index.html, żeby strona działała nawet bez plan.json (tylko BM)
  if (K.html) {
    const html = fs.readFileSync("index.html", "utf8");
    const start = "/*PLAN_DATA_START*/", end = "/*PLAN_DATA_END*/";
    const i = html.indexOf(start), j = html.indexOf(end);
    if (i < 0 || j < 0) throw new Error("Brak znaczników danych w index.html");
    fs.writeFileSync("index.html", html.slice(0, i + start.length) + JSON.stringify(data) + html.slice(j));
  }

  let summary = "";
  if (changed && old) {
    summary = `Skrypt wykrył zmiany w planie zajęć ${K.opis}.\n\n` +
      `Aktualizacja na stronie uczelni: **${updated || "brak informacji"}**\n\n` +
      diffGroups(old.groups, groups) +
      `\n\nStrona z planem została już zaktualizowana automatycznie. Sprawdź ją i w razie potrzeby daj znać grupie.`;
    // BM zaczyna plik od nowa (jak dotąd), kolejne roczniki dopisują swoją część do tego samego maila
    if (K.html) fs.writeFileSync("zmiany.md", summary + "\n");
    else fs.appendFileSync("zmiany.md", (fs.existsSync("zmiany.md") ? "\n---\n\n" : "") + summary + "\n");
  }
  console.log(changed ? (old ? "ZMIANA w planie:\n" + summary : "Pierwszy zapis planu.") : "Bez zmian w planie.");
  return changed && !!old;
}

const blad = err => {
  const cause = err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : "";
  console.error("BŁĄD:", err.message + cause);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Nie udało się pobrać planu::${err.message}${cause}`);
};

async function run() {
  const ki = process.argv.indexOf("--kierunek");
  const pliki = ki > 0 ? [process.argv[ki + 1]]
    : process.argv.includes("--wszystkie") ? (fs.existsSync("kierunki") ? fs.readdirSync("kierunki").filter(f => f.endsWith(".json")).sort().map(f => "kierunki/" + f) : [])
    : null;
  let changed = false, failed = false;
  if (!pliki) changed = await main(BM);
  // Każdy rocznik osobno: błąd jednego nie zatrzymuje pozostałych (ich plan zostaje z poprzedniego przebiegu).
  else for (const f of pliki) {
    console.log(`\n== ${f} ==`);
    try { changed = (await main(zKonfiguracji(JSON.parse(fs.readFileSync(f, "utf8"))))) || changed; }
    catch (e) { blad(e); failed = true; }
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) run().catch(err => { blad(err); process.exit(1); });
