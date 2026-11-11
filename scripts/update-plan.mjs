// Pobiera aktualny plan z planyzajec-efz.usz.edu.pl, zapisuje plan.json,
// wstawia dane do index.html i przygotowuje listę zmian (zmiany.md).
// Uruchamiane codziennie przez GitHub Actions. Node 20+, bez zależności.
//
//   node scripts/update-plan.mjs                              Business Management (plan.json + kopia w index.html), jak dotąd
//   node scripts/update-plan.mjs --kierunek kierunki/<id>.json  inny rocznik → plan/<id>.json (konfiguracja z pliku)
//   node scripts/update-plan.mjs --wszystkie                   każdy rocznik z kierunki/ i config/kierunki-1rok.json (bez BM),
//                                                              stan przebiegu w plan/_import.json
// Pliki kierunki/<id>.json robi skrypt kierunek.mjs w repo skrot-bm; w tym skrypcie nie ma żadnego kierunku poza BM.
import { importujWszystkie } from "./us/importuj.mjs";
import { inwentarz, scalZrodla } from "./us/inwentarz.mjs";
import { pobieracz as nowyPobieracz } from "./us/wspolne.mjs";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import https from "node:https";
import http from "node:http";
import { parseGroupPage, parseUpdated, SLOTS } from "./parse.mjs";
import { fetchImportPlan, mergeImportPlan } from "./import-plan.mjs";
import { roczniki } from "./roczniki.mjs";
import { uczelnia } from "./uczelnia.mjs";

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

// Strona główna planu raz na przebieg (przy --wszystkie wiele roczników czyta ten sam znacznik „Aktualizacja planu”).
let PLAN_HTML = null;
const pauza = () => new Promise(r => setTimeout(r, 1100));
// Inne roczniki niż BM (może ich być kilkadziesiąt, optymalizacja nr 2): pełne pobranie tylko wtedy, gdy uczelnia zmieniła
// znacznik „Aktualizacja planu” albo w pliku brakuje którejś wymaganej grupy; między zapytaniami ≥ 1 s. --wymus = zawsze.
export function bezZmianUczelni(K, old, updated, argv = process.argv) {
  return !K.html && !argv.includes("--wymus") && !!old && !!updated && old.updated === updated
    && K.wymagane.every(g => old.groups && old.groups[g]);
}

// Inne roczniki: strony uczelni przez cache .cache/efz/ (ważny do zmiany „Aktualizacja planu”) i ≤ 1 zapytanie/s.
// BM jak dotąd: zawsze prosto ze strony uczelni.
let CGET = null;
const zRequest = async (url) => { const t = await request(url); return t === null ? { ok: false, status: 404 } : { ok: true, status: 200, text: async () => t }; };
const pobierz = K => K.html ? get : (CGET ||= uczelnia({ fetchFn: zRequest }));
export const liczbaZajec = groups => Object.values(groups || {}).reduce((n, g) => n + (g.odd?.length || 0) + (g.even?.length || 0), 0);
// Walidacja przed zapisem: plan niepusty, każda wymagana grupa ma zajęcia, spadek liczby zajęć ≤ 30% względem poprzedniej wersji.
export function sprawdz(K, groups, stary) {
  for (const g of K.wymagane) if (!groups[g]) throw new Error(`Brak grupy ${g} w odpowiedzi uczelni. Nie nadpisuję planu.`);
  const teraz = liczbaZajec(groups), przed = liczbaZajec(stary?.groups);
  if (!teraz) throw new Error("Plan pusty. Nie nadpisuję planu.");
  if (przed && teraz < przed * 0.7) throw new Error(`Liczba zajęć spadła z ${przed} do ${teraz} (o ponad 30%). Nie nadpisuję planu.`);
  return teraz;
}

async function main(K) {
  const get_ = pobierz(K);
  const planHtml = K.html ? (PLAN_HTML ?? (PLAN_HTML = await get("plan"))) : await get_("plan");
  if (planHtml === null) throw new Error("Strona główna planu przekierowuje w inne miejsce");
  const updated = parseUpdated(planHtml);
  const stary = fs.existsSync(K.plik) ? JSON.parse(fs.readFileSync(K.plik, "utf8")) : null;
  if (bezZmianUczelni(K, stary, updated)) {
    fs.writeFileSync(K.plik, JSON.stringify({ ...stary, checkedAt: new Date().toISOString() }, null, 1) + "\n");
    console.log(`Bez zmian na stronie uczelni (Aktualizacja planu: ${updated}), plan ${K.opis} bez pobierania grup.`);
    K.wynik = { status: "bez zmian", szczegoly: "bez zmian uczelni", wydzial: "wefiz", zrodlo: BASE, wersja: updated || null, grupy: Object.keys(stary.groups).length, zajec: liczbaZajec(stary.groups) };
    return false;
  }

  const groups = {};
  let meta = {};
  for (const g of K.kandydaci) {
    const html = await get_(`planGrup?numerGrupy=${g}`);
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
  const zajec = sprawdz(K, groups, stary);

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
  const szczegoly = changed ? (old ? "zmiana" : "nowy") : "bez zmian";
  K.wynik = { status: changed ? "ok" : "bez zmian", szczegoly, wydzial: "wefiz", zrodlo: BASE, wersja: updated || null, grupy: Object.keys(groups).length, zajec };
  return changed && !!old;
}

const blad = err => {
  const cause = err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : "";
  console.error("BŁĄD:", err.message + cause);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Nie udało się pobrać planu::${err.message}${cause}`);
};

// plan/_import.json: stan ostatniego przebiegu (rocznik, status, grupy, zajęcia, błąd) i log błędów (ostatnie 200 wpisów)
export function zapiszStan(stan, plik = "plan/_import.json", teraz = new Date().toISOString()) {
  const stary = fs.existsSync(plik) ? JSON.parse(fs.readFileSync(plik, "utf8")) : {};
  const log = [...(stary.log || []), ...stan.filter(s => s.blad).map(s => ({ at: teraz, id: s.id, blad: s.blad }))].slice(-200);
  fs.mkdirSync(path.dirname(plik), { recursive: true });
  fs.writeFileSync(plik, JSON.stringify({ opis: "Stan importu planów (update-plan.mjs --wszystkie). status: ok / bez zmian / czeka na zatwierdzenie / błąd (szczegoly: nowy, zmiana, bez zmian uczelni…). wydzial, zrodlo (adres strony/pliku), wersja (Aktualizacja planu albo data z nazwy pliku). Błąd = w plan/<id>.json zostaje poprzednia wersja.", at: teraz, roczniki: stan, log }, null, 1) + "\n");
}

// --tylko id1,id2: przy --wszystkie tylko te roczniki (sprawdzenie na kilku przed pełnym przebiegiem); stan zapisuje się tylko bez --tylko
const ti = process.argv.indexOf("--tylko");
const TYLKO = ti > 0 ? process.argv[ti + 1].split(",") : null;
// Lista plików wydziałów odświeżana przed importem: nowa nazwa pliku na stronie wydziału („… zm. 10 XI”, PPIW-17.pdf)
// trafia do importu od razu. Tylko w pamięci – config/zrodla-us.json zmienia ręczny inwentarz (node scripts/us/inwentarz.mjs).
// Awaria sieci → poprzednia lista (scalZrodla). --bez-inwentarza: import ze starej listy.
async function swiezeZrodla(p) {
  const stare = JSON.parse(fs.readFileSync("config/zrodla-us.json", "utf8"));
  if (process.argv.includes("--bez-inwentarza")) return stare;
  console.log("\n== lista plików wydziałów (inwentarz) ==");
  try {
    const w = await inwentarz({ pobieracz: p, log: () => {} });
    const r = scalZrodla(stare, { wydzialy: w.zrodla }, w.bledyStron || {});
    console.log(r.zmiany.length ? "Nowe pliki na stronach wydziałów:\n  " + r.zmiany.join("\n  ") : "Lista plików bez zmian.");
    if (r.zachowane.length) console.log("Zostaje poprzednia wersja:\n  " + r.zachowane.join("\n  "));
    return r.zrodla;
  } catch (e) {
    console.log(`Inwentarz nie powiódł się (${e.message}) – import z poprzedniej listy.`);
    return stare;
  }
}

async function run() {
  const ki = process.argv.indexOf("--kierunek");
  const pliki = ki > 0 ? [process.argv[ki + 1]] : null;
  let changed = false, failed = false;
  const konfiguracje = pliki ? pliki.map(f => JSON.parse(fs.readFileSync(f, "utf8"))) : process.argv.includes("--wszystkie") ? roczniki().filter(c => !TYLKO || TYLKO.includes(c.id)) : null;
  const stan = [];
  if (!konfiguracje) changed = await main(BM);
  // Każdy rocznik osobno: błąd jednego nie zatrzymuje pozostałych (ich plan zostaje z poprzedniego przebiegu).
  else for (const c of konfiguracje) {
    console.log(`\n== ${c.id} ==`);
    let K = null;
    try { K = zKonfiguracji(c); changed = (await main(K)) || changed; stan.push({ id: c.id, ...K.wynik }); }
    catch (e) { blad(e); failed = true; stan.push({ id: c.id, wydzial: "wefiz", zrodlo: BASE, status: "błąd", blad: e.message }); }
  }
  // Pozostałe wydziały US (config/zrodla-us.json → importer wydziału, scripts/us/importuj.mjs). Błąd jednego nie blokuje reszty.
  if (konfiguracje && process.argv.includes("--wszystkie") && !process.argv.includes("--bez-us")) {
    try {
      const p = nowyPobieracz({ log: console.log });
      const zrodla = await swiezeZrodla(p);
      const us = await importujWszystkie({ tylko: TYLKO, pobieracz: p, zrodla });
      for (const s of us) { if (s.status === "błąd") { failed = true; blad(new Error(`${s.id}: ${s.blad}`)); } stan.push(s); }
    } catch (e) { blad(e); failed = true; }
  }
  if (konfiguracje && process.argv.includes("--wszystkie") && !TYLKO) zapiszStan(stan);
  if (stan.length) console.log("\n" + stan.map(s => `${s.id}: ${s.szczegoly || s.status}${s.grupy != null ? `, grup ${s.grupy}, zajęć ${s.zajec}` : ""}${s.blad ? " — " + s.blad : ""}`).join("\n"));
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) run().catch(err => { blad(err); process.exit(1); });
