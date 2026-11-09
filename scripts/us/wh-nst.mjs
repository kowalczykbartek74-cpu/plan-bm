// Etap 7 (cały US): studia niestacjonarne Wydziału Humanistycznego – pliki XLSX ze strony hum.usz.edu.pl (plik na kierunek)
// i harmonogram zjazdów (PDF z warstwą tekstową, „Harmonogram zjazdów … r.a. 26_27”).
//
// Dwa układy (obejrzane 9.11.2026):
//  A) arkusz = ZJAZD („zjazd 1” … „zjazd 9”; FA I i II st.). Tytuł „… ZJAZD I : 9-11.10.2026r.”, kolumna A = godziny
//     („15:15 - 16:00 16:00 -16:45” – etykieta na dwa wiersze, wiersz = 45 min), kolumna B = dzień (PIĄTEK/SOBOTA/NIEDZIELA),
//     wiersz 2 = roczniki („ROK I (4 gr lab, 3 ćw)”, „ROK I ST. II …”), wiersz 3 = grupy kolumn. Zajęcia = ten sam tekst
//     w kolejnych wierszach kolumny; grupa z początku tekstu („I/1 (lab)” = lab:1, „II/2 (ćw)” = ćw:2, „specj. nauczyc.”).
//  B) arkusz = ROCZNIK („I rok”, „II rok I st.”; FG, FGzJA, FH). Kolumna A: dzień („PIĄTEK”), potem wiersze godzin
//     (FG: „17:00 - 17:45 17:45 - 18:30” = 90 min, FH: „15:15-16:00” = 45 min). Zjazd = pas kolumn od komórki z datą
//     (liczba-data Excela albo „9.10.2026”, „I zjazd 9-11.10.2026”) do następnej; pod datą bywają podgrupy („A”, „B”).
//     Komórka scalona na cały pas = cały rok, w jednej podkolumnie = ta podgrupa.
// Daty zjazdów: z harmonogramu (numer zjazdu → piątek–niedziela, „w formie e-zajęć”); daty z arkuszy są z nim sprawdzane –
// dzień spoza harmonogramu to ostrzeżenie w raporcie (plik bywa z literówką, np. „ZJAZD IX: 29.31-01.2027”).
import { xlsxArkuszeDane, adres, nazwaKomorki, dodaj } from "./wspolne.mjs";
import { rocznikArkusza, rozbierz, przedmiot, rodzajZTekstu, grupaZTekstu, semestrZKalendarza } from "./wh-xlsx.mjs";
import { pdfNaTekst } from "./wpia-pdf.mjs";
import { kodStrony } from "../kierunki.mjs";

const DZIEN_NST = /^(PI[ĄA]TEK|SOBOTA|NIEDZIELA)\b/i;
const D = { p: 4, s: 5, n: 6 };
const dzienNst = (v) => { const m = DZIEN_NST.exec(String(v).trim()); return m ? D[m[1][0].toLowerCase()] : null; };
const iso = (d) => d.toISOString().slice(0, 10);
const plus = (s, n) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const dz = (s) => (new Date(s + "T12:00:00Z").getUTCDay() + 6) % 7;
const pary = (s) => [...String(s).matchAll(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/g)].map((m) => [`${m[1].padStart(2, "0")}:${m[2]}`, `${m[3].padStart(2, "0")}:${m[4]}`]);
const RZ = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };

// ---------- harmonogram zjazdów (tekst PDF) ----------
// „1 09–11.10.2026 r. 12–14.03.2027 r. 2 23–25.10.2026 r. 19–21.03.2027 r. (zjazd w formie e-zajęć) …” – kolejno zima, lato
export function harmonogramZjazdow(tekst) {
  const t = String(tekst).replace(/\s+/g, " ");
  const zakresy = [...t.matchAll(/(?<![\d.])(\d{1,2})\s*[–-]\s*(\d{1,2})\.(\d{2})\.(20\d\d)\s*r\.?(\s*\(([^)]*)\))?/g)]
    .map((m) => { const od = `${m[4]}-${m[3]}-${m[1].padStart(2, "0")}`; return { od, do: plus(od, +m[2] - +m[1]), e: /e[-–]?\s*zaj/i.test(m[6] || ""), dodatkowy: /dodatk/i.test(m[6] || "") }; })
    .filter((z) => dz(z.od) === 4);   // zjazd zaczyna się w piątek (pomija sesje i przerwy)
  const zima = zakresy.filter((z) => z.od.slice(5, 7) >= "09" || z.od.slice(5, 7) <= "02");
  const lato = zakresy.filter((z) => !zima.includes(z));
  const nr = (l) => l.map((z, i) => ({ nr: i + 1, ...z, dni: [z.od, plus(z.od, 1), plus(z.od, 2)] }));
  return { zima: nr(zima), lato: nr(lato) };
}
export const dzienZjazdu = (zjazdy, data) => zjazdy.find((z) => z.dni.includes(data));

// data z komórki nagłówka: liczba Excela (46305), „24.10.2026”, „I zjazd 9-11.10.2026”, „9.10.2026 zajęcia zdalne”
export function dataKomorki(v) {
  const s = String(v).trim();
  if (/^\d{5}$/.test(s) && +s > 40000 && +s < 60000) return iso(new Date(Date.UTC(1899, 11, 30) + +s * 864e5));
  const m = /(?<![\d.])(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\.(\d{1,2})\.(20\d\d)/.exec(s);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

// ---------- tekst komórki → zajęcia ----------
const POMIN = /^(nie planować|nie rezerwować|uwaga\b|-+$)|^kody? do zajęć/i;
const SPOTKANIE = /DZIEŃ ADAPTACYJNY|spotkanie (?:z|organizacyjne)|odbędzie się spotkanie/i;
const SPEC_NST = [[/spec\p{L}*\.?\s*:?\s*(?:kształcenie\s+)?transl\p{L}*\.?|tłumaczeniow\p{L}*/iu, "spec:translatoryczna"], [/spec\p{L}*\.?\s*:?\s*naucz\p{L}*\.?|KPdWZN/iu, "spec:nauczycielska"]];
export function grupaNst(t, { stopien }) {
  const s = String(t);
  // „MA II/1 rok”, „MA II Specj.” – stopień i rok (bez grupy); „I/1 (lab)”, „II/2 (ćw)”, „II/ gr 1 specj. nauczyc. (ćw)”
  const ma = /^MA\s+II\s*(?:\/\s*\d(?:\s*rok)?)?\s*/i.exec(s);
  let reszta = ma ? s.slice(ma[0].length) : s, pg = null, frag = ma ? [ma[0]] : [];
  const pre = /^(?:I{1,3}|IV)\s*\/\s*(?:gr\.?\s*)?(\d[a-d]?)(?![\p{L}\d])\s*(?:spec\p{L}*\.?\s*\p{L}+\.?\s*)?\((lab|lb|ćw|ć)\.?\)/iu.exec(reszta)
    || /^(?:I{1,3}|IV)\s*\/\s*spec\w*\.?\s*\w+\.?\s*gr\.?\s*(\d)\s*\((lab|lb|ćw|ć)\.?\)/i.exec(reszta);
  if (pre && stopien === 1) pg = (/^l/i.test(pre[2]) ? "lab:" : "ćw:") + pre[1];
  if (!pg) { const sp = SPEC_NST.find(([re]) => re.test(reszta)); if (sp) { pg = sp[1]; frag.push(sp[0].exec(reszta)[0]); } }
  if (!pg) { const g = grupaZTekstu(reszta); if (g && !g.pg.startsWith("spec:")) { pg = g.pg; frag.push(g.fragment); } }
  // przedrostek roku („II/1”, „III rok”, „II/spec. transl.”) – wycinamy z nazwy
  const r = /^(?:I{1,3}|IV)\s*(?:\/\s*(?:gr\.?\s*\d[a-d]?|\d[a-d]?|spec\p{L}*\.?\s*\p{L}+\.?(?:\s*gr\.?\s*\d)?)?|\s+rok\b|(?=\s+spec)|(?=\s*\())/iu.exec(reszta);
  if (r) frag.unshift(r[0]);   // przed fragmentem specjalności (zawiera go)
  return { pg, fragmenty: frag };
}

// rodzaj: „W- 15h”, „w-2h”, „lab- 2h”, „ćw-2h”, „lb-2h”, „(ćw)”, „(lab)”, „(sem)”, „15lk”, „12ć”, „14W”
export function rodzajNst(t) {
  const m = /(?<![\p{L}])(W|w|ćw|ć|lab|lb|lk|k|s)\s*[-–]\s*(?=\d|\s|$)|(?<![\p{L}])(ćw)\.(?=\s*\d)|\d+\s*(W|w|ćw|ć|lab|lb|lk|k)(?![\p{L}])|\(\s*(w|ćw\.?|ć|lab|lb|sem|s|k|lk)\s*\)/u.exec(String(t));
  if (m) { const x = (m[1] || m[2] || m[3] || m[4]).toLowerCase().replace(".", ""); return { w: "W", k: "K", s: "S", sem: "S", lb: "LAB", lab: "LAB" }[x] || "CW"; }
  return rodzajZTekstu(t);
}

// komórka z kilkoma zajęciami rozdzielonymi kreskami („język włoski … ----- język hiszpański …”) → części; godzina z pierwszej
export function zajeciaKomorki(v, o) {
  const czesci = String(v).split(/\s*-{5,}\s*/).map((x) => x.trim()).filter((x) => x.length > 3);
  if (czesci.length < 2) { const e = zajeciaZTekstu(v, o); if (e) delete e.wlasny; return e ? [e] : []; }
  const out = [];
  for (const c of czesci) { const e = zajeciaZTekstu(c, { ...o, time: out[0]?.wlasny ? out[0].time : o.time }); if (e) out.push(e); }
  for (const e of out) { if (!e.r) e.r = out.find((x) => x.r)?.r || ""; delete e.wlasny; }
  return out;
}

export function zajeciaZTekstu(t0, { d, time, stopien, eZjazd = false }) {
  let t = String(t0).replace(/-{3,}/g, " ").replace(/\\/g, " ").replace(/\s+/g, " ").trim()
    // „dr hab. prof. US Małgorzata Makiewicz” → „dr hab. Małgorzata Makiewicz, prof. US”; „-Wielkopolska s. 208” → „ul. Wielkopolska, s. 208”
    .replace(/\b(dr hab\.)\s*prof\.?\s*US\s+((?:[A-ZŁŚŻŹĆ][\p{L}-]+\s*){1,2})/gu, (x, a, b) => `${a} ${b.trim()}, prof. US `)
    .replace(/\s*-\s*Wielkopolska\s+(?=s\.)/g, " ul. Wielkopolska 15, ")
    .replace(/\bzaj\.?\s+od\s+(\d{1,2})\s*-\s*(\d{1,2})\s*:\s*(\d{2})\b/g, "od $1.00-$2.$3").replace(/(\d[a-z]?)(WH)\b/g, "$1 $2");
  if (!t || t.length < 3 || POMIN.test(t)) return null;
  const uw0 = [];
  t = t.replace(/\s*UWAGA\b.*$/, (x) => { if (!/kody do zajęć/i.test(x)) uw0.push(x.trim()); return ""; })
    .replace(/\b(dr|mgr)(?=[A-ZŁŚŻŹĆ])/g, "$1 ").replace(/\b([A-Z][A-Za-z]{1,5}(?:=[A-Z][A-Za-z]{1,5})+)\b/g, (x) => x.replace(/=/g, "+"))
    .replace(/\.{2,}/g, ".").replace(/\.\s+\.(?=\s)/g, ".").replace(/\.\s*\.(?=\p{L})/gu, ". ").replace(/\bsala\s+sala\b/gi, "sala").replace(/,?\s*\bsala(?:\s+WH)?\s*$/i, "").replace(/\b(prof\.)\s*\.?(dr)/g, "$1 $2");
  const uwagi = [...uw0];
  if (SPOTKANIE.test(t)) return { d, time, pl: "Spotkanie organizacyjne (dzień adaptacyjny)", k: "X", p: "", r: "", n: t.length > 200 ? t.slice(0, 197) + "…" : t };
  // własne godziny: „od godz. 9.00-9.45”, „godz. 17.00 - 20.15”, „od 8.15- 12.30 - 5h”, „zajęcia do 14.15 [1h]”, „do godz. 17.45”
  const GODZ = /(?:zajęcia\s+)?(?:od\s+)?(?:godz\.?\s*)?(\d{1,2})[:.](\d{2})\s*(?:[-–]\s*(?:do\s+)?|do\s+)(\d{1,2})[:.](\d{2})(?:\s*[-–]?\s*\d\s*h\b)?(?:\s*\/\s*\d\s*h\s*\/)?/i;
  const ok = (h, m) => +h >= 7 && +h <= 21 && ["00", "15", "30", "45"].includes(m);
  const zakres = GODZ.exec(t);
  let wlasny = false;
  if (zakres && ok(zakres[1], zakres[2]) && ok(zakres[3], zakres[4])) { time = [`${zakres[1].padStart(2, "0")}:${zakres[2]}`, `${zakres[3].padStart(2, "0")}:${zakres[4]}`]; t = t.replace(zakres[0], " "); wlasny = true; }
  else {
    const doG = /(?:zajęcia\s+)?do\s+(?:godz\.?\s*)?(\d{1,2})[.:](\d{2})\s*(?:\[\s*\d+\s*h\s*\])?/i.exec(t);
    if (doG) { const k = `${doG[1].padStart(2, "0")}:${doG[2]}`; if (k > time[0] && k < time[1]) time = [time[0], k]; t = t.replace(doG[0], " "); }
    const odG = /(?:zajęcia\s+)?od\s+(?:godz\.?\s*)?(\d{1,2})[.:](\d{2})/i.exec(t) || /^(?:od\s+)?(\d{1,2})[.:](\d{2})\s*[-–]\s*(?=\p{L})/u.exec(t);
    if (odG) { const k = `${odG[1].padStart(2, "0")}:${odG[2]}`; if (k > time[0] && k < time[1]) time = [k, time[1]]; t = t.replace(odG[0], " "); }
  }
  if (/^\s*wykład ogólnouczelniany\b/i.test(t)) return { d, time, pl: "Wykład ogólnouczelniany", k: "W", p: "", r: "", wlasny };
  // wspólne zajęcia kilku kierunków („(FG+FA)”, „FG+FH”) → notka; sala „s. 310 a” → „s. 310a”
  t = t.replace(/\(?\b([A-Z][A-Za-z]{1,6}(?:\s*\+\s*[A-Z][A-Za-z]{1,6})+)\b\)?/g, (x, k) => { uwagi.push(`razem z ${k.replace(/\s+/g, "")}`); return " "; })
    .replace(/\b(s\.\s*\d+)\s+([a-z])\b/g, "$1$2");
  // Teams: „kod teams fxgg23g”, „Teams: x564cf5”, „kod TEAMS- 11c5dix”; e-zajęcia
  let zdalne = eZjazd;
  t = t.replace(/(?:kod\s*(?:do\s+)?(?:teams)?|teams)\s*[-:]?\s*([a-z0-9]{6,8})\b/gi, (x, kod) => { uwagi.push(`kod Teams: ${kod}`); zdalne = true; return " "; })
    .replace(/(?<![\p{L}\d.])(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{7}(?![\p{L}\d])/gu, (kod) => { uwagi.push(`kod Teams: ${kod}`); zdalne = true; return " "; })
    // kod bez cyfr na końcu komórki: tylko z literami rzadkimi w polszczyźnie (q, v, x) – „sqohjoi”, „miotdkv”
    .replace(/\s([a-z]{7})\s*$/, (x, kod) => { if (!/[qvx]/.test(kod)) return x; uwagi.push(`kod Teams: ${kod}`); zdalne = true; return " "; })
    .replace(/\s*\/?\s*zastępstwo\s+(?=(?:mgr|dr|prof))/gi, () => { uwagi.push("zastępstwo"); return ", "; })
    .replace(/\bsala\s+(\d+-\d+)\b/g, "s. $1");
  t = t.replace(/\be-\s*zajęcia\b\s*[-–]?/gi, () => { zdalne = true; return " "; });
  const { pg, fragmenty } = grupaNst(t, { stopien });
  const { osoby, sale, reszta, uwagi: u2 } = rozbierz(t);
  uwagi.push(...u2);
  let pl = przedmiot(reszta, fragmenty.map((f) => f.trim()).filter(Boolean))
    .replace(/^\s*(?:rok\s+)?[-–:,]\s*/, "").replace(/\s*\(\s*\d+\s*godz\.?\s*\)/gi, " ").replace(/\s*\/\s*\d+\s*h\s*\/\s*/g, " ")
    .replace(/\s*\(\s*\d+\s*(?:lk|lb|ć|w|W|ćw)\s*\)|,?\s*\b\d+\s*(?:lk|lb|ć|W|w)\b,?/g, " ")
    .replace(/(?:^|\s)(?:lab|lb|ćw\.?|W|w)\s*-\s*(?=\s|$)/g, " ").replace(/\s+(?:lab|lb|ćw|lk|w|W)\.?\s*$/, "").replace(/\s+-\s*(?=\s|$)/g, " ").replace(/(?:\s*-\s*(?:lk|\d+))+\s*$/, "").replace(/^([^(]*?)\s*\)\s*$/, "$1").replace(/[-–]\s*w\s*[-–]/g, "–").replace(/\(\s*(?:sem|ćw|lab|lb|kon|w|ć|k|lk|s)\.?\s*\)\s*/gi, " ").replace(/^\s*(?:ćw|lab|lb)\.?\s+/, "")
    .replace(/\b(?:gr\.?\s*\d+)\s*$/, "").replace(/(?<![\p{L}])gr\.?(?=\s|$)/gu, "").replace(/\bwykład\s*$/i, "").replace(/\s{2,}/g, " ").trim().replace(/\s*:\s*/g, ": ").replace(/^[\s:,–-]+|[\s:,–-]+$/g, "").replace(/\s{2,}/g, " ").trim();
  if (/^wykład do wyboru:?$/i.test(pl.split(":")[0]) && pl.includes(":")) pl = pl.split(":").slice(1).join(":").trim() + " (wykład do wyboru)";
  if (/^wykład\b/i.test(t) && /^(?:z|o|do)\s/.test(pl)) pl = "Wykład " + pl;
  else if (/^do wyboru\b:?\s*/i.test(pl)) pl = pl.replace(/^do wyboru\b:?\s*/i, "") + " (do wyboru)";
  // nazwa specjalności zostaje w grupie, nie w nazwie przedmiotu
  for (const [re] of SPEC_NST) pl = pl.replace(new RegExp("^\\s*(?:" + re.source + ")\\s*", "iu"), "");
  const sala = sale.join(", ").replace(/\bsala\s+(?:sala\s+)?/gi, "s. ").replace(/\bs\.(?=\d)/g, "s. ").trim();
  const e = { d, time, pl: pl || t.slice(0, 80), k: rodzajNst(t0), p: osoby.join(", "), r: sala || (zdalne ? "e-zajęcia" : "") };
  if (zdalne && sala) uwagi.unshift("e-zajęcia");
  if (uwagi.length) e.n = uwagi.join("; ");
  if (pg) e.pg = pg;
  if (!pl) e.bezNazwy = true;
  if (wlasny) e.wlasny = true;
  return e;
}

// ---------- układ A: arkusz = zjazd ----------
export function arkuszZjazdu(ark, { zjazd = null } = {}) {
  const ostrzezenia = [], wpisy = [];
  const kom = ark.komorki, w = (c, r) => kom[nazwaKomorki(c, r)];
  const tytul = Object.entries(kom).filter(([r]) => adres(r)[1] === 0).map(([, v]) => v).join(" ");
  const nrZ = +(/zjazd\s+(\d+)/i.exec(ark.nazwa)?.[1] || RZ[/ZJAZD\s+([IVX]+)/i.exec(tytul)?.[1]?.toUpperCase()] || 0);
  const piatek = zjazd?.dni?.[0] || dataKomorki(tytul);
  if (!piatek) return { wpisy, ostrzezenia: [`${ark.nazwa}: brak daty zjazdu`] };
  // roczniki z wiersza nagłówków („ROK I”, „ROK II ST. II”)
  const roczniki = Object.entries(kom).filter(([r, v]) => adres(r)[1] <= 3 && /^ROK\s+(III|II|IV|I|V)\b/i.test(v))
    .map(([r, v]) => { const m = /^ROK\s+(III|II|IV|I|V)\b(?:\s+ST\.?\s*(II|I)\b)?/i.exec(v); return { c0: adres(r)[0], rok: RZ[m[1].toUpperCase()], stopien: m[2]?.toUpperCase() === "II" ? 2 : 1 }; })
    .sort((a, b) => a.c0 - b.c0);
  roczniki.forEach((x, i) => { x.c1 = (roczniki[i + 1]?.c0 ?? ark.kolumny) - 1; });
  if (!roczniki.length) return { wpisy, ostrzezenia: [`${ark.nazwa}: brak nagłówków roczników`] };
  // wiersze: godzina (etykieta w kolumnie A na dwa wiersze) i dzień (kolumna B)
  const czas = {}, dzien = {};
  let d = null;
  for (let r = 0; r < ark.wiersze; r++) {
    const db = dzienNst(w(1, r) || "") ?? dzienNst(w(0, r) || ""); if (db != null) d = db;
    const p = pary(w(0, r) || "");
    if (p.length) { czas[r] = p[0]; if (p[1]) czas[r + 1] = p[1]; }
    if (czas[r] && d != null) dzien[r] = d;
  }
  for (const rr of roczniki) {
    const widziane = new Set();
    for (let c = Math.max(2, rr.c0); c <= rr.c1; c++) {
      for (let r = 0; r < ark.wiersze; r++) {
        const v = w(c, r); if (!v || !czas[r] || dzien[r] == null) continue;
        if (r > 0 && w(c, r - 1) === v && czas[r - 1] && dzien[r - 1] === dzien[r]) continue;   // środek serii
        let r1 = r; while (w(c, r1 + 1) === v && czas[r1 + 1] && dzien[r1 + 1] === dzien[r]) r1++;
        const klucz = `${r}|${r1}|${v}`; if (widziane.has(klucz)) continue; widziane.add(klucz);
        const data = plus(piatek, dzien[r] - 4);
        for (const e of zajeciaKomorki(v, { d: dzien[r], time: [czas[r][0], czas[r1][1]], stopien: rr.stopien, eZjazd: !!zjazd?.e })) {
        if (e.bezNazwy) { ostrzezenia.push(`${ark.nazwa} ${nazwaKomorki(c, r)}: nie odczytałem nazwy przedmiotu`); delete e.bezNazwy; }
        wpisy.push({ ...e, rocznik: { stopien: rr.stopien, rok: rr.rok }, daty: [data], komorka: nazwaKomorki(c, r), zjazd: nrZ });
        }
      }
    }
  }
  return { wpisy, ostrzezenia };
}

// ---------- układ B: arkusz = rocznik, zjazdy w pasach kolumn ----------
export function arkuszRocznikaNst(ark, { zjazdy = [] } = {}) {
  const ostrzezenia = [], wpisy = [];
  const rocznik = rocznikArkusza(ark);
  if (!rocznik) return { wpisy, ostrzezenia: [`${ark.nazwa}: nie rozpoznaję roku i stopnia`] };
  const kom = ark.komorki, w = (c, r) => kom[nazwaKomorki(c, r)];
  const scal = (c, r) => ark.scalenia.find((q) => q[0] === c && q[1] === r) || [c, r, c, r];
  // sekcje dni: wiersz z nazwą dnia w kolumnie A
  const dni = [], poza = [], grupyPasa = {};
  for (let r = 0; r < ark.wiersze; r++) { const d = dzienNst(w(0, r) || ""); if (d != null && !pary(w(0, r) || "").length) dni.push({ d, r0: r }); }
  dni.forEach((x, i) => { x.r1 = (dni[i + 1]?.r0 ?? ark.wiersze) - 1; });
  for (const s of dni) {
    const godziny = [];
    for (let r = s.r0; r <= s.r1; r++) { const p = pary(w(0, r) || ""); if (p.length) { const [, , , r1] = scal(0, r); godziny.push({ r0: r, r1, time: [p[0][0], p[p.length - 1][1]] }); } }
    if (!godziny.length) { ostrzezenia.push(`${ark.nazwa}: dzień ${s.d} bez godzin`); continue; }
    const g0 = godziny[0].r0;
    // pasy zjazdów: komórki z datą nad godzinami
    const pasy = [];
    for (let r = s.r0; r < g0; r++) for (let c = 1; c < ark.kolumny; c++) {
      const v = w(c, r); const data = v && dataKomorki(v);
      if (data && !pasy.some((p) => p.c0 === c)) pasy.push({ c0: c, data, e: /zdaln|e-\s*zaj/i.test(v) });
    }
    pasy.sort((a, b) => a.c0 - b.c0).forEach((p, i) => { p.c1 = (pasy[i + 1]?.c0 ?? ark.kolumny) - 1; });
    // piątkowy nagłówek bywa tylko w wierszu nad pierwszym dniem (FG: „I zjazd 9.10.2026” w wierszu 3, dzień w wierszu 2) – jest w sekcji
    for (const p of pasy) {
      if (dz(p.data) !== s.d) {
        // „I zjazd 9-11.10.2026” w nagłówku piątku: data = początek zjazdu → dzień sekcji
        const nowa = plus(p.data, s.d - dz(p.data));
        if (dz(p.data) === 4 && s.d > 4) p.data = nowa;
        else ostrzezenia.push(`${ark.nazwa}: data ${p.data} w sekcji dnia ${s.d}`);
      }
      const z = zjazdy.length ? dzienZjazdu(zjazdy, p.data) : null;
      if (zjazdy.length && !z) poza.push(p.data);
      p.zjazd = z; if (z?.e) p.e = true;
      // podgrupy pod datą: „A”, „B”, „gr 1”
      p.grupy = [];
      for (let r = s.r0; r < g0; r++) for (let c = p.c0; c <= p.c1; c++) {
        const v = (w(c, r) || "").trim(); const m = /^(?:gr(?:upa)?\.?\s*)?([A-D]|\d)$/i.exec(v);
        if (m) p.grupy.push({ c, pg: "gr:" + m[1].toUpperCase() });
      }
      // podgrupy podane tylko pod piątkiem (FH) obowiązują też w sobotę i niedzielę tego pasa
      if (p.grupy.length) grupyPasa[p.c0] = p.grupy; else p.grupy = grupyPasa[p.c0] || [];
    }
    const wiersz = (r) => godziny.find((g) => r >= g.r0 && r <= g.r1);
    for (const p of pasy) {
      const widziane = new Set();
      for (let c = p.c0; c <= p.c1; c++) for (const g of godziny) {
        const v = w(c, g.r0); if (!v) continue;
        const [c0, , c1, r1s] = scal(c, g.r0);
        const poprz = godziny[godziny.indexOf(g) - 1];
        if (poprz && w(c, poprz.r0) === v && scal(c, poprz.r0)[3] === g.r0 - 1) continue;   // środek serii
        let koniec = wiersz(r1s) || g, gi = godziny.indexOf(koniec);
        while (godziny[gi + 1] && w(c, godziny[gi + 1].r0) === v && scal(c, godziny[gi + 1].r0)[0] === c0) { gi++; koniec = godziny[gi]; koniec = wiersz(scal(c, koniec.r0)[3]) || koniec; gi = godziny.indexOf(koniec); }
        const klucz = `${c0}|${g.r0}`; if (widziane.has(klucz)) continue; widziane.add(klucz);
        for (const e of zajeciaKomorki(v, { d: s.d, time: [g.time[0], koniec.time[1]], stopien: rocznik.stopien, eZjazd: p.e })) {
        if (e.bezNazwy) { ostrzezenia.push(`${ark.nazwa} ${nazwaKomorki(c, g.r0)}: nie odczytałem nazwy przedmiotu`); delete e.bezNazwy; }
        // podgrupa z kolumny: komórka w jednej podkolumnie pasa z podgrupami
        if (!e.pg && p.grupy.length > 1) { const gr = p.grupy.filter((x) => x.c >= c0 && x.c <= Math.min(c1, p.c1)); if (gr.length === 1) e.pg = gr[0].pg; }
        wpisy.push({ ...e, rocznik, daty: [p.data], komorka: nazwaKomorki(c, g.r0), zjazd: p.zjazd?.nr || null });
        }
      }
    }
  }
  if (poza.length) ostrzezenia.push(`${ark.nazwa}: ${poza.length} dni spoza harmonogramu zjazdów (np. ${poza.slice(0, 3).join(", ")})`);
  return { wpisy, ostrzezenia };
}

export const czyArkuszZjazdu = (ark) => /^\s*zjazd\s+\d+/i.test(ark.nazwa) || Object.entries(ark.komorki).some(([r, v]) => adres(r)[1] === 0 && /ZJAZD\s+[IVX]+\s*:/i.test(v));

// ---------- plik → wpisy wszystkich roczników ----------
export function plikNst(buf, { zjazdy = [] } = {}) {
  const wpisy = [], ostrzezenia = [];
  for (const a of xlsxArkuszeDane(buf)) {
    if (!Object.keys(a.komorki).length) continue;
    let r;
    if (czyArkuszZjazdu(a)) {
      const nr = +(/zjazd\s+(\d+)/i.exec(a.nazwa)?.[1] || 0);
      const z = zjazdy[nr - 1] || null;
      const tytul = Object.entries(a.komorki).filter(([q]) => adres(q)[1] === 0).map(([, v]) => v).join(" ");
      const zt = dataKomorki(tytul);
      if (z && zt && zt !== z.dni[0]) ostrzezenia.push(`${a.nazwa}: data w tytule (${zt}) ≠ harmonogram (${z.dni[0]}) – biorę harmonogram`);
      r = arkuszZjazdu(a, { zjazd: z });
    } else r = arkuszRocznikaNst(a, { zjazdy });
    wpisy.push(...r.wpisy); ostrzezenia.push(...r.ostrzezenia);
  }
  return { wpisy, ostrzezenia };
}
export const rocznikiPlikuNst = (wpisy) => [...new Map(wpisy.map((w) => [`${w.rocznik.stopien}-${w.rocznik.rok}`, w.rocznik])).values()];

// te same zajęcia w kilku zjazdach → jeden wpis z listą dat
export function zlozNst(wpisy) {
  const m = new Map();
  for (const w of wpisy) {
    const { daty, komorka, zjazd, rocznik, ...e } = w;
    const k = JSON.stringify([rocznik.stopien, rocznik.rok, e.pg || "", e.d, e.time, e.pl, e.k, e.p, e.r, e.n || ""]);
    const x = m.get(k); if (x) { for (const d of daty) if (!x.daty.includes(d)) x.daty.push(d); } else m.set(k, { rocznik, e, daty: [...daty] });
  }
  const out = {};
  for (const { rocznik, e, daty } of m.values()) (out[`${rocznik.stopien}-${rocznik.rok}`] ||= []).push({ e, daty: daty.sort() });
  return out;
}

// ---------- importer (wołany z wh-xlsx.mjs → importuj) ----------
export async function importujNst({ zrodla, kierunki, pobieracz, log = () => {} }) {
  const sem = semestrZKalendarza();
  const startRoku = +sem.od.slice(0, 4) - (+sem.od.slice(5, 7) < 9 ? 1 : 0);
  const wyniki = [];
  let zjazdy = [];
  const h = zrodla.find((x) => x.typ === "harmonogram" && x.tryb === "nst");
  if (h) {
    const f = await pobieracz.plik(h.url);
    try { if (f && !f.brak) zjazdy = harmonogramZjazdow(pdfNaTekst(f.buf).strony.map((s) => (s.slowa || s.words || []).map((x) => x.t ?? x.text ?? x[4]).join(" ")).join(" "))[sem.nazwa === "letni" ? "lato" : "zima"]; }
    catch (e) { log(`WH nst: harmonogram nieczytelny (${e.message}) – daty tylko z arkuszy`); }
  }
  if (!zjazdy.length) log("WH nst: brak harmonogramu zjazdów – daty tylko z arkuszy (bez sprawdzenia)");
  for (const z of zrodla.filter((x) => x.typ === "plan" && x.format === "xlsx" && x.tryb === "nst" && !x.pominiety)) {
    const f = await pobieracz.plik(z.url);
    if (!f || f.brak) { wyniki.push({ id: `wh-nst-${z.plik}`, blad: "brak pliku " + z.url, kierunek: { pl: z.plik } }); continue; }
    const { wpisy, ostrzezenia } = plikNst(f.buf, { zjazdy });
    for (const q of ostrzezenia) log(`WH nst ${z.kierunki[0]?.skrot}: ${q}`);
    const kz = z.kierunki[0];
    const k = kierunki.find((x) => x.kod === kz?.kod) || kierunki.find((x) => x.skroty?.includes(kz?.skrot));
    if (!k) { wyniki.push({ id: `wh-nst-${z.plik}`, blad: `brak kierunku ${kz?.skrot} w config/kierunki-us.json`, kierunek: { pl: z.plik } }); continue; }
    const plany = zlozNst(wpisy);
    for (const r of (k.roczniki || []).filter((x) => x.tryb === "nst" && x.zrodlo === z.url)) {
      const lista = plany[`${r.stopien}-${r.rok}`];
      if (!lista?.length) { wyniki.push({ id: r.id, kierunek: { pl: k.pl }, blad: `${z.plik}: brak zajęć ${r.stopien} st. ${r.rok} roku` }); continue; }
      // arkusz z datami spoza harmonogramu (np. zeszłoroczny) – zły plan jest gorszy niż brak planu
      const daty = [...new Set(lista.flatMap((x) => x.daty))], poza = zjazdy.length ? daty.filter((d) => !dzienZjazdu(zjazdy, d)) : [];
      // bez harmonogramu (albo z nim) – daty poza bieżącym semestrem z kalendarz.json też odrzucają rocznik (plik z innego semestru)
      const pozaSem = daty.filter((d) => d < sem.od || d > sem.do);
      if (pozaSem.length > daty.length / 2) { wyniki.push({ id: r.id, kierunek: { pl: k.pl }, blad: `${z.plik}: ${pozaSem.length} z ${daty.length} dni poza semestrem ${sem.nazwa} (${sem.od}–${sem.do}) – plik z innego semestru?` }); continue; }
      if (poza.length > daty.length / 2) { wyniki.push({ id: r.id, kierunek: { pl: k.pl }, blad: `${z.plik}: ${poza.length} z ${daty.length} dni poza harmonogramem zjazdów (np. ${poza.slice(0, 2).join(", ")}) – arkusz z innego roku?` }); continue; }
      if (poza.length) log(`WH nst ${r.id}: ${poza.length} dni poza harmonogramem (${poza.join(", ")}) – zostają`);
      const groups = {}, g = (k.kod || "").toUpperCase() + r.rok;
      for (const { e, daty } of lista) dodaj(groups, g, e, { daty });
      wyniki.push({ id: r.id, kod: kodStrony(k.kod, r.stopien, r.tryb, r.nabor), kierunek: { pl: k.pl, en: k.en || k.pl }, stopien: r.stopien, tryb: r.tryb, rok: r.rok,
        groups, source: z.url, wersja: z.wersja || z.plik, sha256: f.sha256, rokAkademicki: `${startRoku}/${startRoku + 1}`, semestr: sem.nazwa || "zimowy" });
    }
  }
  return wyniki;
}
