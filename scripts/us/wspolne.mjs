// Wspólne funkcje dla źródeł planów US (poza systemem WEFiZ, który ma scripts/uczelnia.mjs).
// Etap 0: grzeczne pobieranie z cache i skrótem sha256, odczyt XLSX (zip) bez zależności, pomocnicze funkcje tekstu.
// Etap 2 dołoży tu normalizację zajęć i zapis plan/<id>.json.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

export const UA = "plan-bm (projekt studencki, plany zajec US, 1 zapytanie/s; skrotbm@outlook.com)";
export const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const klucz = (u) => u.replace(/^https?:\/\//, "").replace(/[^A-Za-z0-9.]+/g, "_").slice(-90) + "-" + crypto.createHash("sha1").update(u).digest("hex").slice(0, 8);

// Pobieracz: ≤ 1 zapytanie/s (pauzaMs), User-Agent z adresem, cache w <dir>/strony i <dir>/pliki.
// strona(url) – zawsze z sieci (lista plików musi być świeża); offline → ostatnia zapisana.
// plik(url)   – plik planu: nazwa zmienia się przy każdej poprawce, więc cache po adresie; gdy plik jest w cache,
//               tylko HEAD (Content-Length / Last-Modified / ETag) – nowe pobranie, gdy się różni.
export function pobieracz({ dir = ".cache/us", pauzaMs = 1100, fetchFn = fetch, offline = false, log = () => {} } = {}) {
  const stat = { siec: 0, cache: 0, head: 0 };
  let ostatnie = 0;
  const czekaj = async () => { const c = ostatnie + pauzaMs - Date.now(); if (c > 0) await new Promise((r) => setTimeout(r, c)); ostatnie = Date.now(); };
  async function zapytanie(url, method = "GET") {
    for (let i = 0; i < 3; i++) {
      await czekaj();
      method === "HEAD" ? stat.head++ : stat.siec++;
      try {
        const r = await fetchFn(url, { method, headers: { "User-Agent": UA }, redirect: "follow" });
        if (r.status === 404 || r.status === 410) return { status: r.status };
        if (r.ok) return { status: r.status, naglowki: r.headers, buf: method === "HEAD" ? null : Buffer.from(await r.arrayBuffer()) };
      } catch { /* ponów */ }
      if (pauzaMs) await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error("brak odpowiedzi: " + url);
  }
  const meta = (h) => h ? { dlugosc: h.get("content-length"), zmiana: h.get("last-modified"), etag: h.get("etag") } : {};
  async function strona(url) {
    const f = path.join(dir, "strony", klucz(url));
    if (offline) { if (!fs.existsSync(f)) return null; stat.cache++; return fs.readFileSync(f, "utf8"); }
    const r = await zapytanie(url);
    if (!r.buf) return null;
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, r.buf);
    return r.buf.toString("utf8");
  }
  async function plik(url) {
    const f = path.join(dir, "pliki", klucz(url)), fm = f + ".meta.json";
    const stary = fs.existsSync(f) && fs.existsSync(fm) ? JSON.parse(fs.readFileSync(fm, "utf8")) : null;
    if (stary && offline) { stat.cache++; return { buf: fs.readFileSync(f), ...stary, zCache: true }; }
    if (offline) return null;
    if (stary) {
      const h = await zapytanie(url, "HEAD");
      const m = meta(h.naglowki);
      if (h.status === 404) return { brak: true };
      const taki = (m.etag && m.etag === stary.etag) || (m.dlugosc && m.dlugosc === stary.dlugosc && m.zmiana === stary.zmiana);
      if (taki) { stat.cache++; return { buf: fs.readFileSync(f), ...stary, zCache: true }; }
      log(`zmiana pliku pod tym samym adresem: ${url}`);
    }
    const r = await zapytanie(url);
    if (!r.buf) return { brak: true };
    const wpis = { url, sha256: sha256(r.buf), rozmiar: r.buf.length, ...meta(r.naglowki), pobrano: new Date().toISOString() };
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, r.buf);
    fs.writeFileSync(fm, JSON.stringify(wpis));
    return { buf: r.buf, ...wpis, zCache: false };
  }
  return { strona, plik, stat };
}

// ---------- tekst HTML ----------
const ENC = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", oacute: "ó", Oacute: "Ó" };
export const encje = (s) => String(s)
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENC[n] ?? m);
export const tekst = (html) => encje(String(html).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Kolejność nagłówków i odnośników w treści strony: [{t:"h", tekst, i}, {t:"a", tekst, url, i}].
// Nagłówek = h1–h6, strong, b, summary, th, tytuł zakładki akordeonu; nagłówek, który sam jest odnośnikiem, pomijamy
// (odnośnik i tak jest na liście).
export function sekwencja(html, base = "") {
  const h = String(html).replace(/<(script|style|nav|header|footer)\b[\s\S]*?<\/\1>/gi, (m) => " ".repeat(m.length));
  const out = [];
  for (const m of h.matchAll(/<a\b[^>]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let url = encje(m[1]).trim();
    try { url = new URL(url, base || undefined).href; } catch { /* zostaje */ }
    out.push({ t: "a", tekst: tekst(m[2]), url, i: m.index });
  }
  // Akapit zaczynający się od pogrubienia („<p><strong>PSYCHOLOGIA –</strong> studia jednolite…</p>”) to jeden nagłówek.
  const akapity = [];
  for (const m of h.matchAll(/<p\b[^>]*>\s*<(strong|b)>([\s\S]*?)<\/p>/gi)) {
    if (/<a\b/i.test(m[0])) continue;
    akapity.push([m.index, m.index + m[0].length]);
    const t = tekst(m[0]);
    if (t.length > 1 && t.length < 200) out.push({ t: "h", tekst: t, i: m.index });
  }
  for (const m of h.matchAll(/<(h[1-6]|strong|b|summary|th)\b[^>]*>([\s\S]*?)<\/\1>|<span class="vc_tta-title-text">([\s\S]*?)<\/span>/gi)) {
    const w = m[2] ?? m[3];
    if (/<a\b/i.test(w) || akapity.some(([a, b]) => m.index >= a && m.index < b)) continue;
    const t = tekst(w);
    if (t.length > 1 && t.length < 200) out.push({ t: "h", tekst: t, i: m.index });
  }
  return out.sort((a, b) => a.i - b.i);
}

export const nazwaPliku = (url) => { try { return decodeURIComponent(new URL(url).pathname.split("/").pop()); } catch { return String(url).split("/").pop(); } };

// ---------- daty w nazwach plików ----------
const RZYM = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 };
export const rzymska = (s) => RZYM[String(s).toUpperCase()] || null;
const iso = (r, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${r}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
// Rok akademicki: październik–grudzień = rok startu, styczeń–wrzesień = rok następny (dla dat bez roku, np. „akt. 30.10”).
export const rokDla = (m, startRoku) => (m >= 9 ? startRoku : startRoku + 1);
// „zm. 05 XI 2026”, „zm.-04-11-2026”, „od dnia 12.10.2026”, „akt. 30.10”, „6.11” → "2026-11-05" itd.; null, gdy brak daty
export function dataZNazwy(s, startRoku = 2026) {
  const t = String(s);
  let m = /(\d{1,2})[-. _]+(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)[-. _]+(20\d\d)/.exec(t);
  if (m) return iso(+m[3], rzymska(m[2]), +m[1]);
  m = /(?:^|\D)(\d{1,2})[-.](\d{1,2})[-.](20\d\d)(?!\d)/.exec(t);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = /(?:akt|zm|zjazd)[-. _]*(\d{1,2})\.(\d{1,2})(?!\d)/i.exec(t);
  if (m) return iso(rokDla(+m[2], startRoku), +m[2], +m[1]);
  return null;
}

// ---------- XLSX bez zależności (zip: katalog centralny + inflateRaw) ----------
export function zip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error("to nie jest plik zip");
  const ile = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const pliki = {};
  for (let k = 0; k < ile; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metoda = buf.readUInt16LE(p + 10), rozm = buf.readUInt32LE(p + 20), dl = buf.readUInt16LE(p + 28);
    const ex = buf.readUInt16LE(p + 30), km = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const nazwa = buf.toString("utf8", p + 46, p + 46 + dl);
    pliki[nazwa] = () => {
      const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
      const dane = buf.subarray(start, start + rozm);
      return metoda === 8 ? zlib.inflateRawSync(dane) : dane;
    };
    p += 46 + dl + ex + km;
  }
  return pliki;
}
// Napisy z arkusza (sharedStrings), w kolejności – wystarczą do rozpoznania tytułu pliku.
export function xlsxNapisy(buf) {
  const z = zip(buf);
  const ss = z["xl/sharedStrings.xml"];
  if (!ss) return [];
  return [...ss().toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => encje([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")).replace(/\s+/g, " ").trim());
}
export const xlsxArkusze = (buf) => { const w = zip(buf)["xl/workbook.xml"]; return w ? [...w().toString("utf8").matchAll(/<sheet\b[^>]*name="([^"]+)"/g)].map((m) => encje(m[1])) : []; };

// =====================================================================================================
// Etap 2: wspólne dla importerów planów z plików (XLSX, PDF, JSON) – wynik w formacie plan/<id>.json jak WEFiZ:
//   groups: { <grupa>: { odd: [wpis], even: [wpis] } }, wpis = { d, time:[HH:MM,HH:MM] | s, pl, en?, k, p, r, g?, dates?, n? }
// Zajęcia co tydzień = ten sam wpis w odd i even; tylko tygodnie nieparzyste/parzyste = jedna lista; konkretne daty → dates.
// =====================================================================================================
const DNI = [["pon", "pn", "mon"], ["wt", "tue"], ["śr", "sr", "wed"], ["czw", "cz", "thu"], ["pi", "pt", "fri"], ["so", "sb", "sat"], ["nie", "nd", "sun"]];
// „Poniedziałek”, „PON.”, „wtorek”, „Śr”, „Monday” → 0–6 (0 = poniedziałek, jak w planach WEFiZ); null, gdy nie wiadomo
export function dzienZ(s) {
  const t = String(s || "").trim().toLowerCase();
  if (!t) return null;
  const i = DNI.findIndex((w) => w.some((p) => t.startsWith(p)));
  return i < 0 ? null : i;
}
const hhmm = (h, m) => `${String(+h).padStart(2, "0")}:${String(m ?? "00").padStart(2, "0")}`;
// „08:15-09:45”, „8.15 – 9.45”, „8:15 - 9:00 9:00 - 9:45” (dwie godziny lekcyjne), „10-11.30” → ["08:15","09:45"]; null, gdy brak
export function godzinyZ(s) {
  const t = [...String(s || "").matchAll(/(?<!\d)([01]?\d|2[0-3])(?:[:.](\d{2}))?(?!\d)/g)].filter((m) => m[2] != null || /[-–]/.test(String(s)));
  const g = t.map((m) => hhmm(m[1], m[2]));
  if (g.length < 2) return null;
  const a = g[0], b = g[g.length - 1];
  return a < b ? [a, b] : null;
}
// rodzaj zajęć → k: W (wykład), CW (ćwiczenia), LAB, K (konwersatorium), S (seminarium), X (inne/nieznane)
export function rodzajZ(s) {
  const t = String(s || "").trim().toLowerCase().replace(/\.$/, "");
  if (!t) return "X";
  if (/^(w|wyk|wykł|wykład\w*|lecture|lec)$/.test(t) || /^wykład/.test(t)) return "W";
  if (/^(ć|c)w|^ćwicz|^cwicz|^class|^exercise|^tutorial/.test(t)) return "CW";
  if (/^(lab|lb|l)$|^laborat/.test(t)) return "LAB";
  if (/^(k|konw|kon)$|^konwersat/.test(t)) return "K";
  if (/^(s|sem|sm)$|^seminar/.test(t)) return "S";
  return "X";
}
// sala z budynkiem: („105”, „K”, {K:"ul. Krakowska 71-79"}) → „s. 105 (K)”; sala już z „s.” zostaje; budynek nieznany → bez dopisku
export function salaZ(sala, budynek = null, budynki = {}) {
  let r = String(sala || "").replace(/\s+/g, " ").trim();
  if (!r) return "";
  if (!/^(s\.|sala\b)/i.test(r) && /^[A-Z]?\d|^[A-Z]{1,4}\s*\d/.test(r)) r = "s. " + r;
  r = r.replace(/^sala\s+/i, "s. ");
  const b = budynek && String(budynek).trim();
  return b && (budynki[b] || /^[A-Z]{1,3}$/.test(b)) && !r.includes(`(${b})`) ? `${r} (${b})` : r;
}
export const prowadzacyZ = (s) => String(s || "").replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
// grupa i podgrupa: „gr. 1a”, „1 gr”, „C111 A”, „lab B” → { g: "1", sub: "A" }
export function grupaZ(s) {
  const t = String(s || "").trim();
  const m = /(?:gr\.?\s*)?([A-Z]?\d{1,4})\s*([a-dA-D])?\b/i.exec(t.replace(/\bgr(?:upa)?\.?\s*/i, ""));
  const lab = /\b(?:lab|gr\.?)\s*([A-D])\b/i.exec(t);
  return { g: m ? m[1].toUpperCase() : null, sub: (m?.[2] || lab?.[1] || "").toUpperCase() || null };
}

// Tygodnie: „co tydzień” → odd+even; „tydzień nieparzysty/parzysty” (I/II, „n”/„p”) → jedna lista; daty → dates (YYYY-MM-DD).
export function tydzienZ(s) {
  const t = String(s || "").toLowerCase();
  if (/nieparz|\btn\b|\bn\b|\(n\)/.test(t)) return "odd";
  if (/parzyst|\btp\b|\bp\b|\(p\)/.test(t)) return "even";
  return "both";
}
export function datyZ(s, startRoku = 2026) {
  const out = [];
  for (const m of String(s || "").matchAll(/(?<!\d)(\d{1,2})\.(\d{1,2})(?:\.(20\d\d))?(?!\d)/g)) {
    const mies = +m[2], r = m[3] ? +m[3] : rokDla(mies, startRoku);
    if (mies >= 1 && mies <= 12 && +m[1] >= 1 && +m[1] <= 31) out.push(`${r}-${String(mies).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`);
  }
  return [...new Set(out)].sort();
}
// Wkłada wpis do grupy: tydzien "both" | "odd" | "even"; z datami → dates (i do obu list, bo daty same wybierają tydzień).
export function dodaj(groups, grupa, wpis, { tydzien = "both", daty = null } = {}) {
  const g = (groups[grupa] ||= { odd: [], even: [] });
  const e = { ...wpis, ...(daty?.length ? { dates: daty } : {}) };
  for (const k of Object.keys(e)) if (e[k] == null || e[k] === "") delete e[k];
  const listy = daty?.length || tydzien === "both" ? ["odd", "even"] : [tydzien];
  for (const l of listy) g[l].push({ ...e });
  return groups;
}
const minuty = (e) => (e.time ? e.time[0] : String(e.s)).padStart(5, "0");
export function porzadkuj(groups) {
  const out = {};
  for (const g of Object.keys(groups).sort((a, b) => a.localeCompare(b, "pl", { numeric: true }))) {
    out[g] = {};
    for (const l of ["odd", "even"]) out[g][l] = (groups[g][l] || []).slice().sort((a, b) => a.d - b.d || minuty(a).localeCompare(minuty(b)) || String(a.pl).localeCompare(String(b.pl), "pl"));
  }
  return out;
}

// Walidacja planu: lista błędów (pusta = dobry plan). Ten sam format co plany WEFiZ.
export const RODZAJE = ["W", "CW", "LAB", "K", "S", "X"];
export function waliduj(plan) {
  const bledy = [];
  const gr = plan?.groups;
  if (!gr || !Object.keys(gr).length) return ["brak grup"];
  for (const [g, w] of Object.entries(gr)) {
    if (!Array.isArray(w.odd) || !Array.isArray(w.even)) { bledy.push(`${g}: brak list odd/even`); continue; }
    if (!w.odd.length && !w.even.length) bledy.push(`${g}: brak zajęć`);
    for (const e of [...w.odd, ...w.even]) {
      const gdzie = `${g}: ${e.pl || "?"}`;
      if (!(Number.isInteger(e.d) && e.d >= 0 && e.d <= 6)) bledy.push(`${gdzie}: dzień ${e.d}`);
      if (e.time) { if (!(Array.isArray(e.time) && e.time.length === 2 && e.time.every((t) => /^\d{2}:\d{2}$/.test(t)) && e.time[0] < e.time[1])) bledy.push(`${gdzie}: godziny ${JSON.stringify(e.time)}`); }
      else if (!(Number.isInteger(e.s) && e.s >= 0 && e.s <= 6)) bledy.push(`${gdzie}: brak godzin (time albo s)`);
      if (!e.pl) bledy.push(`${g}: zajęcia bez nazwy`);
      if (!RODZAJE.includes(e.k)) bledy.push(`${gdzie}: rodzaj ${e.k}`);
      if (e.dates && !(Array.isArray(e.dates) && e.dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))) bledy.push(`${gdzie}: daty ${JSON.stringify(e.dates)}`);
    }
  }
  return bledy;
}
export const liczbaZajecPlanu = (groups) => Object.values(groups || {}).reduce((s, g) => s + (g.odd?.length || 0) + (g.even?.length || 0), 0);

// Zapis plan/<id>.json. „Zły plan jest gorszy niż brak planu”: przy błędzie walidacji albo spadku liczby zajęć > 30%
// zostaje poprzednia wersja i wynik ma status „błąd”. Kalendarz i odwołania (dziekanat) z poprzedniej wersji zostają.
// meta: { kierunek, kierunekEn, id, kod, wydzial, rok, rokAkademicki?, semestr?, source (adres pliku), wersja, sha256? }
export function zapiszPlan(plik, groups, meta, { teraz = new Date().toISOString(), naSucho = false, czekaNaZatwierdzenie = false } = {}) {
  const stary = fs.existsSync(plik) ? JSON.parse(fs.readFileSync(plik, "utf8")) : null;
  const g = porzadkuj(groups);
  const wynik = { status: null, grupy: Object.keys(g).length, zajec: liczbaZajecPlanu(g), zrodlo: meta.source || null, wersja: meta.wersja || null };
  const bledy = waliduj({ groups: g });
  if (bledy.length) return { ...wynik, status: "błąd", blad: `plan nie przeszedł sprawdzenia: ${bledy.slice(0, 3).join("; ")}${bledy.length > 3 ? ` (+${bledy.length - 3})` : ""}. Zostaje poprzednia wersja.` };
  const przed = liczbaZajecPlanu(stary?.groups);
  if (przed && wynik.zajec < przed * 0.7) return { ...wynik, status: "błąd", blad: `Liczba zajęć spadła z ${przed} do ${wynik.zajec} (o ponad 30%). Zostaje poprzednia wersja.` };
  if (czekaNaZatwierdzenie) return { ...wynik, status: "czeka na zatwierdzenie" };
  const zmiana = !stary || JSON.stringify(stary.groups) !== JSON.stringify(g);
  if (!zmiana && stary.wersja === meta.wersja) {
    if (!naSucho) fs.writeFileSync(plik, JSON.stringify({ ...stary, checkedAt: teraz }, null, 1) + "\n");
    return { ...wynik, status: "bez zmian" };
  }
  const { source, wersja, sha256: sha, ...reszta } = meta;
  const dane = {
    source, wersja, ...(sha ? { sha256: sha } : {}), ...reszta,
    changedAt: zmiana ? teraz : stary.changedAt, checkedAt: teraz,
    groups: g,
    ...(stary?.kalendarz ? { kalendarz: stary.kalendarz } : {}),
    ...(stary?.dziekanat ? { dziekanat: stary.dziekanat } : {}),
  };
  if (!naSucho) { fs.mkdirSync(path.dirname(plik), { recursive: true }); fs.writeFileSync(plik, JSON.stringify(dane, null, 1) + "\n"); }
  return { ...wynik, status: !stary ? "nowy" : zmiana ? "zmiana" : "bez zmian" };
}

// ---------- XLSX: arkusze z komórkami i scaleniami (Etap 4, bez zależności) ----------
// → [{ nazwa, komorki: { "B5": "tekst" }, scalenia: [[c0,r0,c1,r1]] (kolumny i wiersze od 0), wiersze, kolumny, kolory: { "B5": "FFRRGGBB" } }]
export const kolumna = (lit) => [...lit].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
export const adres = (ref) => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return m ? [kolumna(m[1]), +m[2] - 1] : null; };
export const nazwaKomorki = (c, r) => { let s = "", n = c + 1; while (n) { const x = (n - 1) % 26; s = String.fromCharCode(65 + x) + s; n = (n - 1 - x) / 26; } return s + (r + 1); };
export function xlsxArkuszeDane(buf) {
  const z = zip(buf);
  const tekstPliku = (n) => (z[n] ? z[n]().toString("utf8") : "");
  const wspolne = xlsxNapisy(buf);
  const rels = Object.fromEntries([...tekstPliku("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  // kolory wypełnienia (styl komórki → fill → fgColor rgb); motyw/indeks pomijamy
  const st = tekstPliku("xl/styles.xml");
  const fills = [...(st.match(/<fills[\s\S]*?<\/fills>/)?.[0] || "").matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map((m) => /fgColor[^>]*rgb="([0-9A-F]{8})"/i.exec(m[1])?.[1] || null);
  const xfs = [...(st.match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0] || "").matchAll(/<xf\b([^>]*)/g)].map((m) => +(/fillId="(\d+)"/.exec(m[1])?.[1] || 0));
  const out = [];
  for (const m of tekstPliku("xl/workbook.xml").matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?>/g)) {
    const cel = rels[m[2]]; if (!cel) continue;
    const x = tekstPliku("xl/" + cel.replace(/^\/?xl\//, ""));
    const komorki = {}, kolory = {};
    let wiersze = 0, kolumny = 0;
    for (const c of x.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const r = /r="([A-Z]+\d+)"/.exec(c[1])?.[1]; if (!r) continue;
      const t = /t="([^"]+)"/.exec(c[1])?.[1], s = +(/s="(\d+)"/.exec(c[1])?.[1] || 0);
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] || "")?.[1];
      const is = /<is>([\s\S]*?)<\/is>/.exec(c[2] || "")?.[1];
      let wart = t === "s" ? wspolne[+v] : t === "inlineStr" ? encje([...(is || "").matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((q) => q[1]).join("")) : v != null ? encje(v) : null;
      const [ci, ri] = adres(r);
      const kol = fills[xfs[s]]; if (kol && kol !== "FFFFFFFF") kolory[r] = kol;
      if (wart != null && String(wart).trim() !== "") { komorki[r] = String(wart).replace(/\s+/g, " ").trim(); wiersze = Math.max(wiersze, ri + 1); kolumny = Math.max(kolumny, ci + 1); }
    }
    const scalenia = [...x.matchAll(/<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"/g)].map((q) => [...adres(q[1]), ...adres(q[2])]);
    out.push({ nazwa: encje(m[1]).trim(), komorki, scalenia, wiersze, kolumny, kolory });
  }
  return out;
}
