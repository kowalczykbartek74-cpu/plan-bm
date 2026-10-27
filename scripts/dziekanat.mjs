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
// Gdy strona dziekanatu nie odpowiada, skrypt liczy zmiany z wpisów zapisanych przy poprzednim sprawdzeniu.
// Uruchomienie lokalne bez internetu: node scripts/dziekanat.mjs --offline
// Node 20+, bez zależności.
import fs from "node:fs";
import https from "node:https";
import { pathToFileURL } from "node:url";

export const SOURCE = "https://dos.usz.edu.pl/cukrowa/zajecia-cukrowa/";
const MAX_PAGES = 8;                 // po 20 wpisów na stronie
const KEEP_FROM = "2026-09";         // starszych wpisów (rok-miesiąc z adresu) nie czytamy
const SLOTS = [["8:15","9:45"],["10:00","11:30"],["12:00","13:30"],["13:45","15:15"],["15:30","17:00"],["17:15","18:45"],["19:00","20:30"]];

// ---------- pobieranie ----------
function request(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "plan-bm (projekt studencki starosty BM, plan.skrotbm.pl)" }, timeout: 45000 }, res => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve(request(new URL(res.headers.location, url).href)); }
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
async function get(url) {
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
export function parseList(html) {
  const out = [], seen = new Set();
  const re = /<a\b[^>]*href="(https?:\/\/dos\.usz\.edu\.pl\/cukrowa\/(\d{4})\/(\d{2})\/[^"#?]+)"[^>]*>([\s\S]{1,300}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const url = m[1].replace(/\/?$/, "/");
    const title = toText(m[4]).replace(/\s+/g, " ").trim();
    if (!title || /czytaj dalej|read more/i.test(title) || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title, ym: `${m[2]}-${m[3]}` });
  }
  const older = /href="([^"]*\/zajecia-cukrowa\/page\/\d+\/[^"]*)"[^>]*>[^<]*(Starsze|Older)/i.exec(html);
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

// ---------- czytanie komunikatu ----------
const MONTHS = ["stycz", "lut", "mar", "kwie", "maj", "czerw", "lip", "sierp", "wrze", "październik", "listopad", "grud"];
const pad = n => String(n).padStart(2, "0");

// Grupy z tytułu: "GRUPA C111, C112, C113", "GRUPA C112a", "C111 i C113".
export function groupsOf(title, known) {
  const out = [];
  for (const m of title.matchAll(/C?\s?(1\d\d)([ab])?\b/gi)) {
    const g = "C" + m[1];
    if (known.includes(g)) out.push({ g, sub: m[2] ? m[2].toUpperCase() : "" });
  }
  // "GRUPA C111, C112, C113" bez litery C przy kolejnych numerach też się trafia
  return out.filter((x, i) => out.findIndex(y => y.g === x.g && y.sub === x.sub) === i);
}

// Wszystkie daty w tekście (12.11.2026, 3.11.2026 r., 7 października 2026) z pozycjami.
export function findDates(text, yearHint) {
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
export function readNotice(text, yearHint = 2026) {
  const dates = findDates(text, yearHint);
  const events = [];
  const lower = text.toLowerCase();
  const isChange = !/odwoł|odrab|odrob/.test(lower) && /odbęd/.test(lower);   // "zajęcia odbędą się o godz. 10:00 w sali 046"
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
    if (/odwołan\w*\s+(w\s+dniu|dnia)\s*$/i.test(before) || /odwoł/i.test(head)) {
      events.push({ type: "cancel", date: dt.k, starts: allStarts(head) });
      return;
    }
    const t = firstTime(after);
    if (t) {
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
export function resolve(plan, posts) {
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
    const text = post.text || post.title;
    const year = +(post.ym || "2026").slice(0, 4);
    const events = readNotice(text, year);
    for (const { g, sub: titleSub } of groupsOf(post.title, known)) {
      const all = ["odd", "even"].flatMap(w => plan.groups[g][w] || []);
      const lecturers = [...new Set(all.map(e => e.p).filter(Boolean))].filter(p => has(text, surnameStem(p)));
      const subjects = [...new Set(all.map(e => e.pl).filter(pl => pl && pl !== "Odrabianie zajęć"))]
        .filter(pl => strip(text).includes(strip(pl)) || all.some(e => e.pl === pl && e.en && strip(text).includes(strip(e.en))));
      const cancelled = [];
      const matched = new Set();

      for (const ev of events.filter(e => e.type === "cancel")) {
        let cands = classesOn(plan, cal, g, ev.date).filter(e => e.k !== "X");
        if (titleSub) cands = cands.filter(e => !e.g || e.g === titleSub);
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
        const ds = findDates(text, year);
        if (ds.length) add(g, { type: "note", date: ds[0].k, post: pi });
      }
    }
  });
  for (const g of known) out[g].sort((a, b) => (a.date + (a.start ? pad(toMin(a.start)) : "")).localeCompare(b.date + (b.start ? pad(toMin(b.start)) : "")));
  return out;
}

// ---------- główny przebieg ----------
async function fetchPosts(known, old) {
  const relevant = [];
  let url = SOURCE, pages = 0, total = 0;
  while (url && pages < MAX_PAGES) {
    const html = await get(url);
    if (html === null) break;
    const { posts, older } = parseList(html);
    pages++; total += posts.length;
    if (pages === 1 && posts.length < 3) throw new Error("Na stronie dziekanatu nie ma listy wpisów (zmienił się wygląd strony?)");
    for (const p of posts) if (p.ym >= KEEP_FROM && groupsOf(p.title, known).length) relevant.push(p);
    if (!posts.length || posts.every(p => p.ym < KEEP_FROM)) break;
    url = older ? new URL(older, url).href : null;
  }
  console.log(`Przejrzano ${pages} stron(y), ${total} wpisów; dla naszych grup: ${relevant.length}.`);
  const cache = new Map((old?.posts || []).map(p => [p.url, p]));
  for (const p of relevant) {
    const prev = cache.get(p.url);
    try {
      const html = await get(p.url);
      p.text = html ? parsePost(html) : "";
    } catch (e) {
      console.log(`Nie udało się pobrać wpisu ${p.url}: ${e.message}`);
      p.text = prev?.text || "";
    }
    if (!p.text && prev?.text) p.text = prev.text;
  }
  return relevant;
}

function writeData(plan) {
  fs.writeFileSync("plan.json", JSON.stringify(plan, null, 1) + "\n");
  const html = fs.readFileSync("index.html", "utf8");
  const start = "/*PLAN_DATA_START*/", end = "/*PLAN_DATA_END*/";
  const i = html.indexOf(start), j = html.indexOf(end);
  if (i < 0 || j < 0) throw new Error("Brak znaczników danych w index.html");
  fs.writeFileSync("index.html", html.slice(0, i + start.length) + JSON.stringify(plan) + html.slice(j));
}

function describe(item, posts) {
  const d = item.date.split("-").reverse().slice(0, 2).join(".");
  if (item.type === "cancel") return `- ❌ ${d} ${item.start} **${item.pl}**${item.g ? ` (laby ${item.g})` : ""} — ${item.moved ? "przeniesione" : "odwołane"}`;
  if (item.type === "extra" && item.dup) return `- ➕ ${d} ${item.start} **${item.pl}** — odrabianie (już jest w planie uczelni)`;
  if (item.type === "extra") return `- ➕ ${d} ${item.start}–${item.end} **${item.pl}**${item.g ? ` (laby ${item.g})` : ""}${item.r ? `, ${item.r}` : ""} — ${item.kind === "change" ? "zmiana godziny/sali" : "odrabianie"}`;
  return `- ℹ️ ${d} komunikat: ${short(posts[item.post]?.text || posts[item.post]?.title || "", 160)}`;
}

async function main() {
  const offline = process.argv.includes("--offline");
  const plan = JSON.parse(fs.readFileSync("plan.json", "utf8"));
  const known = Object.keys(plan.groups || {}).filter(g => /^C11\d$/.test(g));
  const old = plan.dziekanat || null;
  let posts, fetchError = null;
  if (offline) posts = old?.posts || [];
  else {
    try { posts = await fetchPosts(known, old); }
    catch (e) { fetchError = e; posts = old?.posts || []; console.log(`Strona dziekanatu nie odpowiada (${e.message}). Liczę zmiany z zapisanych wpisów.`); }
  }
  posts = posts.map(({ url, title, ym, text }) => ({ url, title, ym, text: text || "" }));
  const zmiany = resolve(plan, posts);

  const next = { source: SOURCE, posts, zmiany };
  const same = old && JSON.stringify({ ...old, updatedAt: undefined }) === JSON.stringify({ ...next, updatedAt: undefined });
  if (!same) {
    next.updatedAt = new Date().toISOString();
    plan.dziekanat = next;
    writeData(plan);
  }

  // Nowe wpisy dla naszych grup → mail (Issue na GitHubie)
  const oldUrls = new Set((old?.posts || []).map(p => p.url));
  const fresh = old ? posts.filter(p => !oldUrls.has(p.url)) : [];
  const lines = [];
  for (const g of Object.keys(zmiany)) {
    const items = zmiany[g].filter(it => fresh.includes(posts[it.post]));
    if (items.length) lines.push(`### ${g}\n${items.map(it => describe(it, posts)).join("\n")}`);
  }
  if (fresh.length) {
    const body = `Na stronie dziekanatu pojawiły się nowe komunikaty dla 1. roku BM.\n\n${lines.join("\n\n") || "_Nie udało się ich przypiąć do konkretnych zajęć, zajrzyj do wpisów._"}\n\n` +
      `Wpisy:\n${fresh.map(p => `- [${p.title}](${p.url}): ${short(p.text || "", 300)}`).join("\n")}\n\n` +
      `Plan na plan.skrotbm.pl już to pokazuje. Sprawdź, czy dobrze to odczytał.`;
    fs.writeFileSync("dziekanat.md", body + "\n");
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${!same}\nfresh=${fresh.length > 0}\n`);

  for (const g of Object.keys(zmiany)) {
    console.log(`\n${g}:`);
    for (const it of zmiany[g]) console.log("  " + describe(it, posts));
  }
  console.log(same ? "\nBez zmian w komunikatach." : "\nZapisano komunikaty dziekanatu w plan.json.");
  if (fetchError) {
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Strona dziekanatu nie odpowiada::${fetchError.message}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(err => {
    console.error("BŁĄD:", err.message);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=Komunikaty dziekanatu::${err.message}`);
    process.exit(1);
  });
}
