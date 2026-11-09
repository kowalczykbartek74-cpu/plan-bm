// Czytanie list planów ze stron wydziałów US (bez sieci: same funkcje na tekście HTML/JSON, testy na próbkach
// w scripts/fixtures/<wydział>/). Każda funkcja zwraca listę źródeł:
//   { url, plik, opis, format, tryb, typ: "plan"|"harmonogram"|"wf"|"sale",
//     kierunki: [{ nazwa?, skrot?, stopien|null, lata: [..]|null }], wersja (data z nazwy pliku albo null), wariant?, zjazd? }
// Stopień: 1, 2, 0 = jednolite. Nic tu nie zgadujemy: czego strona nie mówi, zostaje null.
import { semestrZKalendarza } from "./wh-xlsx.mjs";
import { sekwencja, nazwaPliku, dataZNazwy, rzymska } from "./wspolne.mjs";

const stopienZ = (s) => {
  const t = String(s || "");
  if (/jednolit|\bJM\b|P-SJM|N-PJM/i.test(t)) return 0;
  if (/drugiego|\bII\s*(st\.?|stop)|II stopnia|II st\b|\bMA\b/i.test(t)) return 2;
  if (/pierwszego|\bI\s*(st\.?|stop)|I stopnia|I st\b/i.test(t)) return 1;
  return null;
};
const lataZ = (s) => { const m = /ROK\s*(\d)(?:\s*[-–]\s*(\d))?/i.exec(s); if (!m) return null; const a = +m[1], b = +(m[2] || m[1]); return Array.from({ length: b - a + 1 }, (_, i) => a + i); };
const pdf = (u) => /\.pdf(\?|$)/i.test(u), xlsx = (u) => /\.xlsx?(\?|$)/i.test(u);

// Wiele wersji jednego pliku (np. FGzJA „przed” i „po redukcji grup”): obowiązuje najnowsza data w nazwie,
// starsze dostają pominiety + powód (raport). Klucz = kierunki + stopnie + tryb + rok.
// semestr z nazwy pliku („…semestr-letni-2026_2027…”, „…semestr zimowy…”) – null, gdy nazwa go nie podaje
export const semestrPliku = (plik) => (/letni|summer/i.test(plik) ? "letni" : /zimow|winter/i.test(plik) ? "zimowy" : null);
// Etap 8: z kilku plików tego samego kierunku obowiązuje plik bieżącego semestru (kalendarz.json), potem najnowsza wersja
export function obowiazujace(lista, { semestr = semestrZKalendarza().nazwa } = {}) {
  const kl = (z) => z.tryb + "|" + z.typ + "|" + z.kierunki.map((k) => `${k.skrot || k.nazwa}/${k.stopien}/${(k.stopnie || []).join(",")}/${(k.lata || []).join(",")}`).join("+") + "|" + (z.zjazd ?? "");
  const grupy = new Map();
  for (const z of lista) { const k = kl(z); grupy.set(k, [...(grupy.get(k) || []), z]); }
  for (const g of grupy.values()) {
    if (g.length < 2) continue;
    const sem = (z) => (semestrPliku(z.plik) === semestr ? 2 : semestrPliku(z.plik) ? 0 : 1);
    g.sort((a, b) => sem(a) - sem(b) || String(a.wersja || "").localeCompare(String(b.wersja || "")) || (/przed/i.test(a.wariant || "") ? -1 : 0));
    const nowy = g[g.length - 1];
    for (const z of g.slice(0, -1)) { z.pominiety = true; z.powod = `starsza wersja niż ${nowy.plik}`; }
  }
  return lista;
}

// ---------- Wydział Humanistyczny: XLSX, skrót kierunku i stopnie w nazwie pliku ----------
// „ARCH-I-i-II-st.-plan-zajec-…-zm.-05-XI-2026.xlsx”, „P_GWSN-3r-I-st.-…”, „FRZJOdW-I-st-i-FROM-II-st_plan-…”
const RE_WH = /(?:^|-)([A-Za-z][A-Za-z_]*?)-(?:(\d)r\.?-)?(I-[iI]-II|II|I)-st(?![a-z])/g;
export function zrodlaWH(html, tryb, base) {
  const out = [];
  for (const x of sekwencja(html, base)) {
    if (x.t !== "a" || !(xlsx(x.url) || pdf(x.url))) continue;
    const plik = nazwaPliku(x.url);
    if (/harmonogram[-_ ]zjazd/i.test(plik)) {
      if (!/26[-_ ]27/.test(plik)) continue; // poprzedni rok akademicki
      out.push({ url: x.url, plik, opis: x.tekst, format: "pdf", tryb, typ: "harmonogram", kierunki: [], wersja: null });
      continue;
    }
    if (!xlsx(x.url) || !/plan[-_ ]zaj/i.test(plik)) continue;
    const kierunki = [...plik.matchAll(RE_WH)].map((m) => ({
      skrot: m[1].replace(/_/g, "_"), stopien: null,
      stopnie: /i-II/i.test(m[3]) ? [1, 2] : m[3] === "II" ? [2] : [1],
      lata: m[2] ? [+m[2]] : null,
    }));
    const wariant = /przed[-_ ]reduk/i.test(plik) ? "przed redukcją grup" : /po[-_ ]reduk/i.test(plik) ? "po redukcji grup" : undefined;
    out.push({ url: x.url, plik, opis: x.tekst, format: "xlsx", tryb, typ: "plan", kierunki, wersja: dataZNazwy(plik), ...(wariant ? { wariant } : {}) });
  }
  return obowiazujace(out);
}

// ---------- Wydział Nauk Społecznych: PDF, nagłówek = kierunek, odnośnik = stopień i lata (st) albo zjazd (nst) ----------
export function zrodlaWNS(html, tryb, base) {
  const out = [];
  let naglowek = null;
  for (const x of sekwencja(html, base)) {
    if (x.t === "h") { naglowek = x.tekst; continue; }
    if (!pdf(x.url) || !/\/uploads\//.test(x.url) || !naglowek) continue;
    const plik = nazwaPliku(x.url);
    if (tryb === "st") {
      if (!/ROK\s*\d/i.test(x.tekst)) continue;
      const nazwa = naglowek.split(/\s+[–-]\s+/)[0].trim();
      const stopien = stopienZ(x.tekst) ?? stopienZ(naglowek);
      out.push({ url: x.url, plik, opis: `${naglowek}: ${x.tekst}`, format: "pdf", tryb, typ: "plan",
        kierunki: [{ nazwa, skrot: /^([A-Za-z]+)/.exec(plik)?.[1] || null, stopien, lata: lataZ(x.tekst) }], wersja: null });
    } else {
      const z = /zjazd/i.test(x.tekst) ? /(\d+)/.exec(x.tekst) : null;
      if (!z) continue;
      const termin = /zjazd\s*\d+\s+(.+)$/i.exec(x.tekst)?.[1] || null;
      out.push({ url: x.url, plik, opis: `${naglowek}: ${x.tekst}`, format: "pdf", tryb, typ: "plan",
        kierunki: [{ nazwa: naglowek, stopien: null, lata: null }], zjazd: +z[1], ...(termin ? { termin } : {}), wersja: null });
    }
  }
  return out;
}

// ---------- Wydział Nauk Ścisłych i Przyrodniczych: nagłówek „biologia I stopień”, odnośnik „biol_1 rok I st.” ----------
export function zrodlaWNSiP(html, tryb, base) {
  const out = [];
  let naglowek = null;
  for (const x of sekwencja(html, base)) {
    if (x.t === "h") { naglowek = /\b(I|II) stopień(?!\S)/.test(x.tekst) ? x.tekst : null; continue; }
    if (!pdf(x.url) || !naglowek) continue;
    const m = /^([A-Za-ząćęłńóśźż]+)_(\d)\s*r?ok\s+(I|II)\s*st/i.exec(x.tekst);
    if (!m) continue;
    const plik = nazwaPliku(x.url);
    out.push({ url: x.url, plik, opis: x.tekst, format: "pdf", tryb, typ: "plan",
      kierunki: [{ nazwa: naglowek.replace(/\s+(I|II) stopień.*$/, "").trim(), skrot: m[1], skrotPliku: /^([A-Za-z]+)/.exec(plik)?.[1] || null,
        stopien: m[3] === "II" ? 2 : 1, lata: [+m[2]] }], wersja: dataZNazwy(plik) });
  }
  return out;
}

// ---------- Wydział Prawa i Administracji: nagłówek „Administracja – studia I stopnia (stacjonarne)”, odnośnik „II rok A-SI” ----------
export function zrodlaWPIA(html, _tryb, base) {
  const out = [];
  let k = null, wRozkladach = false;
  for (const x of sekwencja(html, base)) {
    if (x.t === "h") {
      if (/^Rozkłady zajęć/i.test(x.tekst)) { wRozkladach = true; k = null; continue; }
      if (/^Kontakt$/i.test(x.tekst)) wRozkladach = false;
      const m = /^(.+?)\s+[–-]\s+(.+)$/.exec(x.tekst);
      k = wRozkladach && m && /stopnia|jednolite|studia/i.test(m[2])
        ? { nazwa: m[1].trim(), stopien: stopienZ(m[2]), tryb: /niestacjonarne/i.test(m[2]) ? "nst" : "st" } : null;
      continue;
    }
    if (!wRozkladach || !pdf(x.url)) continue;
    const plik = nazwaPliku(x.url);
    if (/sal/i.test(x.tekst) && /opis-sal/i.test(plik)) { out.push({ url: x.url, plik, opis: x.tekst, format: "pdf", tryb: "st", typ: "sale", kierunki: [], wersja: null }); continue; }
    if (!k) continue;
    const r = /^(I|II|III|IV|V)\s+rok\s+(\S+)/.exec(x.tekst), e = /(\d)\s*(st|nd|rd|th)\s*year/i.exec(x.tekst);
    const rok = r ? rzymska(r[1]) : e ? +e[1] : null;
    const skrot = r ? r[2].split("-")[0] : /^([A-Z]{2,})\b/.exec(x.tekst)?.[1] || null;
    const skrotPliku = /^(?:[IV]+-)?(?![IV]+[-.])([A-Z]{2,})(?=[-.])/.exec(plik)?.[1] || null;
    out.push({ url: x.url, plik, opis: x.tekst, format: "pdf", tryb: k.tryb, typ: "plan",
      kierunki: [{ nazwa: k.nazwa, skrot, skrotPliku, stopien: k.stopien, lata: rok ? [rok] : null }], wersja: null });
  }
  return out;
}

// ---------- Wydział Teologiczny: tabela „Tygodniowe plany zajęć” (dalej są roczne układy przedmiotów – to nie plany) ----------
export function zrodlaWT(html, tryb, base) {
  const out = [];
  let w = false;
  for (const x of sekwencja(html, base)) {
    if (x.t === "h") { if (/Tygodniowe plany/i.test(x.tekst)) w = true; else if (/układy przedmiotów|wykłady|wybor/i.test(x.tekst)) w = false; continue; }
    if (!w || !pdf(x.url)) continue;
    const plik = nazwaPliku(x.url);
    if (/wychowani/i.test(plik + x.tekst)) { out.push({ url: x.url, plik, opis: x.tekst, format: "pdf", tryb, typ: "wf", kierunki: [], wersja: null }); continue; }
    out.push({ url: x.url, plik, opis: x.tekst, format: "pdf", tryb, typ: "plan",
      kierunki: [{ nazwa: x.tekst.split(/\s+[–-]\s+/)[0].trim(), pelna: x.tekst, skrot: /^Plan-([A-Z]+)-/i.exec(plik)?.[1] || null, stopien: stopienZ(x.tekst), lata: null }], wersja: null });
  }
  return out;
}

// ---------- WKFiZ: aplikacja, dane z api/get_schedule.php (stacjonarne) i api/get_html_plans.php (lista grup niestacjonarnych) ----------
// Grupa w aplikacji = „<skrót> <rok> rok <I|II> stopień”, np. „MwS 2 rok I stopień”.
// „ERASMUS +” = zajęcia dla studentów z wymiany (1 semestr, plan w aplikacji jak 1. rok) → osobny „kierunek” ERAS
export const grupaWKFiZ = (g) => { if (/^ERASMUS\s*\+?$/i.test(String(g).trim())) return { skrot: "ERASMUS", rok: 1, stopien: 1 }; const m = /^(\S+)\s+(\d)\s+rok\s+(I|II)\s+stopień$/i.exec(String(g).trim()); return m ? { skrot: m[1], rok: +m[2], stopien: m[3].toUpperCase() === "II" ? 2 : 1 } : null; };
export function zrodlaWKFiZ(st, nst, urlSt, urlNst) {
  const out = [], niejasne = [];
  const licz = {};
  for (const c of st?.classes || []) licz[c.group] = (licz[c.group] || 0) + 1;
  const tryby = (st?.classes || []).reduce((m, c) => (m[c.studyMode] = 1, m), {});
  for (const [g, n] of Object.entries(licz)) {
    const p = grupaWKFiZ(g);
    if (!p) { niejasne.push(`WKFiZ: grupa „${g}” (${n} zajęć) nie ma formy „<kierunek> <rok> rok <stopień>”`); continue; }
    out.push({ url: urlSt, plik: "get_schedule.php", opis: g, format: "json", tryb: "st", typ: "plan",
      kierunki: [{ skrot: p.skrot, stopien: p.stopien, lata: [p.rok] }], grupa: g, zajec: n, wersja: st.timestamp || null });
  }
  for (const g of nst?.groups || []) {
    const p = grupaWKFiZ(g.group_name);
    if (!p) { niejasne.push(`WKFiZ niestacjonarne: grupa „${g.group_name}”`); continue; }
    out.push({ url: urlNst + "?group=" + encodeURIComponent(g.group_name), plik: "get_html_plans.php", opis: g.group_name, format: "html", tryb: "nst", typ: "plan",
      kierunki: [{ skrot: p.skrot, stopien: p.stopien, lata: [p.rok] }], grupa: g.group_name, wersja: g.last_update || null });
  }
  return { zrodla: out, niejasne, tryby: Object.keys(tryby) };
}

// ---------- oferta US (kandydaci.usz.edu.pl): nazwa kierunku, wydział, tryby ----------
export function ofertaUS(html, stopien) {
  const h = String(html);
  return h.split(/kierunek-archive/).slice(1).map((p) => {
    const t = p.slice(0, 3000);
    const nazwa = /<h2[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/.exec(t)?.[1];
    const url = /<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/.exec(t)?.[1];
    // pole wydziału: na stronie I st. klasa „…_wydzialu”, na II st. „ptb_studia_ii_stopnia_” – bierzemy pole, które zaczyna się od „Wydział”
    const wydz = [...t.matchAll(/ptb_select[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1]).find((x) => /^\s*Wydział/.test(x.replace(/<[^>]+>/g, "")));
    const tryb = /ptb_select[^"]*form[^>]*>([\s\S]*?)<\/div>/.exec(t)?.[1] || /(stacjonarna(?:\s*\/\s*niestacjonarna)?|niestacjonarna)/.exec(t.replace(/<[^>]+>/g, " "))?.[1];
    const czysc = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&#8212;|&#8211;/g, "—").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    return { nazwa: czysc(nazwa), wydzial: czysc(wydz), stopien, tryby: /niestacjonarna/.test(czysc(tryb)) ? (/(^|\s)stacjonarna/.test(czysc(tryb)) ? ["st", "nst"] : ["nst"]) : ["st"], url };
  }).filter((k) => k.nazwa);
}
