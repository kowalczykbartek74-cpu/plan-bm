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
