// Etap 4 planu całego US: importer Wydziału Humanistycznego (pliki XLSX ze strony hum.usz.edu.pl, plik na kierunek).
//
// Układ plików (obejrzane 8.11.2026: FA I i II st., HIST I i II st., FGzJA I st.):
// - Arkusz = rocznik. Nazwa arkusza („Historia-I-1”, „FA 1 rok II st.”, „FGzJA 1”) i nagłówki („HISTORIA 1 rok Ist. PONIEDZIAŁEK”,
//   „FILOLOGIA ANGIELSKA 1 rok I st. …”, tytuł „… 1 rok I stopnia”) podają rok i stopień. Plik „I i II st.” = kilka arkuszy.
// - Dzień = pas kolumn pod scalonym nagłówkiem z nazwą dnia (HIST: A–C, E–G…; FA: A–I, K–Q…; FGzJA: A–C, D–F…), między pasami
//   bywa pusta kolumna-odstęp. Pierwsza kolumna pasa to godziny: „08:15 - 09:00 09:00 - 9:45” scalone na 5 wierszy (90 min);
//   ostatni blok bywa krótszy („20:30-21:15”).
// - Nad godzinami (FA, FGzJA) wiersze nagłówków grup: FA – „ćwiczenia: GRUPA 1/2/3” (po 2 kolumny) i „laboratoria: GRUPA A…H”
//   (po 1 kolumnie), FGzJA – „1 gr”, „2 gr”. HIST nie ma nagłówków – grupa tylko w tekście („GRUPA 1a …”).
// - Zajęcia = scalona komórka: wiersze = czas (od bloku pierwszego wiersza do bloku ostatniego), kolumny = grupy. Komórka na całą
//   szerokość pasa (albo wykład) = cały rok. Kolory wypełnienia oznaczają prowadzących/przedmioty – nie niosą danych, pomijamy.
// - Tekst komórki pisany swobodnie, w różnej kolejności: przedmiot, rodzaj („(w)”, „(ć)”, „(lk)”, „lb -”, „ćw -”, „wykład”),
//   godziny („(30h)”, „(30)”, „- 15h”), prowadzący, sala („s.073 (IH)”, „sala 215 WH”, „ul. Wielkopolska 15, s. 325”), własna
//   godzina („od 8.15-10.30”, „[ 19.00-20.30]”) i terminy („od 12.10- 16.11”, „w 1 połowie semestru od 5.10-30.11”, „od 30.11.26”,
//   „(II poł. sem. od 02 XII.)”, „terminy: 01, 08,15, 22 grudnia”, „oprócz 16.11”, „odrabianie 05.11”).
// - Pod siatką legenda (budynki) – pomijamy (wiersze poniżej ostatniego bloku godzin).
// Czego nie da się pewnie odczytać, zostaje w notce „n” (oryginalny tekst terminów), a importer liczy ostrzeżenia do raportu.
import fs from "node:fs";
import { xlsxArkuszeDane, nazwaKomorki, adres, dzienZ, godzinyZ, rokDla, dodaj, rzymska } from "./wspolne.mjs";
import { kodStrony } from "../kierunki.mjs";

const DZIEN_RE = /(PONIEDZIA[ŁL]EK|WTOREK|[ŚS]RODA|CZWARTEK|PI[ĄA]TEK|SOBOTA)/i;
const GODZINY_RE = /^\s*\d{1,2}[:.]\d{2}\s*[-–]/;
const MIESIACE = { stycz: 1, lut: 2, marc: 3, kwiet: 4, maj: 5, czerw: 6, lip: 7, sierp: 8, wrze: 9, paźdz: 10, pazdz: 10, listop: 11, grud: 12 };
const iso = (r, m, d) => `${r}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const dzienTyg = (s) => (new Date(s + "T12:00:00Z").getUTCDay() + 6) % 7;
const plusDni = (s, n) => { const t = new Date(s + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

// ---------- semestr (z kalendarz.json: pierwszy i ostatni dzień tygodni zajęć) ----------
export function semestrZKalendarza(plik = "kalendarz.json") {
  const k = fs.existsSync(plik) ? JSON.parse(fs.readFileSync(plik, "utf8")) : null;
  const t = k?.tygodnie || [];
  return { od: t[0]?.[0] || "2026-10-01", do: t[t.length - 1]?.[1] || "2027-01-31" };
}

// ---------- rocznik arkusza: „HISTORIA 1 rok Ist.”, „FA 1 rok II st.”, „Historia-I-1”, „… 1 rok I stopnia”, „I rok MA” ----------
export function rocznikArkusza(ark) {
  const teksty = [ark.nazwa, ...Object.entries(ark.komorki).filter(([r]) => adres(r)[1] < 5).map(([, v]) => v)];
  for (const t of teksty) {
    const m = /(\d)\s*rok\s*(II|I)\s*(?:st|stop)/i.exec(t);
    if (m) return { rok: +m[1], stopien: m[2].toUpperCase() === "II" ? 2 : 1 };
  }
  const n = /-(II|I)-(\d)\s*$/.exec(ark.nazwa.trim());   // „Historia-II-1”
  if (n) return { rok: +n[2], stopien: n[1] === "II" ? 2 : 1 };
  const r = /\b(I|II|III|IV|V)\s*rok\b/.exec(ark.nazwa) || /\b(\d)\s*rok\b/.exec(ark.nazwa) || /\s(\d)\s*$/.exec(ark.nazwa);
  return r ? { rok: rzymska(r[1]) || +r[1], stopien: /II\s*st|MA\b/i.test(teksty.join(" ")) ? 2 : 1 } : null;
}

// ---------- godzina i daty z tekstu ----------
const czyGodzina = (h, m) => +h >= 7 && +h <= 21 && ["00", "15", "30", "45"].includes(m);
// własna godzina zajęć z tekstu: „od 8.15-10.30”, „od godz. 13.15 - 14.45”, „[ 19.00-20.30]”, „19:00–20:30”, „13.30-17.45[5h]”
export function godzinaZTekstu(t) {
  for (const m of String(t).matchAll(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/g)) {
    if (czyGodzina(m[1], m[2]) && czyGodzina(m[3], m[4])) {
      const g = godzinyZ(`${m[1]}:${m[2]}-${m[3]}:${m[4]}`);
      if (g) return { time: g, fragment: m[0] };
    }
  }
  return null;
}
// „12.10”, „16.11..2026”, „30.11.26”, „5.X”, „30 XI”, „02 XII” → [m, d, rok|null]; null, gdy to nie data
function data(s) {
  const m = /^(\d{1,2})\s*[. ]\s*(\d{1,2}|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)(?![A-Za-z])(?:\s*\.+\s*(\d{2,4}))?/.exec(s.trim());
  if (!m) return null;
  const mies = /^\d+$/.test(m[2]) ? +m[2] : rzymska(m[2]);
  if (/^\d+$/.test(m[2]) && czyGodzina(m[1], m[2].padStart(2, "0")) && m[2].length === 2 && +m[2] > 12) return null;
  if (!(mies >= 1 && mies <= 12 && +m[1] >= 1 && +m[1] <= 31)) return null;
  const rok = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
  return [mies, +m[1], rok];
}
const DATA_RE = String.raw`\d{1,2}\s*[. ]\s*(?:\d{1,2}|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)(?![\d:A-Za-z])(?:\s*\.+\s*\d{2,4})?\.?`;
// Daty zajęć z tekstu komórki (dzień tygodnia d). → { daty: [...] | null, fragmenty: [...], niejasne: bool }
export function datyZTekstu(t, d, sem, startRoku = 2026) {
  const tekst = String(t);
  const naIso = ([m, dd, r]) => iso(r || rokDla(m, startRoku), m, dd);
  const tydzien = (a, b) => { const out = []; let x = a; while (dzienTyg(x) !== d) x = plusDni(x, 1); for (; x <= b; x = plusDni(x, 7)) out.push(x); return out; };
  let daty = null, fragmenty = [], wyklucz = [];
  // „oprócz 16.11”
  for (const m of tekst.matchAll(new RegExp(String.raw`opr[óo]cz\s+(${DATA_RE}(?:\s*[,i]\s*${DATA_RE})*)`, "gi"))) {
    fragmenty.push(m[0]);
    for (const x of m[1].split(/\s*[,i]\s+/)) { const q = data(x); if (q) wyklucz.push(naIso(q)); }
  }
  // zakres „od A - B” / „A - B” (z datami po obu stronach)
  const zakresy = [...tekst.matchAll(new RegExp(String.raw`(?:od\s*)?(${DATA_RE})\s*[-–]+\s*(${DATA_RE})`, "gi"))].filter((m) => data(m[1]) && data(m[2]));
  if (zakresy.length) {
    daty = [];
    for (const m of zakresy) {
      const b = data(m[2]), a = data(m[1]);
      const ai = naIso(a), bi = naIso(b);
      if (ai > bi) continue;
      daty.push(...tydzien(ai, bi)); fragmenty.push(m[0]);
    }
  } else {
    const od = new RegExp(String.raw`\bod\s+(${DATA_RE})`, "i").exec(tekst), dO = new RegExp(String.raw`\bdo\s+(${DATA_RE})`, "i").exec(tekst);
    const a = od && data(od[1]), b = dO && data(dO[1]);
    if (a || b) { daty = tydzien(a ? naIso(a) : sem.od, b ? naIso(b) : sem.do); fragmenty.push(...[od?.[0], dO?.[0]].filter(Boolean)); }
  }
  // lista z nazwą miesiąca: „terminy: 01, 08,15, 22 grudnia”, „w dniach: 6, 13, 20 i 27 października 2026 r.”
  const lm = /((?:\d{1,2}\s*(?:,|i)\s*)*\d{1,2})\s+(stycz\w*|lut\w*|marc\w*|kwiet\w*|maj\w*|czerw\w*|lip\w*|sierp\w*|wrze\w*|pa[źz]dz\w*|listop\w*|grud\w*)(?:\s+(20\d\d))?/i.exec(tekst);
  if (lm && !daty) {
    const mies = Object.entries(MIESIACE).find(([k]) => lm[2].toLowerCase().startsWith(k))?.[1];
    daty = lm[1].split(/\s*(?:,|i)\s*/).filter(Boolean).map((x) => iso(lm[3] ? +lm[3] : rokDla(mies, startRoku), mies, +x)); fragmenty.push(lm[0]);
  }
  // pojedyncze daty („odrabianie 05.11”) – tylko gdy nic innego nie ma
  if (!daty) {
    const poj = [...tekst.matchAll(new RegExp(`(?<![\\d.])(${DATA_RE})`, "g"))].map((m) => [m[0], data(m[1])]).filter(([s, q]) => q && !wyklucz.includes(naIso(q)) && !fragmenty.some((f) => f.includes(s)));
    if (poj.length) { daty = poj.map(([, q]) => naIso(q)); fragmenty.push(...poj.map(([s]) => s)); }
  }
  if (!daty && wyklucz.length) daty = tydzien(sem.od, sem.do);   // co tydzień „oprócz 16.11”
  let niejasne = false;
  if (daty) {
    daty = [...new Set(daty)].filter((x) => !wyklucz.includes(x)).sort();
    if (daty.some((x) => dzienTyg(x) !== d)) { niejasne = true; daty = daty.filter((x) => dzienTyg(x) === d); }
    if (!daty.length) { daty = null; niejasne = true; }
  }
  if (!daty && /połow|poł\.\s*sem/i.test(tekst)) niejasne = true;
  return { daty, fragmenty, niejasne };
}

// ---------- tekst komórki: grupa, rodzaj, prowadzący, sala, przedmiot ----------
const TYTUL = String.raw`(?:prof\.\s*(?:dr\s*)?(?:hab\.?\s*)?|dr\s+hab\.?\s*|dr\s*inż\.?\s*|dr\.?\s+|mgr\s*inż\.?\s*|mgr\.?\s+)`;
const OSOBA_RE = new RegExp(String.raw`${TYTUL}(?:(?!(?:WNŚiP|WH|IH|WKFiZ|PNJA|ACKJ|Aula)\b)[A-ZŁŚŻŹĆŃÓ][\wąćęłńóśźżĄĆĘŁŃÓŚŹŻ'.-]*\.?\s*(?:-\s*)?){1,4}(?:,\s*prof\.?\s*US)?`, "g");
const SALA_RE = /(?:al\.\s*Piastów\s*\d+[a-z]?\s*,?\s*(?:bud\.\s*(?:nr\s*)?\d+\s*,?\s*)?)?(?:(?:ul\.\s*)?(?:Wielkopolska|Wielkopolskiej|Krakowska)\s*\d*[-\d]*\s*,?\s*)?(?:\(?WNŚiP\)?\s*,?\s*)?(?:Aula[^,;]*|\bgab\.\s*\d+[A-Za-z]*(?:\s*\((?:IH|[A-ZŚ]{1,6})\))?|\bs(?:ala|\.)\s*\.?\s*[A-Z]?\d+(?:-\d+)?[A-Za-z0-9/*]*(?:\s*\((?:IH|[A-ZŚ]{1,6})\))?(?:\s*,?\s*bud\.\s*\d+\s*[A-Za-zŚ]*)?(?:\s*WH\b)?)/gi;
const SPEC = { transl: "translatoryczna", naucz: "nauczycielska" };
export function grupaZTekstu(t) {
  const s = String(t);
  // specjalność: „specj. transl. gr specj. 1”, „specj. naucz. FA +FRzJO” → spec:translatoryczna 1 / spec:nauczycielska
  const sp = /specj\.?\s*(transl|naucz)\w*\.?(?:\s*gr\.?\s*specj\.?\s*(\d))?(?:\s*FA\s*\+\s*[A-Za-z]+)?/i.exec(s);
  if (sp) return { pg: "spec:" + SPEC[sp[1].toLowerCase()] + (sp[2] ? " " + sp[2] : ""), fragment: sp[0] };
  let m = /\bgr(?:upa)?\.?\s*lab\.?\s*([A-Z0-9]{1,2})\b/i.exec(s) || /\blab\.?\s+([A-H])\b/.exec(s); if (m) return { pg: "lab:" + m[1].toUpperCase(), fragment: m[0] };
  m = /\bgr(?:upa)?\.?\s*ćw\.?\s*(\d{1,2})\b/i.exec(s); if (m) return { pg: "ćw:" + m[1], fragment: m[0] };
  m = /\bGRUPA\s+(\d{1,2}[a-z]?)\b/i.exec(s) || /\bgr\.?\s*(\d{1,2}[a-z]?)(?:\s*IT)?\b/i.exec(s) || /\b(\d{1,2})\s*gr\b/i.exec(s);
  if (m) return { pg: "gr:" + m[1], fragment: m[0] };
  return null;
}
export function rodzajZTekstu(t) {
  const s = " " + String(t) + " ";
  if (/\(w\)|\bwykład|\bW\s*-\s*\d|\sw\s*-?\s*\d+\s*h|\sw\s+\d+\s*h/i.test(s) && !/\(ć\)|\(lk\)/.test(s)) return "W";
  if (/\(lk\)|\blk\b|lektorat/i.test(s)) return "CW";
  if (/\(k\)|konwersator/i.test(s)) return "K";
  if (/\(s\)|seminar|\bsem\.\s*dypl/i.test(s)) return "S";
  if (/\(ćw\s*\d/i.test(s)) return "CW";
  if (/\(ć\)|\bćw\b|grupa ćw|gr ćw|ćwiczeni/i.test(s)) return "CW";
  if (/\blab\b|\blb\b|laborat|PNJA/i.test(s)) return "LAB";
  return "X";
}
export function rozbierz(tekst) {
  // „dr E, Kopaczewska” (literówka w pliku) → „dr E. Kopaczewska”
  let s = String(tekst).replace(/\s+/g, " ").trim().replace(/\b((?:dr|mgr|prof\.)\s+[A-ZŁŚŻ]),\s+([A-ZŁŚŻŹĆ][a-ząćęłńóśźż])/g, "$1. $2");
  const wyciete = [], uwagi = [];
  // dopiski w nawiasach: „(w dniach 01.XII. i 08.XII. zajęcia w godz. 12:00-13:30)”, „(zajęcia łączone z FG+FP)” → notka
  s = s.replace(/\(([^()]*(?:w dniach|łączon|zgodnie z|wyborem|ostatnie zajęcia|pierwsze zajęcia)[^()]*)\)/gi, (x, w) => { if (!/poł\.?\s*sem/i.test(w)) uwagi.push(w.trim()); return /poł\.?\s*sem/i.test(w) ? x : " "; });
  const wytnij = (re) => { s = s.replace(re, (x) => { wyciete.push(x); return " "; }); };
  const osoby = [...s.matchAll(OSOBA_RE)].map((m) => m[0].replace(/[\s,.-]+$/, "").trim());
  wytnij(OSOBA_RE);
  const sale = [...s.matchAll(SALA_RE)].map((m) => m[0].replace(/^[\s,]+|[\s,]+$/g, "")).filter((x) => /\d|Aula/i.test(x));
  wytnij(SALA_RE);
  return { osoby: [...new Set(osoby)], sale, reszta: s, uwagi };
}
// przedmiot = to, co zostaje po wycięciu grupy, rodzaju, godzin, terminów, prowadzących i sal
export function przedmiot(reszta, wyciac = []) {
  let s = " " + reszta + " ";
  // fragment razem z poprzedzającym „zajęcia od godz.” / „od” / „tylko”
  for (const f of wyciac) if (f) s = s.replace(new RegExp(String.raw`(?:zajęcia\s+)?(?:(?:od|do|tylko|TYLKO)\s+)?(?:godz\.?\s*)?` + f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), " ");
  s = s
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\((?:I|II|1|2)\s*poł[^)]*\)/gi, " ")
    .replace(/zajęcia\s+(?:w\s+\d\s+połowie\s+semestru|od\s+godz\.?|w dniach:?|dla całego roku)/gi, " ")
    .replace(/\bw\s+\d\s+połowie\s+semestru\b/gi, " ")
    .replace(/\b(?:terminy|zajęcia)\s*:?/gi, " ")
    .replace(/\bwykład\b|\bI{1,3}\s+rok(?:\s+MA)?\b|\b\d\s*rok\b/gi, " ")
    .replace(/\((?:ćw|w|lab|lb)\s*\d+\s*(?:h|hr|godz)\.?\)|\(\s*\d+\s*(?:h|hr|godz)\.?\s*\)/gi, " ")
    .replace(/\(\s*\d+\s*h?r?\s*\)|[-–]?\s*\b\d+\s*h\b|\(\s*\d+\s*\)/gi, " ")
    .replace(/\b(?:I|II)\s*poł\.?\s*sem\.?|\bprowadzący\b|\bw\s+terminie\b|\bterminie\b/gi, " ")
    .replace(/\((?:w|ć|ćw|lk|k|s|lab|lb)\)/gi, " ")
    .replace(/(?:^|\s)(?:lb|ćw|lk)\s*(?=[-–]|\s|$)/g, " ")
    .replace(/(?:^|\s)[Ww]\s*(?=[-–]\s*\d|\d+\s*h)/g, " ")
    .replace(/\(?\s*wykład\s*\d+\s*(?:h|hr|godz)\.?\s*\)?/gi, " ")
    .replace(/[-–]?\s*dla wszystkich\b|\bZAJĘCIA\b|\bgodz\.(?=\s|$)/gi, " ")
    .replace(/\b(?:FA|FG|FH|FP|FN|FRzJO\w*|FRoszDJO|FGzJA|FGzDJO|ARCH|MiC|PGWSN|DiKS)(?:\s*GR\s*\d)?(?:\s*\+\s*[A-Za-z]+(?:\s*GR\s*\d)?)+/g, " ")
    .replace(/\b(?:od|do|oprócz)\b\s*(?=[,.;-]|\s*$)/gi, " ")
    .replace(/\bodrabianie\b|\bTYLKO\b|(?:^|\s)r\.(?=\s|$)|\b20\d\d\s*r\.?(?=\s|$)/g, " ")
    .replace(/(?:^|\s)(?:WNŚiP|WH|WKFiZ)(?=[\s,]|$)/g, " ")
    .replace(/\(\s*(?:w\s+)?(?:terminach|dniach)?\s*:?\s*\)/gi, " ")
    .replace(/\(\s*\)|\s+[,;:*]+(?=\s|$)|^[\s,;:*–-]+|\s[-–]\s*(?=[-–])/g, " ")
    .replace(/(?:\s*\/\s*)+(?=\s|$)|^\s*\/+/g, " ")
    .replace(/\s+-\s+/g, " – ")
    .replace(/\s{2,}/g, " ").trim()
    .replace(/^[,;:.\-–*\s]+|[,;:\-–*\s]+$/g, "");
  return s;
}

// ---------- siatka arkusza → zajęcia ----------
export function arkuszNaZajecia(ark, { sem = semestrZKalendarza(), startRoku = 2026 } = {}) {
  const zakres = (ref) => { const [c, r] = adres(ref); return ark.scalenia.find((q) => q[0] === c && q[1] === r) || [c, r, c, r]; };
  const ostrzezenia = [];
  // 1) pasy dni
  const naglowki = Object.entries(ark.komorki).filter(([r, v]) => adres(r)[1] <= 6 && DZIEN_RE.test(v) && !GODZINY_RE.test(v))
    .map(([r, v]) => { const z = zakres(r); return { d: dzienZ(DZIEN_RE.exec(v)[1].replace(/^Ś/i, "ś")), c0: z[0], c1: z[2], r1: z[3] }; })
    .sort((a, b) => a.c0 - b.c0);
  const pasy = [];
  for (const h of naglowki) {
    if (h.d == null || pasy.some((p) => p.d === h.d)) continue;
    // kolumna godzin: najwięcej komórek „08:15 - …” w pasie
    const kol = new Map();
    for (const [r, v] of Object.entries(ark.komorki)) { const [c] = adres(r); if (c >= h.c0 && c <= h.c1 && GODZINY_RE.test(v)) kol.set(c, (kol.get(c) || 0) + 1); }
    const ck = [...kol.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (ck == null) { ostrzezenia.push(`${ark.nazwa}: dzień ${h.d} bez kolumny godzin`); continue; }
    const bloki = Object.entries(ark.komorki).filter(([r, v]) => adres(r)[0] === ck && GODZINY_RE.test(v)).map(([r, v]) => { const z = zakres(r); return { r0: z[1], r1: z[3], time: godzinyZ(v) }; })
      .filter((b) => b.time).sort((a, b) => a.r0 - b.r0);
    pasy.push({ ...h, ck, bloki });
  }
  if (!pasy.length) return { wpisy: [], ostrzezenia: [`${ark.nazwa}: brak nagłówków dni`] };
  // 2) nagłówki grup nad godzinami (typ z etykiety w kolumnie godzin: „ćwiczenia”, „laboratoria”)
  const naglGrup = (p) => {
    const g = [], r0 = p.bloki[0]?.r0 ?? 0;
    for (const [ref, v] of Object.entries(ark.komorki)) {
      const [c, r] = adres(ref);
      if (c <= p.ck || c > p.c1 || r <= p.r1 || r >= r0) continue;
      const m = /GRUPA\s+([A-Z0-9]{1,2})\b/i.exec(v) || /\b(\d{1,2})\s*gr\b/i.exec(v);
      if (!m) continue;
      const et = ark.komorki[nazwaKomorki(p.ck, r)] || "";
      const typ = /laborat/i.test(et) ? "lab" : /ćwicz/i.test(et) ? "ćw" : "gr";
      const z = zakres(ref);
      g.push({ pg: `${typ}:${m[1].toUpperCase()}`, c0: z[0], c1: z[2], r });
    }
    return g;
  };
  // 3) komórki zajęć; „SPECJALNOŚĆ X” w siatce = nagłówek specjalności dla komórek pod nim (te same kolumny)
  const SPEC_RE = /^SPECJALNOŚĆ\s+(.+)$/i;
  const specy = Object.entries(ark.komorki).filter(([, v]) => SPEC_RE.test(v)).map(([ref, v]) => { const z = zakres(ref); return { nazwa: SPEC_RE.exec(v)[1].trim(), c0: z[0], c1: z[2], r: z[3] }; });
  const specDla = (z) => specy.filter((h) => h.r < z[1] && z[0] >= h.c0 && z[2] <= h.c1).sort((a, b) => b.r - a.r)[0];
  const wpisy = [];
  for (const p of pasy) {
    const grupy = naglGrup(p), ostatni = p.bloki[p.bloki.length - 1];
    const kolTresci = [...new Set(grupy.flatMap((g) => Array.from({ length: g.c1 - g.c0 + 1 }, (_, i) => g.c0 + i)))];
    for (const [ref, v] of Object.entries(ark.komorki)) {
      const [c, r] = adres(ref);
      if (c <= p.ck || c > p.c1 || r < p.bloki[0].r0 || r > ostatni.r1 || GODZINY_RE.test(v) && v.length < 40) continue;
      if (SPEC_RE.test(v) || /^(powyższe|uwaga\b)/i.test(v)) continue;   // nagłówek specjalności / uwaga do zajęć obok
      const z = zakres(ref);
      const b0 = p.bloki.find((b) => r >= b.r0 && r <= b.r1), b1 = p.bloki.find((b) => z[3] >= b.r0 && z[3] <= b.r1) || ostatni;
      if (!b0) continue;
      const gt = godzinaZTekstu(v);
      const time = gt ? gt.time : [b0.time[0], b1.time[1]];
      const gr = grupaZTekstu(v);
      const k = rodzajZTekstu(v);
      // grupy z kolumn: komórka na jedną grupę z nagłówka → ta grupa; na kilka albo na cały pas (albo wykład) → cały rok
      let pgi = gr ? [gr.pg] : [];
      const sp = !gr && specDla(zakres(ref));
      if (sp) pgi = ["spec:" + sp.nazwa.toLowerCase()];
      if (!gr && !sp && grupy.length && k !== "W") {
        const pasujace = grupy.filter((g) => g.c0 >= z[0] && g.c1 <= z[2]);
        const dokladne = grupy.filter((g) => g.c0 === z[0] && g.c1 === z[2]);
        if (dokladne.length) pgi = [dokladne.sort((a, b) => b.r - a.r)[0].pg];
        else if (pasujace.length === 0) { const w = grupy.filter((g) => z[0] >= g.c0 && z[2] <= g.c1); if (w.length) pgi = [w.sort((a, b) => b.r - a.r)[0].pg]; }
        else if (kolTresci.length && pasujace.length && new Set(pasujace.map((g) => g.pg.split(":")[0])).size === 1 && pasujace.length < grupy.filter((g) => g.pg.split(":")[0] === pasujace[0].pg.split(":")[0]).length) pgi = pasujace.map((g) => g.pg);
      }
      const dt = datyZTekstu(v, p.d, sem, startRoku);
      const { osoby, sale, reszta, uwagi } = rozbierz(v);
      // przy specjalności grupa z tekstu („gr lab 3”) zostaje w nazwie, w nawiasie na końcu
      const grSpec = gr && gr.pg.startsWith("spec:") ? /\bgr(?:upa)?\.?\s*(?:lab|ćw)\.?\s*[A-Z0-9]{1,2}\b|\blab\.?\s+\d\b/i.exec(v)?.[0] : null;
      let pl = przedmiot(reszta, [gt?.fragment, gr?.fragment, grSpec, ...dt.fragmenty]);
      if (grSpec && pl) pl += ` (${grSpec.replace(/^grupa/i, "gr").trim()})`;
      const sala = sale.join(", ").replace(/\(\s*(WNŚiP)\s*\)/g, "$1").replace(/\bsala\s+/gi, "s. ").replace(/\s+,/g, ",").replace(/,\s*,/g, ",").trim();
      const e = { d: p.d, time, pl: pl || v.slice(0, 80), k, p: osoby.join(", "), r: sala };
      if (dt.niejasne) e.n = v.length > 160 ? v.slice(0, 157) + "…" : v;
      else if (uwagi.length || /odrabian/i.test(v)) e.n = [/odrabian/i.test(v) ? "odrabianie" : "", ...uwagi].filter(Boolean).join("; ");
      if (!pl) ostrzezenia.push(`${ark.nazwa} ${ref}: nie odczytałem nazwy przedmiotu`);
      for (const pg of pgi.length ? pgi : [null]) wpisy.push({ ...e, ...(pg ? { pg } : {}), daty: dt.daty, komorka: ref, tekst: v });
    }
  }
  return { wpisy, ostrzezenia };
}

// ---------- plik → roczniki ----------
export function plikNaRoczniki(buf, zrodlo, kierunki, { sem, startRoku = 2026 } = {}) {
  const ark = xlsxArkuszeDane(buf);
  const out = [], ostrzezenia = [];
  for (const a of ark) {
    const rr = rocznikArkusza(a);
    if (!rr) { ostrzezenia.push(`${a.nazwa}: nie rozpoznaję roku i stopnia`); continue; }
    // kierunek: skrót z nazwy pliku dla tego stopnia (plik „FRZJOdW I st. i FROM II st.” ma dwa)
    const kz = zrodlo.kierunki.find((k) => (k.stopnie || [k.stopien]).includes(rr.stopien)) || zrodlo.kierunki[0];
    const k = kierunki.find((x) => x.kod === kz.kod) || kierunki.find((x) => x.skroty?.includes(kz.skrot));
    const r = k?.roczniki?.find((x) => x.stopien === rr.stopien && x.rok === rr.rok && x.tryb === zrodlo.tryb);
    if (!r) { ostrzezenia.push(`${a.nazwa}: brak rocznika ${kz.skrot} ${rr.stopien} st. ${rr.rok} rok w config/kierunki-us.json`); continue; }
    const { wpisy, ostrzezenia: o } = arkuszNaZajecia(a, { sem, startRoku });
    ostrzezenia.push(...o);
    out.push({ arkusz: a.nazwa, k, r, wpisy });
  }
  return { roczniki: out, ostrzezenia };
}

export function grupaPlanu(k, r) { return (k.kod || "").toUpperCase() + r.rok; }

// Kontrakt importera (scripts/us/importuj.mjs). Pilot: tylko kierunki z wydzial.tylkoKierunki (np. ["HIST","FA"]).
export async function importuj({ wydzial, zrodla, kierunki, pobieracz, log = () => {} }) {
  const sem = semestrZKalendarza();
  const startRoku = +sem.od.slice(0, 4) - (+sem.od.slice(5, 7) < 9 ? 1 : 0);
  const tylko = wydzial.tylkoKierunki || null;
  const wyniki = [];
  for (const z of zrodla.filter((x) => x.typ === "plan" && x.format === "xlsx" && x.tryb === "st" && !x.pominiety)) {
    if (tylko && !z.kierunki.some((k) => tylko.includes(k.kod))) continue;
    const f = await pobieracz.plik(z.url);
    if (!f || f.brak) { wyniki.push({ id: `wh-${z.plik}`, blad: "brak pliku " + z.url, kierunek: { pl: z.plik } }); continue; }
    const { roczniki, ostrzezenia } = plikNaRoczniki(f.buf, z, kierunki, { sem, startRoku });
    for (const q of ostrzezenia) log("WH: " + q);
    for (const { k, r, wpisy } of roczniki) {
      const groups = {}, g = grupaPlanu(k, r);
      for (const { daty, komorka, tekst, ...e } of wpisy) dodaj(groups, g, e, { daty });
      wyniki.push({ id: r.id, kod: kodStrony(k.kod, r.stopien, r.tryb, r.nabor), kierunek: { pl: k.pl, en: k.en || k.pl }, stopien: r.stopien, tryb: r.tryb, rok: r.rok,
        groups, source: z.url, wersja: z.wersja || z.plik, sha256: f.sha256, rokAkademicki: `${startRoku}/${startRoku + 1}`, semestr: "zimowy" });
    }
  }
  return wyniki;
}
