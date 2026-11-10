// Komunikaty dziekanatu (Dział Obsługi Studenta, Cukrowa): odwołane zajęcia, odrabianie, zmiany sal i godzin.
// Źródło: https://dos.usz.edu.pl/cukrowa/zajecia-cukrowa/
//
// Skrypt pobiera listę wpisów, wybiera te dla grup z planu (C111, C112, C113), czyta ich treść
// i zamienia ją na zmiany w konkretnych dniach:
//   - "cancel"  zajęcia z planu odwołane w danym dniu (strona je przekreśla),
//   - "extra"   dodatkowe zajęcia: odrabianie albo przeniesienie na inną godzinę / salę,
//   - "note"    komunikat dla grupy, którego nie udało się przypiąć do konkretnych zajęć.
// Wynik trafia do plan.json (pole "dziekanat") i do kopii danych w index.html.
//
// Do tego odwołania i przeniesienia z ogłoszeń prowadzących w Teams, zatwierdzone przez starostę w Skrócie BM
// (skrotbm.pl → Narzędzia starosty → Odwołania z Teams). Czyta je publiczna funkcja bazy Skrótu nauka_odwolania_publiczne()
// (skrot-bm/supabase/skrot-v26-odwolania.sql). Trafiają do "posts" (src: "teams", bez adresu) i do "zmiany" (src: "teams").
//
// Gdy strona dziekanatu nie odpowiada, skrypt liczy zmiany z wpisów zapisanych przy poprzednim sprawdzeniu.
// Uruchomienie lokalne bez internetu: node scripts/dziekanat.mjs --offline
//
// Bez zapisu: --na-sucho. Roczniki pozostałych wydziałów US (plan/<id>.json z scripts/us/, Etap 6) też idą przy --kierunki:
// sekcja DOS wydziału z config/zrodla-us.json, wpis → rocznik po kierunku, roku i prowadzącym (scripts/us/dos-dopasuj.mjs).
// Inne roczniki (pliki kierunki/<id>.json z repo skrot-bm, scripts/kierunek.mjs):  node scripts/dziekanat.mjs --kierunki
// Plan z plan/<id>.json, grupy z pliku kierunku, tylko komunikaty DOS (bez Teams, gdy plik tak mówi), adres sekcji DOS
// z pliku kierunku ("dos", gdy zajęcia są w innym budynku) albo z bazy Skrótu (nauka_roczniki_lista → wydzial.dos_url).
// Bez bazy: adres zapisany w planie przy poprzednim przebiegu.
// Node 20+, bez zależności.
import { roczniki } from "./roczniki.mjs";
import { dopasowanie, rocznikiUS, formularz, formularzDla, nazwisko, norm } from "./us/dos-dopasuj.mjs";
import fs from "node:fs";
import https from "node:https";
import { pathToFileURL } from "node:url";

export const SOURCE = "https://dos.usz.edu.pl/cukrowa/zajecia-cukrowa/";
const MAX_PAGES = 8;                 // po 20 wpisów na stronie
const KEEP_FROM = "2026-09";         // starszych wpisów (rok-miesiąc z adresu) nie czytamy
const SLOTS = [["8:15","9:45"],["10:00","11:30"],["12:00","13:30"],["13:45","15:15"],["15:30","17:00"],["17:15","18:45"],["19:00","20:30"]];

// ---------- pobieranie ----------
// Grzeczność wobec uczelni (spec): ≤ 1 zapytanie/s, User-Agent z adresem kontaktowym.
const UA = "plan-bm (projekt studencki, plany zajec US, plan.zdawalni.pl, 1 zapytanie/s; skrotbm@outlook.com)";
let nastepne = 0;
async function request(url) {
  const czekaj = nastepne - Date.now(); nastepne = Math.max(Date.now(), nastepne) + 1100;
  if (czekaj > 0) await new Promise(r => setTimeout(r, czekaj));
  return requestNow(url);
}
function requestNow(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": UA }, timeout: 45000 }, res => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve(requestNow(new URL(res.headers.location, url).href)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} (${url})`)); }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", c => body += c);
      res.on("end", () => resolve(body));
    });
    req.on("timeout", () => req.destroy(new Error("brak odpowiedzi przez 45 s")));
    req.on("error", reject);
  });
}
// W jednym przebiegu ta sama strona dziekanatu jest pobierana raz (kilka roczników z jednej sekcji DOS).
const CACHE = new Map();
function get(url) {
  if (!CACHE.has(url)) CACHE.set(url, getNow(url).catch(e => { CACHE.delete(url); throw e; }));
  return CACHE.get(url);
}
async function getNow(url) {
  let last;
  for (const wait of [0, 10, 30]) {
    if (wait) await new Promise(r => setTimeout(r, wait * 1000));
    try { return await request(url); } catch (e) { last = e; console.log(`Próba nieudana: ${e.message}`); }
  }
  throw last;
}

// ---------- HTML → tekst ----------
const ENT = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ndash: "–", mdash: "—", bdquo: "„", rdquo: "”", ldquo: "“", hellip: "…", oacute: "ó", Oacute: "Ó" };
export function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e] ?? m;
  });
}
export function toText(html) {
  return decode(html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

// Lista wpisów ze strony z listą (motyw Divi: tytuł wpisu to link do /cukrowa/RRRR/MM/nazwa/).
// Sekcja DOS z adresu listy: https://dos.usz.edu.pl/<budynek>/<lista>/ (np. cukrowa/zajecia-cukrowa, mickiewicza/zajecia-mickiewicza)
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function parseList(html, source = SOURCE) {
  const [budynek = "cukrowa", lista = "zajecia-cukrowa"] = new URL(source).pathname.split("/").filter(Boolean);
  const out = [], seen = new Set();
  const re = new RegExp(`<a\\b[^>]*href="(https?:\\/\\/dos\\.usz\\.edu\\.pl\\/${esc(budynek)}\\/(?:[a-z0-9-]+\\/)?(\\d{4})\\/(\\d{2})\\/[^"#?]+)"[^>]*>([\\s\\S]{1,300}?)<\\/a>`, "gi");
  let m;
  while ((m = re.exec(html))) {
    const url = m[1].replace(/\/?$/, "/");
    const title = toText(m[4]).replace(/\s+/g, " ").trim();
    if (!title || /czytaj dalej|read more/i.test(title) || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title, ym: `${m[2]}-${m[3]}` });
  }
  const older = new RegExp(`href="([^"]*\\/${esc(lista)}\\/page\\/\\d+\\/[^"]*)"[^>]*>[^<]*(Starsze|Older)`, "i").exec(html);
  return { posts: out, older: older ? decode(older[1]) : null };
}

// Treść pojedynczego wpisu.
export function parsePost(html) {
  let part = null;
  const ec = /<div[^>]*class="[^"]*\bentry-content\b[^"]*"[^>]*>/i.exec(html);
  if (ec) {
    const rest = html.slice(ec.index + ec[0].length);
    const end = rest.search(/<!--\s*\.entry-content\s*-->|<\/article>|<div[^>]*class="[^"]*(et_post_meta_wrapper|comments|et_pb_after_main)/i);
    part = end > 0 ? rest.slice(0, end) : rest.slice(0, 20000);
  } else {
    const h1 = html.search(/<\/h1>/i);
    if (h1 > 0) { const rest = html.slice(h1); const end = rest.search(/<\/article>|Dziekan\b/); part = rest.slice(0, end > 0 ? end : 6000); }
  }
  return part ? toText(part).replace(/\n+/g, " ").replace(/\s+/g, " ").trim() : "";
}

// Data publikacji wpisu: <span class="published">paź 23, 2026</span>
const SHORT_MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
export function parsePublished(html) {
  const m = /class="published"[^>]*>\s*([a-ząćęłńóśźż]{3})[a-ząćęłńóśźż]*\.?\s+(\d{1,2}),?\s+(\d{4})/i.exec(html);
  if (m) { const mo = SHORT_MONTHS.indexOf(decode(m[1]).toLowerCase()) + 1; if (mo) return `${m[3]}-${String(mo).padStart(2, "0")}-${String(+m[2]).padStart(2, "0")}`; }
  const iso = /"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})|article:published_time"\s+content="(\d{4}-\d{2}-\d{2})/.exec(html);
  return iso ? iso[1] || iso[2] : null;
}

// ---------- czytanie komunikatu ----------
const MONTHS = ["stycz", "lut", "mar", "kwie", "maj", "czerw", "lip", "sierp", "wrze", "październik", "listopad", "grud"];
const pad = n => String(n).padStart(2, "0");

// Grupy z tytułu: "GRUPA C111, C112, C113", "GRUPA C112a", "C111 i C113".
// Grupy z tytułu wpisu: „GRUPA C111, C112”, „GRUPA C531,C532”, „M150, M151, M160”, „GRUPA C112a”.
// Litera kampusu: C (Cukrowa) albo M (Mickiewicza); numer 1xx–6xx (rok i stopień). Numer bez litery liczy się tylko po
// grupie z literą („C111, 112” → litera poprzedniej) albo zaraz po „grupa”/„gr.” (litera grupy z planu). Tylko grupy z planu.
export function groupsOf(title, known) {
  const out = [];
  let litera = null;
  for (const m of title.matchAll(/(?<![\w.])([CM])?\s?([1-6]\d\d)([ab])?(?![\w.])/gi)) {
    if (m[1]) litera = m[1].toUpperCase();
    else if (!litera && !/gr(upa|upy|\.)?\s*$/i.test(title.slice(0, m.index))) continue;   // „sala 211” to nie grupa
    const l = m[1] ? m[1].toUpperCase() : litera || ["C", "M"].find((x) => known.includes(x + m[2]));
    const g = (l || "C") + m[2];
    litera = l || "C";
    if (known.includes(g)) out.push({ g, sub: m[3] ? m[3].toUpperCase() : "" });
  }
  // "GRUPA C111, C112, C113" bez litery C przy kolejnych numerach też się trafia
  return out.filter((x, i) => out.findIndex(y => y.g === x.g && y.sub === x.sub) === i);
}

// Wszystkie daty w tekście (12.11.2026, 3.11.2026 r., 7 października 2026) z pozycjami.
// rozsz (roczniki spoza WEFiZ, Etap 6): także „4.11”, „30.X”, „13 XI”, „5th November”, „Nov 3” – rok z roku akademickiego wpisu
// (yearHint = rok z adresu wpisu, ymHint = miesiąc). BM i WEFiZ czytają daty jak dotąd.
const RZYM = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 };
const EN_M = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function findDates(text, yearHint, { rozsz = false, mHint = 10 } = {}) {
  const out = [];
  const num = /(?<![\d.])(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2}(?!\d))(?:\s?r\.?)?/g;
  let m;
  while ((m = num.exec(text))) {
    const d = +m[1], mo = +m[2]; let y = +m[3]; if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) out.push({ k: `${y}-${pad(mo)}-${pad(d)}`, i: m.index, j: m.index + m[0].length });
  }
  const word = /(?<!\d)(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)(?:\s+(\d{4}))?(?:\s?r\.?)?/gi;
  while ((m = word.exec(text))) {
    const mo = MONTHS.findIndex(p => m[2].toLowerCase().startsWith(p)) + 1;
    const y = m[3] ? +m[3] : yearHint;
    if (mo && y) out.push({ k: `${y}-${pad(mo)}-${pad(+m[1])}`, i: m.index, j: m.index + m[0].length });
  }
  if (rozsz) {
    const start = mHint >= 9 ? yearHint : yearHint - 1, rokM = mo => (mo >= 9 ? start : start + 1);
    const wolne = (i, j) => !out.some(x => i < x.j && j > x.i);
    const dodaj = (d, mo, i, j) => { if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && wolne(i, j)) out.push({ k: `${rokM(mo)}-${pad(mo)}-${pad(d)}`, i, j }); };
    for (const m of text.matchAll(/(?<![\d.:])(\d{1,2})\s?\.?\s?(XII|XI|IX|X|VIII|VII|VI|IV|V|III|II|I)(?![\p{L}\d])/gu)) dodaj(+m[1], RZYM[m[2]], m.index, m.index + m[0].length);
    for (const m of text.matchAll(/(?<![\d.:])(\d{1,2})\.(\d{1,2})\.?(?![\d.:])/g))
      if (!/godz\S*\s*$|[-–]\s*$/i.test(text.slice(Math.max(0, m.index - 8), m.index))) dodaj(+m[1], +m[2], m.index, m.index + m[0].length);
    for (const m of text.matchAll(/(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi)) dodaj(+m[1], EN_M.indexOf(m[2].toLowerCase()) + 1, m.index, m.index + m[0].length);
    for (const m of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi)) dodaj(+m[2], EN_M.indexOf(m[1].toLowerCase()) + 1, m.index, m.index + m[0].length);
  }
  return out.sort((a, b) => a.i - b.i);
}

const TIME = /(\d{1,2})[:.](\d{2})(?!\d|\.\d{4})/;
const hhmm = (h, m) => `${+h}:${m}`;
function firstTime(s) {
  // najpierw godzina po słowie "godz.", potem gołe 10:00 blisko początku
  let m = /godz(?:\.|inie|ina)?\s*(\d{1,2})[:.](\d{2})(?:\s*[-–—]\s*(\d{1,2})[:.](\d{2}))?/i.exec(s);
  if (!m) { const b = /^[^\d]{0,25}?(\d{1,2}):(\d{2})(?:\s*[-–—]\s*(\d{1,2})[:.](\d{2}))?/.exec(s); if (b) m = b; }
  if (!m || +m[1] > 21 || +m[1] < 7) return null;
  return { start: hhmm(m[1], m[2]), end: m[3] ? hhmm(m[3], m[4]) : null, at: m.index + m[0].length };
}
function allStarts(s) {
  const out = [];
  const g = /godz\.?\s*/i.exec(s);
  if (!g) return out;
  for (const m of s.slice(g.index).matchAll(/([-–—]\s*)?(\d{1,2})[:.](\d{2})(?!\.\d{4})/g)) if (!m[1]) out.push(hhmm(m[2], m[3]));
  return out;
}
function roomIn(s) {
  if (/\b(MS\s*)?Teams\b/i.test(s)) return "MS Teams";
  const m = /(?:\bw\s+)?\b(?:sali|sala|gab\.|gabinet|gabinecie|s\.)\s*([^,;()]+?)(?=\s*(?:[,;()]|\.\s|\.?$|\s(?:dla|na|Termin|odbęd|Catch|The|oraz|i\s|[A-ZĄĆĘŁŃÓŚŹŻ]{4,})))/i.exec(s);
  if (!m) return null;
  const r = m[1].trim().replace(/\.$/, "");
  return r && r.length <= 40 ? (/^\d/.test(r) || /^SIL/i.test(r) ? "s. " + r : r) : null;
}

// Tekst komunikatu → lista zdarzeń (bez dopasowania do planu).
export function readNotice(text, yearHint = 2026, opcje = {}) {
  const dates = findDates(text, yearHint, opcje);
  const events = [];
  const lower = text.toLowerCase();
  const isChange = !/odwoł|odrab|odrob/.test(lower) && /odbęd/.test(lower) && !(opcje.rozsz && /nie\s+odbęd/.test(lower));   // "zajęcia odbędą się o godz. 10:00 w sali 046"
  dates.forEach((dt, n) => {
    // "Dnia 26.10.2026 i 27.10.2026 zostają odwołane…": data połączona spójnikiem z następną dzieli jej opis
    let m = n;
    while (m + 1 < dates.length && /^\s*(i|oraz|,|;|–|-)\s*$/i.test(text.slice(dates[m].j, dates[m + 1].i))) m++;
    const nextI = m + 1 < dates.length ? dates[m + 1].i : text.length;
    const prevJ = n > 0 ? dates[n - 1].j : 0;
    const before = text.slice(Math.max(prevJ, dt.i - 60), dt.i);
    const after = text.slice(dt.j, Math.min(nextI, dt.j + 220));
    const cut = after.search(/termin|odrob|odrab/i);
    const head = cut >= 0 ? after.slice(0, cut) : after;
    if (/\bz\s+dni(a|em)\s*:?\s*$/i.test(before)) {
      events.push({ type: "cancel", date: dt.k, starts: allStarts(after.split(/\bna\b/)[0]) });
      return;
    }
    if (/odwołan\w*\s+(w\s+dniu|dnia)\s*$/i.test(before) || /odwoł/i.test(head) || (opcje.rozsz && /cancel|nie\s+odbęd|not\s+take\s+place/i.test(head + (/na\s+dzie|przełoż|odrob|odpracow|make-up|moved\s+to/i.test(before) ? "" : before)))) {
      events.push({ type: "cancel", date: dt.k, starts: allStarts(head) });
      return;
    }
    const t = firstTime(after);
    // poza BM: kilka różnych godzin po dacie („grupa 1 – 8.15…, grupa 2 – 13.30…”) = nie zgadujemy jednego terminu odrabiania
    const wiele = opcje.rozsz && new Set([...after.matchAll(/(\d{1,2})[:.](\d{2})\s*[-–—]\s*\d{1,2}[:.]\d{2}/g)].map(m => +m[1] * 60 + +m[2])).size > 1;
    if (t && !wiele) {
      const tail = after.slice(t.at, t.at + 90);
      const sub = /grup[ayie]\s*C?\d{3}([ab])\b/i.exec(after.slice(t.at, t.at + 140));
      const subject = text.slice(Math.max(prevJ, dt.i - 90), dt.i);
      events.push({ type: isChange ? "change" : "extra", date: dt.k, start: t.start, end: t.end, r: roomIn(tail) || roomIn(after.slice(0, t.at)), sub: sub ? sub[1].toUpperCase() : "", around: subject });
    }
  });
  return events;
}

// ---------- dopasowanie do planu ----------
const strip = s => s.toLowerCase().normalize("NFC");
function surnameStem(p) {
  if (!p) return null;
  const words = p.replace(/\(.*?\)/g, "").split(/\s+/).filter(w => /^[A-ZĄĆĘŁŃÓŚŹŻ]/.test(w) && !/^(US|SIL)$/.test(w));
  const last = words[words.length - 1];
  if (!last) return null;
  const first = strip(last.split("-")[0]);
  return first.slice(0, Math.max(4, first.length - 2));
}
const has = (text, stem) => stem && new RegExp(`(^|[^\\p{L}])${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u").test(strip(text));
const startOf = e => (e.time ? e.time[0] : SLOTS[e.s][0]);
const endOf = e => (e.time ? e.time[1] : SLOTS[e.s][1]);
const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const plusMin = (t, n) => { const x = toMin(t) + n; return `${Math.floor(x / 60)}:${pad(x % 60)}`; };

function calendarOf(plan) {
  const k = plan.kalendarz || {};
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const key = d => d.toISOString().slice(0, 10);
  const PAR = {}, OFF = k.wolne || {}, SWAP = k.zamiany || {};
  for (const [a, b, p] of k.tygodnie || []) for (let d = parse(a); key(d) <= b; d = new Date(d.getTime() + 864e5)) if (d.getUTCDay() % 6) PAR[key(d)] = p;
  for (const d of Object.keys(OFF)) delete PAR[d];
  for (const [d, v] of Object.entries(SWAP)) PAR[d] = v.p;
  return date => {
    if (SWAP[date]) return { p: SWAP[date].p, day: SWAP[date].asDay };
    if (PAR[date]) return { p: PAR[date], day: (parse(date).getUTCDay() + 6) % 7 };
    return null;
  };
}

// Zajęcia grupy w danym dniu (ta sama logika co strona i pliki .ics).
function classesOn(plan, cal, group, date) {
  const info = cal(date);
  if (!info) return [];
  return (plan.groups[group]?.[info.p] || []).filter(e => e.d === info.day && (!e.dates || e.dates.includes(date)));
}

const short = (s, n = 260) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);

// Wpisy dziekanatu (z treścią) → zmiany dla każdej grupy.
// opcje (roczniki spoza WEFiZ, Etap 6): dopasuj(post, known) → [{ g, sub, nr?, niska?, prowadzacy? }] zamiast grup z tytułu,
// rozsz → więcej zapisów dat (findDates). niska pewność = tylko komunikat pod dniem, w którym rocznik ma zajęcia tego prowadzącego.
export function resolve(plan, posts, opcje = {}) {
  const cal = calendarOf(plan);
  const known = Object.keys(plan.groups || {});
  const out = Object.fromEntries(known.map(g => [g, []]));
  const add = (g, item) => {
    const list = out[g];
    const same = list.find(x => x.type === item.type && x.date === item.date &&
      (item.type === "note" ? x.post === item.post : item.type === "cancel" ? x.start === item.start && x.pl === item.pl && (x.g || "") === (item.g || "") : x.start === item.start && (x.g || "") === (item.g || "")));
    if (!same) { if (item.type === "cancel") item.posts = [item.post]; list.push(item); }
    else if (item.type === "cancel" && !same.posts.includes(item.post)) same.posts.push(item.post);
  };

  posts.forEach((post, pi) => {
    // poza BM tytuł często niesie datę i „odwołany” („BPK II st. 2 rok – odwołany wykład … w dniu 27.10 i 3.11”) → tytuł + treść
    const text = opcje.rozsz ? `${post.title}. ${post.text || ""}` : post.text || post.title;
    const year = +(post.ym || "2026").slice(0, 4);
    const fd = { rozsz: !!opcje.rozsz, mHint: +(post.ym || "2026-10").slice(5, 7) || 10 };
    const events = readNotice(text, year, fd);
    // formularz nieobecności (system uczelni): pozycje z kierunkiem, rokiem, dniem i godziną – dokładnie, bez reszty odczytu
    const form = opcje.formularz ? opcje.formularz(post) : null;
    if (form) {
      for (const g of known) for (const poz of form) {
        let cands = classesOn(plan, cal, g, poz.zDnia).filter(e => toMin(startOf(e)) === toMin(poz.zGodz));
        if (poz.nr) cands = cands.filter(e => !e.pg || e.pg.split(":").pop() === poz.nr);
        // kilka zajęć o tej godzinie: ten sam przedmiot → prowadzący z tytułu wpisu → rodzaj; dalej niejasne = tylko notka
        for (const zaw of [e => strip(e.pl).includes(strip(poz.przedmiot)) || strip(poz.przedmiot).includes(strip(e.pl)),
          e => { const n = nazwisko(e.p); return !!n && norm(post.title).includes(n); }, e => e.k === poz.k]) {
          if (cands.length <= 1) break;
          const z = cands.filter(zaw); if (z.length) cands = z;
        }
        if (cands.length !== 1 && !(cands.length > 1 && cands.every(e => e.pl === cands[0].pl))) { add(g, { type: "note", date: poz.zDnia, post: pi }); continue; }
        // kilka grup w jednej pozycji (np. „SM-SI.26-11,SM-SI.26-12” o 17:00), a plan ma je po kolei: te same zajęcia tego prowadzącego później tego dnia
        if (poz.grupy.length > cands.length) {
          const dalej = classesOn(plan, cal, g, poz.zDnia).filter(e => !cands.includes(e) && e.pl === cands[0].pl && e.p === cands[0].p && toMin(startOf(e)) > toMin(poz.zGodz))
            .sort((a, b) => toMin(startOf(a)) - toMin(startOf(b)));
          cands = [...cands, ...dalej.slice(0, poz.grupy.length - cands.length)];
        }
        for (const e of cands) add(g, { type: "cancel", date: poz.zDnia, start: startOf(e), pl: e.pl, ...(e.g ? { g: e.g } : {}), ...(poz.naDzien ? { moved: true } : {}), post: pi });
        if (poz.naDzien) {
          const e = cands[0], dl = toMin(endOf(e)) - toMin(startOf(e));
          add(g, { type: "extra", kind: "makeup", date: poz.naDzien, start: plusMin(poz.naGodz, 0), end: plusMin(poz.naGodz, dl), pl: e.pl, ...(e.en ? { en: e.en } : {}), k: e.k || poz.k,
            ...(e.p ? { p: e.p } : {}), ...(poz.sala ? { r: /^\d/.test(poz.sala) ? "s. " + poz.sala : poz.sala } : {}), ...(e.g ? { g: e.g } : {}), post: pi });
        }
      }
      return;
    }
    const cele = opcje.dopasuj ? opcje.dopasuj(post, known) : groupsOf(post.title, known);
    for (const { g, sub: titleSub, nr, niska, prowadzacy } of cele) {
      if (niska) {
        // nie zgadujemy zajęć: oryginał wpisu jako notka pod dniem, gdy tego dnia są zajęcia prowadzącego (albo jakiekolwiek, gdy wpis nie podaje prowadzącego)
        for (const dt of findDates(text, year, fd)) {
          const tego = classesOn(plan, cal, g, dt.k).filter(e => !prowadzacy?.length || prowadzacy.some(p => (e.p || "").includes(p)));
          if (tego.length) add(g, { type: "note", date: dt.k, post: pi, niska: true });
        }
        continue;
      }
      const all = ["odd", "even"].flatMap(w => plan.groups[g][w] || []);
      const lecturers = [...new Set(all.map(e => e.p).filter(Boolean))].filter(p => has(text, surnameStem(p)));
      const subjects = [...new Set(all.map(e => e.pl).filter(pl => pl && pl !== "Odrabianie zajęć"))]
        .filter(pl => strip(text).includes(strip(pl)) || all.some(e => e.pl === pl && e.en && strip(text).includes(strip(e.en))));
      const cancelled = [];
      const matched = new Set();

      // Komunikat bez daty ("The classes are cancelled because I'm at the conference"):
      // odwołane są najbliższe zajęcia tego prowadzącego od dnia publikacji wpisu.
      if (!findDates(text, year, fd).length && post.pub && lecturers.length && /odwoł|cancel/i.test(text)) {
        const onlyLecture = /\b(lecture|wykład)/i.test(text) && !/\bclasses\b|ćwicz|zajęcia/i.test(text);
        const start = new Date(post.pub + "T12:00:00Z");
        for (let i = 0; i <= 14; i++) {
          const date = new Date(start.getTime() + i * 864e5).toISOString().slice(0, 10);
          const hit = classesOn(plan, cal, g, date).filter(e => lecturers.includes(e.p) && (!onlyLecture || e.k === "W") && (!titleSub || !e.g || e.g === titleSub));
          if (!hit.length) continue;
          for (const e of hit) add(g, { type: "cancel", date, start: startOf(e), pl: e.pl, ...(e.g ? { g: e.g } : {}), guess: true, post: pi });
          break;
        }
        continue;
      }

      for (const ev of events.filter(e => e.type === "cancel")) {
        let cands = classesOn(plan, cal, g, ev.date).filter(e => e.k !== "X");
        if (titleSub) cands = cands.filter(e => !e.g || e.g === titleSub);
        if (nr) cands = cands.filter(e => !e.pg || String(nr).split(",").includes(e.pg.split(":").pop()));
        if (ev.starts.length) cands = cands.filter(e => ev.starts.includes(startOf(e)));
        if (lecturers.length) cands = cands.filter(e => lecturers.includes(e.p));
        else if (subjects.length) cands = cands.filter(e => subjects.includes(e.pl));
        else if (!ev.starts.length) cands = [];   // nie wiadomo, które zajęcia: tylko komunikat przy dniu
        if (!cands.length) { add(g, { type: "note", date: ev.date, post: pi }); matched.add(ev); continue; }
        for (const e of cands) {
          add(g, { type: "cancel", date: ev.date, start: startOf(e), pl: e.pl, ...(e.g ? { g: e.g } : (titleSub ? { g: titleSub } : {})), post: pi });
          cancelled.push(e);
        }
        matched.add(ev);
      }

      for (const ev of events.filter(e => e.type === "extra" || e.type === "change")) {
        const sub = ev.sub || titleSub;
        // przedmiot: nazwa tuż przed datą, potem odwołane zajęcia z tego wpisu, potem przedmioty prowadzącego
        const near = subjects.filter(pl => strip(ev.around).includes(strip(pl)) || all.some(e => e.pl === pl && e.en && strip(ev.around).includes(strip(e.en))));
        const pool = near.length ? all.filter(e => near.includes(e.pl))
          : cancelled.length ? cancelled
          : lecturers.length ? all.filter(e => lecturers.includes(e.p))
          : subjects.length ? all.filter(e => subjects.includes(e.pl)) : [];
        const names = [...new Set(pool.map(e => e.pl))];
        const base = names.length === 1 ? pool.find(e => e.pl === names[0]) : null;
        const kinds = base ? [...new Set(pool.filter(e => e.pl === base.pl).map(e => e.k))] : [];
        // to samo jest już w planie uczelni (np. "Odrabianie zajęć" w danym dniu) → nie dublujemy
        const dup = classesOn(plan, cal, g, ev.date).some(e => startOf(e) === ev.start && (e.k === "X" || (base && e.pl === base.pl)));
        const lect = base?.p || (lecturers.length === 1 ? lecturers[0] : null);
        const item = {
          type: "extra", kind: ev.type === "change" ? "change" : "makeup", date: ev.date, start: ev.start,
          end: ev.end || plusMin(ev.start, 90),
          pl: base ? base.pl : "Odrabianie zajęć", ...(base?.en ? { en: base.en } : {}),
          k: kinds.length === 1 ? kinds[0] : "X", ...(lect ? { p: lect } : {}), ...(ev.r ? { r: ev.r } : {}), ...(sub ? { g: sub } : {}), post: pi,
        };
        if (dup) item.dup = true;   // nie dopisujemy drugi raz, ale odwołane zajęcia pokażą termin odrabiania
        add(g, item);
        matched.add(ev);
        if (dup) continue;
        // "zajęcia odbędą się o 10:00 w sali 046" = te same zajęcia przeniesione w tym samym dniu
        if (ev.type === "change" && base) {
          for (const e of classesOn(plan, cal, g, ev.date).filter(e => e.pl === base.pl && (!lect || e.p === lect) && startOf(e) !== ev.start && (!sub || !e.g || e.g === sub)))
            add(g, { type: "cancel", date: ev.date, start: startOf(e), pl: e.pl, moved: true, ...(e.g ? { g: e.g } : {}), post: pi });
        }
      }
      // wpis dla grupy bez żadnej daty, którą umiemy przypiąć (np. "zmiana w planie od 26.10") → komunikat w tym dniu
      if (!matched.size) {
        const ds = findDates(text, year, fd);
        if (ds.length) add(g, { type: "note", date: ds[0].k, post: pi });
      }
    }
  });
  for (const g of known) out[g].sort((a, b) => (a.date + (a.start ? pad(toMin(a.start)) : "")).localeCompare(b.date + (b.start ? pad(toMin(b.start)) : "")));
  return out;
}

// ---------- odwołania z Teams (Skrót BM) ----------
// Adres i klucz publishable bazy Skrótu są publiczne z założenia (te same są w skrot-bm/skrot-supabase.js).
const SKROT_DB = { url: "https://zkyxujkdrovfzpasocmv.supabase.co", key: "sb_publishable_lVORMiTz9DlQaekBlfKf3Q_qPbKDHxb" };
function postJson(url, body, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(url, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), ...headers }, timeout: 30000 }, res => {
      let out = ""; res.setEncoding("utf8"); res.on("data", c => out += c);
      res.on("end", () => (res.statusCode === 200 ? resolve(JSON.parse(out || "null")) : reject(new Error(`HTTP ${res.statusCode}: ${out.slice(0, 200)}`))));
    });
    req.on("timeout", () => req.destroy(new Error("brak odpowiedzi przez 30 s")));
    req.on("error", reject); req.end(data);
  });
}
// Poprzednie wpisy z plan.json w tym samym kształcie, w jakim oddaje je baza.
function teamsFromOld(old) {
  const out = new Map();
  (old?.posts || []).forEach((p, pi) => { if (p.src === "teams") out.set(pi, { id: p.id, tid: p.tid || null, title: p.title, team: p.team, z: {} }); });
  for (const [g, list] of Object.entries(old?.zmiany || {})) for (const x of list) if (x.src === "teams" && out.has(x.post)) {
    const { src, post, posts: _p, ...rest } = x; (out.get(x.post).z[g] ||= []).push(rest);
  }
  return [...out.values()];
}
// Zatwierdzone wpisy: [{ id, tid, kind, title, team, z: { C112: [{ type: "cancel", date, start, pl, g?, moved? } | { type: "extra", … }] } }].
// Bez internetu (--offline) albo gdy baza nie odpowiada (np. przed uruchomieniem v26): poprzednie wpisy z plan.json.
// Test: --teams-file plik.json (odpowiedź funkcji bazy).
export async function fetchTeams(old, offline) {
  const i = process.argv.indexOf("--teams-file");
  if (i > 0) return Object.values(JSON.parse(fs.readFileSync(process.argv[i + 1], "utf8"))?.items || {});
  if (offline) return teamsFromOld(old);
  try {
    const r = await postJson(`${SKROT_DB.url}/rest/v1/rpc/nauka_odwolania_publiczne`, {}, { apikey: SKROT_DB.key, Authorization: `Bearer ${SKROT_DB.key}` });
    return Object.values(r?.items || {});
  } catch (e) {
    console.log(`Odwołania z Teams: baza Skrótu nie odpowiada (${e.message}). Zostają poprzednie.`);
    return teamsFromOld(old);
  }
}
// Dopisuje zatwierdzone odwołania z Teams do posts i zmiany (tylko grupy z planu). Zwraca nową listę posts.
export function mergeTeams(posts, zmiany, teams) {
  const all = posts.slice();
  for (const a of teams) {
    if (!a || typeof a.z !== "object" || !a.z) continue;
    const pi = all.length;
    all.push({ src: "teams", id: String(a.id || ""), ...(a.tid ? { tid: String(a.tid) } : {}), url: "", title: String(a.title || "Ogłoszenie w Teams").slice(0, 200), team: String(a.team || "").slice(0, 120), ym: "", text: "" });
    for (const [g, list] of Object.entries(a.z)) {
      if (!zmiany[g] || !Array.isArray(list)) continue;
      for (const x of list) {
        if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(x.date || "") || !/^\d{1,2}:\d{2}$/.test(x.start || "") || !x.pl) continue;
        // to samo odwołanie przyszło już z dziekanatu → zostaje wpis dziekanatu
        if (x.type === "cancel" && zmiany[g].some(y => y.type === "cancel" && y.src !== "teams" && y.date === x.date && y.start === x.start && y.pl === x.pl && (y.g || "") === (x.g || ""))) continue;
        // to samo odrabianie / zmiana jest już w komunikacie dziekanatu → zostaje wpis dziekanatu
        if (x.type === "extra" && zmiany[g].some(y => y.type === "extra" && y.src !== "teams" && y.date === x.date && y.start === x.start && y.pl === x.pl)) continue;
        if (x.type === "cancel") zmiany[g].push({ type: "cancel", date: x.date, start: x.start, pl: x.pl, ...(x.g ? { g: x.g } : {}), ...(x.moved ? { moved: true } : {}), src: "teams", post: pi, posts: [pi] });
        else if (x.type === "extra") zmiany[g].push({ type: "extra", kind: x.kind === "change" ? "change" : "makeup", date: x.date, start: x.start, end: x.end || plusMin(x.start, 90), pl: x.pl,
          ...(x.en ? { en: x.en } : {}), k: x.k || "X", ...(x.p ? { p: x.p } : {}), ...(x.r ? { r: x.r } : {}), ...(x.g ? { g: x.g } : {}), src: "teams", post: pi });
      }
    }
  }
  for (const g of Object.keys(zmiany)) zmiany[g].sort((a, b) => (a.date + (a.start ? pad(toMin(a.start)) : "")).localeCompare(b.date + (b.start ? pad(toMin(b.start)) : "")));
  return all;
}

// ---------- główny przebieg ----------
// Pamięć treści wpisów DOS dla roczników US (Etap 6): wpisy wszystkich sekcji od KEEP_FROM, odświeżane raz na PAMIEC_H godzin.
const PAMIEC_PLIK = "plan/_dos-wpisy.json", PAMIEC_H = 24;
const PAMIEC = { dane: {}, zmiana: false, wczytana: false };
function wczytajPamiec() {
  if (PAMIEC.wczytana) return; PAMIEC.wczytana = true;
  try { PAMIEC.dane = JSON.parse(fs.readFileSync(PAMIEC_PLIK, "utf8")).wpisy || {}; } catch { PAMIEC.dane = {}; }
}
function zapiszPamiec() {
  if (!PAMIEC.zmiana || NA_SUCHO) return;
  const wpisy = Object.fromEntries(Object.entries(PAMIEC.dane).filter(([, v]) => v.ym >= KEEP_FROM).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(PAMIEC_PLIK, JSON.stringify({ opis: "Treść wpisów DOS dla roczników US (scripts/dziekanat.mjs --kierunki): znany wpis pobierany ponownie raz na dobę, nie co godzinę.", wpisy }, null, 1) + "\n");
}
async function fetchPosts(known, old, source = SOURCE, K = BM) {
  const relevant = [];
  let url = source, pages = 0, total = 0;
  while (url && pages < MAX_PAGES) {
    const html = await get(url);
    if (html === null) break;
    const { posts, older } = parseList(html, url);
    pages++; total += posts.length;
    if (pages === 1 && posts.length < 3) throw new Error("Na stronie dziekanatu nie ma listy wpisów (zmienił się wygląd strony?)");
    for (const p of posts) if (p.ym >= KEEP_FROM && (K.wTytule ? K.wTytule(p) : groupsOf(p.title, known).length)) relevant.push(p);
    if (!posts.length || posts.every(p => p.ym < KEEP_FROM)) break;
    url = older ? new URL(older, url).href : null;
  }
  console.log(`Przejrzano ${pages} stron(y), ${total} wpisów; dla naszych grup: ${relevant.length}.`);
  const cache = new Map((old?.posts || []).map(p => [p.url, p]));
  for (const p of relevant) {
    const prev = cache.get(p.url);
    // roczniki US: treść znanego wpisu z plan/_dos-wpisy.json, gdy sprawdzona w ciągu doby (co godzinę tylko listy i nowe wpisy)
    const zap = K.pamiec ? PAMIEC.dane[p.url] : null;
    if (zap && Date.now() - Date.parse(zap.t) < PAMIEC_H * 36e5) { p.text = zap.text; p.pub = zap.pub || null; continue; }
    try {
      const html = await get(p.url);
      p.text = html ? parsePost(html) : "";
      p.pub = html ? parsePublished(html) : null;
    } catch (e) {
      console.log(`Nie udało się pobrać wpisu ${p.url}: ${e.message}`);
      p.text = prev?.text || "";
    }
    if (!p.pub && prev?.pub) p.pub = prev.pub;
    if (!p.text && prev?.text) p.text = prev.text;
    if (!p.text && zap?.text) { p.text = zap.text; p.pub ||= zap.pub || null; }
    if (K.pamiec && p.text) { PAMIEC.dane[p.url] = { ym: p.ym, ...(p.pub ? { pub: p.pub } : {}), t: new Date().toISOString(), text: p.text }; PAMIEC.zmiana = true; }
  }
  return relevant;
}

function writeData(plan, K = BM) {
  fs.writeFileSync(K.plik, JSON.stringify(plan, null, 1) + "\n");
  if (!K.html) return;
  const html = fs.readFileSync("index.html", "utf8");
  const start = "/*PLAN_DATA_START*/", end = "/*PLAN_DATA_END*/";
  const i = html.indexOf(start), j = html.indexOf(end);
  if (i < 0 || j < 0) throw new Error("Brak znaczników danych w index.html");
  fs.writeFileSync("index.html", html.slice(0, i + start.length) + JSON.stringify(plan) + html.slice(j));
}

function describe(item, posts) {
  const d = item.date.split("-").reverse().slice(0, 2).join(".");
  if (item.type === "cancel") return `- ❌ ${d} ${item.start} **${item.pl}**${item.g ? ` (laby ${item.g})` : ""} — ${item.moved ? "przeniesione" : "odwołane"}${item.src === "teams" ? " (ogłoszenie w Teams)" : ""}`;
  if (item.type === "extra" && item.dup) return `- ➕ ${d} ${item.start} **${item.pl}** — odrabianie (już jest w planie uczelni)`;
  if (item.type === "extra") return `- ➕ ${d} ${item.start}–${item.end} **${item.pl}**${item.g ? ` (laby ${item.g})` : ""}${item.r ? `, ${item.r}` : ""} — ${item.kind === "change" ? "zmiana godziny/sali" : "odrabianie"}`;
  return `- ℹ️ ${d} komunikat: ${short(posts[item.post]?.text || posts[item.post]?.title || "", 160)}`;
}

// Business Management: plan.json + kopia w index.html, sekcja DOS na Cukrowej, odwołania z Teams.
const BM = { plik: "plan.json", html: true, teams: true, opis: "1. roku BM", grupy: g => /^C11\d$/.test(g), source: async () => SOURCE };

// Adres sekcji DOS wydziału z bazy Skrótu (publiczna lista roczników, v31/v46).
let ROCZNIKI_DB = null;
async function dosUrl(wydzial, old) {
  try {
    ROCZNIKI_DB ||= await postJson(`${SKROT_DB.url}/rest/v1/rpc/nauka_roczniki_lista`, {}, { apikey: SKROT_DB.key, Authorization: `Bearer ${SKROT_DB.key}` });
    const u = (ROCZNIKI_DB || []).map(r => r.wydzial).find(w => w?.kod === wydzial && /^https:\/\//.test(w.dos_url || ""))?.dos_url;
    if (u) return u;
    console.log(`Baza Skrótu nie zna sekcji DOS wydziału ${wydzial}.`);
  } catch (e) { console.log(`Lista roczników z bazy Skrótu: ${e.message}.`); }
  return old?.source || null;
}

export function zKonfiguracji(c) {
  if (!c?.id || c.plik !== `plan/${c.id}.json` || !Array.isArray(c.grupy)) throw new Error(`Zła konfiguracja kierunku ${c?.id || "?"}`);
  return {
    plik: c.plik, html: false, teams: (c.odwolania || []).includes("teams"), opis: `${c.rok ? c.rok + ". roku " : ""}${c.kierunek?.pl || c.id}`,
    // "dos" w konfiguracji: rocznik ma zajęcia w innym budynku niż reszta wydziału (własna sekcja DOS)
    grupy: g => c.grupy.includes(g), source: old => /^https:\/\//.test(c.dos || "") ? Promise.resolve(c.dos) : dosUrl(c.wydzial?.kod, old),
  };
}

// Rocznik US spoza WEFiZ (Etap 6): wszystkie grupy planu, sekcja DOS wydziału, dopasowanie po kierunku/roku/prowadzącym.
export function zUS(c) {
  if (!c?.id || c.plik !== `plan/${c.id}.json` || !/^https:\/\//.test(c.dos || "")) throw new Error(`Zła konfiguracja rocznika ${c?.id || "?"}`);
  return {
    plik: c.plik, html: false, teams: false, bezMaila: true, opis: `${c.rok}. roku ${c.kierunek.pl} (${c.wydzial.kod})`, grupy: () => true, source: () => Promise.resolve(c.dos),
    zPlanem: plan => {
      const m = dopasowanie(c, plan);
      const dopasuj = (post, known) => { const x = m(post); return x ? known.map(g => ({ g, sub: "", ...(x.nr ? { nr: x.nr } : {}), niska: x.pewnosc === "niska", prowadzacy: x.prowadzacy })) : []; };
      const naszFormularz = formularzDla(c);
      const form = post => { const f = formularz(post.text); return f ? f.filter(naszFormularz) : null; };
      // treść każdego wpisu sekcji (formularz nie ma kierunku w tytule); pobierana raz na sekcję (CACHE), w pliku rocznika tylko wpisy, które go dotyczą
      return { pamiec: true, wTytule: () => true, istotny: p => { const f = form(p); return f ? f.length > 0 : !!m(p); }, opcje: { dopasuj, formularz: form, rozsz: true } };
    },
  };
}

const NA_SUCHO = process.argv.includes("--na-sucho");   // nic nie zapisuje (sprawdzenie na żywych danych)
async function main(K = BM) {
  const offline = process.argv.includes("--offline");
  const plan = JSON.parse(fs.readFileSync(K.plik, "utf8"));
  const known = Object.keys(plan.groups || {}).filter(K.grupy);
  const old = plan.dziekanat || null;
  // wpisy dziekanatu bez dopisanych odwołań z Teams (te liczymy osobno, niżej)
  const oldDz = old ? { ...old, posts: (old.posts || []).filter(p => p.src !== "teams") } : null;
  let posts, fetchError = null;
  const source = offline ? old?.source || SOURCE : await K.source(oldDz);
  if (offline || !source) posts = oldDz?.posts || [];
  else {
    try { posts = await fetchPosts(known, oldDz, source, K.zPlanem ? K.zPlanem(plan) : K); }
    catch (e) { fetchError = e; posts = oldDz?.posts || []; console.log(`Strona dziekanatu nie odpowiada (${e.message}). Liczę zmiany z zapisanych wpisów.`); }
  }
  posts = posts.map(({ url, title, ym, pub, text }) => ({ url, title, ym, ...(pub ? { pub } : {}), text: text || "" }));
  if (K.zPlanem) {
    const zp = K.zPlanem(plan);
    // treść zaczynająca się od nagłówka tabeli („Lp. Kierunek…”) → na stronie notka zaczyna się od tytułu wpisu
    posts = posts.filter(zp.istotny).map(p => (/^\s*Lp\./.test(p.text) && !p.text.startsWith(p.title) ? { ...p, text: `${p.title} — ${p.text}` } : p));
  }
  const zmiany = resolve(plan, posts, K.zPlanem ? K.zPlanem(plan).opcje : {});
  const teams = K.teams ? await fetchTeams(old, offline) : [];
  const allPosts = mergeTeams(posts, zmiany, teams);
  if (teams.length) console.log(`Odwołania z Teams (zatwierdzone w Skrócie BM): ${teams.length}.`);

  const next = { source: source || SOURCE, posts: allPosts, zmiany };
  const same = old && JSON.stringify({ ...old, updatedAt: undefined }) === JSON.stringify({ ...next, updatedAt: undefined });
  if (!same) {
    next.updatedAt = new Date().toISOString();
    plan.dziekanat = next;
    if (!NA_SUCHO) writeData(plan, K);
  }

  // Nowe wpisy dla naszych grup → mail (Issue na GitHubie)
  const oldUrls = new Set((oldDz?.posts || []).map(p => p.url));
  const fresh = old ? posts.filter(p => !oldUrls.has(p.url)) : [];
  const lines = [];
  for (const g of Object.keys(zmiany)) {
    const items = zmiany[g].filter(it => fresh.includes(posts[it.post]));
    if (items.length) lines.push(`### ${g}\n${items.map(it => describe(it, posts)).join("\n")}`);
  }
  if (fresh.length && !NA_SUCHO && !K.bezMaila) {   // roczniki US (Etap 6): komunikaty tylko na stronie, bez maila do starosty BM
    const body = `Na stronie dziekanatu pojawiły się nowe komunikaty dla ${K.opis}.\n\n${lines.join("\n\n") || "_Nie udało się ich przypiąć do konkretnych zajęć, zajrzyj do wpisów._"}\n\n` +
      `Wpisy:\n${fresh.map(p => `- [${p.title}](${p.url}): ${short(p.text || "", 300)}`).join("\n")}\n\n` +
      `Plan na plan.zdawalni.pl już to pokazuje. Sprawdź, czy dobrze to odczytał.`;
    if (K.html) fs.writeFileSync("dziekanat.md", body + "\n");
    else fs.appendFileSync("dziekanat.md", (fs.existsSync("dziekanat.md") ? "\n---\n\n" : "") + body + "\n");
  }

  for (const g of Object.keys(zmiany)) {
    console.log(`\n${g}:`);
    for (const it of zmiany[g]) console.log("  " + describe(it, posts));
  }
  console.log(same ? "\nBez zmian w komunikatach." : NA_SUCHO ? `\nNa sucho: zmiany dla ${K.plik} nie zapisane.` : `\nZapisano komunikaty dziekanatu w ${K.plik}.`);
  if (fetchError) {
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Strona dziekanatu nie odpowiada::${fetchError.message}`);
  }
  return { changed: !same, fresh: fresh.length > 0 };
}

export const mainDla = (K) => main(K);
export const _wczytaj = () => wczytajPamiec(), _zapisz = () => zapiszPamiec(), _pobierz = (u) => get(u);   // testy i sprawdzenia ręczne
// wszystkie wpisy sekcji od KEEP_FROM z treścią (próbki do testów, scripts/fixtures/dos/)
export const wszystkiePosty = (source) => fetchPosts([], null, source, { wTytule: () => true });

async function run() {
  let wynik = { changed: false, fresh: false }, failed = false;
  if (!process.argv.includes("--kierunki")) wynik = await main(BM);
  else {
    // kierunki/*.json + config/kierunki-1rok.json (scripts/roczniki.mjs), ten sam czytnik DOS co dla BM
    for (const c of roczniki()) {
      console.log(`\n== ${c.id} ==`);
      if (!fs.existsSync(c.plik)) { console.log(`Brak ${c.plik} (najpierw update-plan.mjs --wszystkie).`); continue; }
      try { const w = await main(zKonfiguracji(c)); wynik = { changed: wynik.changed || w.changed, fresh: wynik.fresh || w.fresh }; }
      catch (e) { console.error("BŁĄD:", c.id, e.message); failed = true; }
    }
    // pozostałe wydziały US (plan/<id>.json z importerów scripts/us/), Etap 6
    wczytajPamiec();
    for (const c of rocznikiUS()) {
      console.log(`\n== ${c.id} ==`);
      try { const w = await main(zUS(c)); wynik = { changed: wynik.changed || w.changed, fresh: wynik.fresh || w.fresh }; }
      catch (e) { console.error("BŁĄD:", c.id, e.message); failed = true; }
    }
    zapiszPamiec();
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${wynik.changed}\nfresh=${wynik.fresh}\n`);
  if (failed) throw new Error("Nie udało się odczytać komunikatów dla części roczników.");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  run().catch(err => {
    console.error("BŁĄD:", err.message);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=Komunikaty dziekanatu::${err.message}`);
    process.exit(1);
  });
}
