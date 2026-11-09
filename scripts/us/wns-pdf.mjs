// Etap 5 planu całego US: parser planów Wydziału Nauk Społecznych (PDF, nsp.usz.edu.pl/studenci/plany-zajec-studia-stacjonarne/).
//
// Dwa układy (obejrzane 9.11.2026 na wszystkich 34 plikach studiów stacjonarnych):
// A) „dni w kolumnach” – Socjologia, Socjotechnika (SIOS), Social Sciences; plik = jeden rok. Wiersz nagłówka z dniami
//    (Poniedziałek … Piątek, w SS „Monday/Poniedziałek”), pod nim kolumny „Grupa 1”, „Grupa 2” (SS: „Group 1”), z lewej kolumna
//    „Godz” z blokami „8.15 / - / 9.45”. Druga strona bywa dalszym ciągiem (wieczorne bloki) bez nagłówka – bierzemy dni z pierwszej.
// B) „tabela na dzień” – pozostałe kierunki; plik = zwykle kilka roczników (BN-I: rok 1–3). Nad tabelą nazwa dnia, w tabeli
//    kolumny godzin („8.15 – 9.45” …), z lewej „Rok stud.” (I, II, III), „Specj./grupa” („BN-SI.26-11”, „1 BP”, „1 ćw”, „2 lab”)
//    i czasem „lab” (Psychologia: „PSYC-SJM.26-1-L.3”). Dzień ciągnie się przez kolejne strony, dopóki nie pojawi się następny.
// Zajęcia = komórka ograniczona czarnymi liniami (tło nie niesie danych). Godziny: z pierwszej linii komórki („Godz. 9.00-11.30”,
// „15.15 – 18.30”, „Zajęcia w godz. 9:05 – 11:30”), a gdy jej brak – z bloków/kolumn, które komórka zajmuje. Grupy: wiersze/kolumny
// zajęte przez komórkę → pole „pg” („gr:11”, „ćw:1”, „lab:3”, „spec:BP”); komórka przez cały rok = bez „pg”.
// Tekst komórki: nazwa, rodzaj („Wykład (45)”, „(w:30)”, „(ć:15)”, „(lb:30)”, „– ćw.”, „lecture (30)”), prowadzący, terminy po
// rzymsku („Od 6X do 24 XI”, „5 X – 30 XI”, „Termin: 5,12,19 X; 7,14 XII”, „Tylko 9X”, „From 2X to 20 XI (without 15X)”), sala
// („s. 117”, „sala 21H”, „s. 40/O” – litera = budynek: K ul. Krakowska 71-79, O ul. Ogińskiego 16-17 → „s. 40 ul. Ogińskiego 16-17”).
// Wyjątki („ostatnie zajęcia w godz. 10.00-10.45”, „(24XI w godz. 8.15-9.00)”, „Od 7 XII: s. 43/O”) idą do notki.
// Wynik zawsze idzie do kolejki zatwierdzeń (scripts/us/kolejka.mjs).
import { pdfNaTekst, jestPyMuPDF } from "./wpia-pdf.mjs";
import { semestrZKalendarza } from "./wh-xlsx.mjs";
import { prowadzacyZ, dodaj, rzymska } from "./wspolne.mjs";
import { kodStrony } from "../kierunki.mjs";
import { przezKolejke } from "./kolejka.mjs";

export const BUDYNKI = { K: "ul. Krakowska 71-79", O: "ul. Ogińskiego 16-17" };
const DNI = [[/poniedzia|monday/i, 0], [/wtor|tuesday/i, 1], [/środ|sroda|wednesday/i, 2], [/czwart|thursday/i, 3], [/piąt|piatek|friday/i, 4], [/sobot|saturday/i, 5]];
const dzienZ = (t) => { const s = String(t).replace(/\s+/g, ""); for (const [r, d] of DNI) if (r.test(s)) return d; return null; };
const hhmm = (h, m) => `${String(+h).padStart(2, "0")}:${m}`;
const RZ = "XII|XI|IX|X|VIII|VII|VI|IV|V|III|II|I";
const T = String.raw`(\d{1,2})[.:](\d{2})`;
const ZAKRES = new RegExp(String.raw`${T}\s*[-–]\s*${T}`);
const dobraGodz = (h, m) => +h >= 7 && +h <= 21 && +m < 60;
function godzinyZ(t) {
  const m = ZAKRES.exec(t);
  if (!m || !dobraGodz(m[1], m[2]) || !dobraGodz(m[3], m[4])) return null;
  const a = hhmm(m[1], m[2]), b = hhmm(m[3], m[4]);
  return a < b ? [a, b] : null;
}
// komórka z samymi godzinami: „8.15 – 9.45”, „8.15 - 9.45” w trzech liniach, „15.15 – 16.45 17.00 – 18.30”
function etykietyGodzin(t) {
  const s = t.replace(/\s+/g, " ").trim();
  if (!new RegExp(String.raw`^(?:${T}\s*[-–]\s*${T}\s*)+$`).test(s)) return null;
  const all = [...s.matchAll(new RegExp(ZAKRES, "g"))].map((m) => godzinyZ(m[0])).filter(Boolean);
  return all.length ? [all[0][0], all[all.length - 1][1]] : null;
}

// ---------- komórki z czarnych linii ----------
function liniePoziomeIPionowe(strona) {
  const V = [], H = [];
  for (const r of strona.prostokaty) {
    if (r[4] !== "#000000") continue;
    const w = r[2] - r[0], h = r[3] - r[1];
    if (w < 2.5 && h > 3) V.push({ x: (r[0] + r[2]) / 2, y0: r[1], y1: r[3] });
    else if (h < 2.5 && w > 3) H.push({ y: (r[1] + r[3]) / 2, x0: r[0], x1: r[2] });
  }
  for (const l of strona.linie || []) {
    if (Math.abs(l[0] - l[2]) < 1) V.push({ x: l[0], y0: Math.min(l[1], l[3]), y1: Math.max(l[1], l[3]) });
    else if (Math.abs(l[1] - l[3]) < 1) H.push({ y: l[1], x0: Math.min(l[0], l[2]), x1: Math.max(l[0], l[2]) });
  }
  return { V, H };
}
function linieZSlow(slowa) {
  const linie = [];
  for (const x of [...slowa].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    const yc = (x[1] + x[3]) / 2; const l = linie.find((q) => Math.abs(q.y - yc) < 2.2);
    if (l) l.w.push(x); else linie.push({ y: yc, w: [x] });
  }
  return linie.sort((a, b) => a.y - b.y).map((l) => ({ y: l.y, t: l.w.sort((a, b) => a[0] - b[0]).map((x) => x[4]).join(" ").replace(/\s+/g, " ").trim() })).filter((l) => l.t);
}
// słowo → komórka ograniczona najbliższymi liniami z lewej, prawej, z góry i z dołu
export function komorki(strona) {
  const { V, H } = liniePoziomeIPionowe(strona);
  const mapa = new Map();
  for (const w of strona.slowa) {
    if (!String(w[4]).trim()) continue;
    const x = (w[0] + w[2]) / 2, y = (w[1] + w[3]) / 2;
    const L = Math.max(0, ...V.filter((v) => v.x < x && v.y0 <= y + 1 && v.y1 >= y - 1).map((v) => v.x));
    const R = Math.min(strona.w, ...V.filter((v) => v.x > x && v.y0 <= y + 1 && v.y1 >= y - 1).map((v) => v.x));
    const Tg = Math.max(0, ...H.filter((h) => h.y < y && h.x0 <= x + 1 && h.x1 >= x - 1).map((h) => h.y));
    const B = Math.min(strona.h, ...H.filter((h) => h.y > y && h.x0 <= x + 1 && h.x1 >= x - 1).map((h) => h.y));
    const k = [L, Tg, R, B].map((v) => Math.round(v * 2) / 2).join(",");
    if (!mapa.has(k)) mapa.set(k, { r: [L, Tg, R, B], slowa: [] });
    mapa.get(k).slowa.push(w);
  }
  const lista = [...mapa.values()];
  const nachodza = (a, b) => Math.min(a.r[2], b.r[2]) - Math.max(a.r[0], b.r[0]) > 2 && Math.min(a.r[3], b.r[3]) - Math.max(a.r[1], b.r[1]) > 2;
  for (let zm = true; zm;) {
    zm = false;
    for (let i = 0; i < lista.length && !zm; i++) for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i], b = lista[j];
      if (a.r[2] - a.r[0] > strona.w * 0.8 || b.r[2] - b.r[0] > strona.w * 0.8 || !nachodza(a, b)) continue;
      a.r = [Math.min(a.r[0], b.r[0]), Math.min(a.r[1], b.r[1]), Math.max(a.r[2], b.r[2]), Math.max(a.r[3], b.r[3])];
      a.slowa.push(...b.slowa); lista.splice(j, 1); zm = true; break;
    }
  }
  return lista.map((k) => { const linie = linieZSlow(k.slowa); return { r: k.r, linie, tekst: linie.map((l) => l.t).join(" ") }; });
}
const srX = (k) => (k.r[0] + k.r[2]) / 2, srY = (k) => (k.r[1] + k.r[3]) / 2;
const zakrycie = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

// ---------- terminy po rzymsku ----------
const isoZ = (r, m, d) => `${r}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const dzienTyg = (iso) => (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7;   // 0 = poniedziałek
const plusDni = (iso, n) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export function terminyWNS(tekst, d, sem = semestrZKalendarza(), startRoku = 2026) {
  const naIso = (dd, rz) => { const m = rzymska(rz); return m && +dd >= 1 && +dd <= 31 ? isoZ(m >= 9 ? startRoku : startRoku + 1, m, +dd) : null; };
  const lista = (x) => [...String(x).replace(/(\d)(?=(?:XII|XI|IX|X|VIII|VII|VI|IV|V|III|II|I)(?![A-Za-z]))/g, "$1 ")
    .matchAll(new RegExp(String.raw`((?:\d{1,2}\s*[,i]\s*)*\d{1,2})\s+(${RZ})(?![A-Za-z])`, "g"))]
    .flatMap((m) => m[1].split(/\s*[,i]\s*/).filter(Boolean).map((dd) => naIso(dd, m[2]))).filter(Boolean);
  const tydzien = (a, b) => { const out = []; let x = a; while (dzienTyg(x) !== d) x = plusDni(x, 1); for (; x <= b; x = plusDni(x, 7)) out.push(x); return out; };
  let t = " " + String(tekst) + " ";
  const wyklucz = [];
  t = t.replace(/\(\s*(?:without|bez|oprócz|z wyjątkiem)\s+([^)]*)\)/gi, (_, x) => { wyklucz.push(...lista(x)); return " "; });
  t = t.replace(/\([^)]*\)/g, " ").replace(/[-–]?\s*(?:ostatnie|pierwsze|ost\.?)\s+zaj[^;]*/gi, " ");
  t = t.replace(/\d{1,2}[.:]\d{2}(?:\s*[-–.]\s*\d{1,2}[.:]\d{2})?/g, " ").replace(/\*/g, " ");
  t = t.replace(/(\d)(?=(?:XII|XI|IX|X|VIII|VII|VI|IV|V|III|II|I)(?![A-Za-z]))/g, "$1 ");
  let daty = null;
  const D = String.raw`(\d{1,2})\s+(${RZ})(?![A-Za-z])`;
  t = t.replace(new RegExp(String.raw`(?:\b(?:od|from)\s*)?${D}\s*(?:\bdo\b|\bto\b|[-–]+)\s*${D}`, "gi"), (_, d1, m1, d2, m2) => {
    const a = naIso(d1, m1), b = naIso(d2, m2);
    if (a && b && a <= b) (daty ||= []).push(...tydzien(a, b));
    return " ";
  });
  t = t.replace(new RegExp(String.raw`\b(?:od|from)\s*${D}`, "gi"), (_, d1, m1) => { const a = naIso(d1, m1); if (a) (daty ||= []).push(...tydzien(a, sem.do)); return " "; });
  t = t.replace(new RegExp(String.raw`(?:^|\s)(?:do|to)\s+${D}`, "gi"), (_, d1, m1) => { const b = naIso(d1, m1); if (b) (daty ||= []).push(...tydzien(sem.od, b)); return " "; });
  const poj = lista(t);
  if (poj.length) (daty ||= []).push(...poj);
  if (!daty) return { daty: null, inne: [] };
  daty = [...new Set(daty)].filter((x) => !wyklucz.includes(x)).sort();
  return { daty: daty.filter((x) => dzienTyg(x) === d), inne: daty.filter((x) => dzienTyg(x) !== d) };
}

// ---------- sala z budynkiem ----------
export function salaWNS(t0) {
  const t1 = String(t0).replace(/\s+/g, " ").trim(), m0 = SALA_ZN.exec(t1);
  let s = (m0 ? t1.slice(m0.index) : t1).replace(/^\s*\(?\s*(?:[sS]\.|[Ss]ala|room)\s*/, "").replace(/,?\s*bud(?:ynek|\.)?\s*WNŚiP/i, "").replace(/[,;.]+$/, "").trim();
  const kk = [...s.matchAll(/(\d{1,3}[A-Za-z]?)\s*\/\s*([KO])(?![\p{L}])/gu)];
  if (kk.length) return `s. ${[...new Set(kk.map((m) => m[1]))].join(", ")} ${BUDYNKI[kk[0][2]]}`;
  const m = /^(\d{1,3}[A-Za-z]?)\s*\/\s*(.+)$/.exec(s);
  if (m) return `s. ${m[1]} ${/^(?:ul\.|al\.|ACKJ|[A-Z]{2,})/.test(m[2]) ? m[2] : "ul. " + m[2]}`.replace(/\s+/g, " ").trim();
  s = s.replace(/^(\d{1,3})\s+([A-Z])$/, "$1$2");
  return /^aula/i.test(String(t0).trim()) ? String(t0).trim() : `s. ${s}`;
}

// ---------- linie komórki: rodzaj, prowadzący, sala, terminy ----------
const RODZAJ_SKROT = /\(\s*(w|ć|c|ćw|cw|lb|lab|l|lk|lek|s|k|wykład|wyk|konw|sem)\s*:\s*\d/i;
const RODZAJ_SLOWO = /(?:^|[\s,–-])(wykład|wyk\.|ćwiczenia|ćw\.?|konwersatorium|laborator[a-ząćęłńóśźż]*|lektorat|warsztaty|lecture|exercises|seminar|classes|workshop|tutorial|conversation)(?=[\s(,.:]|\d|$)/i;
const rodzajZ = (x) => { const t = String(x).toLowerCase();
  if (/^(?:w|wykład|wyk|lecture)/.test(t)) return "W";
  if (/^(?:lb|lab|laborat)/.test(t)) return "LAB";
  if (/^(?:k|konw|conversation)/.test(t)) return "K";
  if (/^(?:s|semin)/.test(t)) return "S";
  if (/^(?:ć|c|l|lektorat|lek|warszt|exercises|classes|workshop|tutorial)/.test(t)) return "CW";
  return "X"; };
const OSOBA_POCZ = /^(?:prof|dr|mgr|doc)\b\.?/i;
const OSOBA_SAMA = /^[A-ZŁŚŻŹĆ]\.\s?[A-ZŁŚŻŹĆ][\p{L}-]+(?:\s+[A-ZŁŚŻŹĆ][\p{L}-]+)?$/u;
const OSOBA_W = /(?:prof\.?|dr|mgr)\s*(?:hab\.?\s*)?(?:inż\.?\s*)?[A-ZŁŚŻŹĆ]\.?\s*[A-ZŁŚŻŹĆ][\p{L}-]+(?:\s+[A-ZŁŚŻŹĆ][\p{L}-]+)?/u;
const SALA_ZN = /(?:^|[\s(:])(?:[sS]\.|[Ss]ala\b|SALA\b|room\b)\s*(?:\d|[A-Z]{2,}[a-zA-Z]*\s*\d)/;
const jestSala = (t) => SALA_ZN.test(t) || /^(?:s\.\s*)?\d{1,3}[A-Za-z]?\s*\/\s*[KO](?![\p{L}])/u.test(t) || /^aula\b/i.test(t);
const DATA_POCZ = new RegExp(String.raw`^\d{1,2}\s*(?:[,i–-]\s*\d{1,2}\s*)*(?:${RZ})(?![A-Za-z])`);
const jestTermin = (t) => /^(?:termin|od\b|do\b|from\b|tylko|w terminach|lektoraty|only|on\b)/i.test(t) || DATA_POCZ.test(t) || new RegExp(String.raw`^(?:${RZ})\s*[;,]`).test(t);
const jestGodzina = (t) => /^(?:godz\.?\s*)?\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}\s*$/i.test(t);
const jestUwaga = (t) => /^(?:uwaga|wykład dla całego roku|seminaria odbywają|zaj(?:ęcia|\.)?\s+w\s+(?:godz|g\.)|\(|\+|ost\.?\s|pierwsze|ostatnie)/i.test(t);
const RODZAJ_MYSLNIK = /\s*[–-]\s*(wykład|ćw\.?|ćwiczenia|konw\.?|konwersatorium|laboratorium|lab\.|k\.|w\.)(?=\s|$)/i;
const rodzajWLinii = (t) => RODZAJ_SKROT.test(t) || RODZAJ_MYSLNIK.test(t) || /(?:^|[\s,])(?:wykład|ćwiczenia|konwersatorium|laboratorium|lecture|exercises|seminar|classes)\s*\(?\d/i.test(t);
function kategoria(t) {
  if (jestGodzina(t)) return "godz";
  if (/^(?:ul\.|al\.)\s*\p{Lu}/u.test(t)) return "sala";
  if (/^(?:przedmiot do wyboru|seminarium przedmiotowe|przedmiot fakultatywny)\b/i.test(t)) return "rodzaj";
  if (jestSala(t)) return "sala";
  if (OSOBA_POCZ.test(t) || OSOBA_SAMA.test(t)) return "osoba";
  if (jestTermin(t)) return "termin";
  if (jestUwaga(t)) return "uwaga";
  if (/^(?:wykład|ćwiczenia|konwersatorium|laboratorium|lektorat|warsztaty|lecture|exercises|seminar|classes|workshop|tutorial)\b/i.test(t) || /^seminarium\s*\(?\d/i.test(t)) return "rodzaj";
  return "tytul";
}
// kilka zajęć w jednej komórce: nowe zajęcia zaczyna linia tytułu (albo godzin), gdy poprzednie mają już prowadzącego lub salę,
// a dalej (przed salą) stoi prowadzący albo rodzaj
const URWANA = /(?:\b(?:ostatnie|pierwsze|ost\.?|zaj\.?|zajęcia|w|godz\.?|g\.|się|od|do|from|to)|[-–+,(])\s*$/i;
const NAPIS_ROKU = /^(?:(?:WYKŁAD|WYKŁADY|ZAJĘCIA|ĆWICZENIA|DLA|CAŁEGO|ROKU)\s*)+$/;
export function scalLinie(linie) {
  const out = [];
  for (const l of linie) {
    if (NAPIS_ROKU.test(l.t)) continue;
    const p = out[out.length - 1];
    if (p && URWANA.test(p.t) && !jestGodzina(l.t) && !(OSOBA_POCZ.test(l.t) && !/[(]\s*$/.test(p.t) && !/\b(?:w|godz\.?|g\.)$/i.test(p.t))) out[out.length - 1] = { ...p, t: `${p.t} ${l.t}`.replace(/\s+/g, " ") };
    else out.push({ ...l });
  }
  return out;
}
export function czesciKomorki(linie) {
  const L = scalLinie(linie).map((l) => ({ ...l, kat: kategoria(l.t) }));
  const nowe = (i) => {
    for (let j = i; j < L.length; j++) {
      if (j > i && L[j].kat === "sala") return false;
      if (L[j].kat === "osoba" || L[j].kat === "rodzaj" || rodzajWLinii(L[j].t)) return true;
      if (j > i && (L[j].kat === "godz")) return false;
    }
    return false;
  };
  const czesci = [];
  let cur = [];
  L.forEach((l, i) => {
    const kand = (l.kat === "tytul" || l.kat === "godz") && !(i > 0 && L[i - 1].kat === "godz");
    if (kand && cur.some((x) => x.kat === "osoba" || x.kat === "sala") && nowe(i)) { czesci.push(cur); cur = []; }
    cur.push(l);
  });
  if (cur.length) czesci.push(cur);
  return czesci;
}
const tytul = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const normOsoba = (s) => prowadzacyZ(s).replace(/^prof\.?\s*/i, "prof. ").replace(/^dr\.?(?=\s)/i, "dr").replace(/^mgr\.?(?=\s)/i, "mgr").replace(/\bhab\b\.?/i, "hab.")
  .replace(/\binż\b\.?/i, "inż.").replace(/[\s,;–-]+$/, "");
export function zajeciaZCzesci(cz, d, { sem = semestrZKalendarza(), startRoku = 2026 } = {}) {
  let L = cz.map((l) => ({ t: l.t, kat: l.kat || kategoria(l.t) }));
  const notki = [];
  let time = null;
  L = L.filter((l) => !/^wykład dla całego roku$/i.test(l.t));
  if (L.length && L[0].kat === "godz") { time = godzinyZ(L[0].t); L = L.slice(1); }
  // nazwa = linie tytułu od początku (z linią, w której jest rodzaj – ucięta przed nim)
  const nazwa = [];
  let i = 0;
  for (; i < L.length; i++) {
    const l = L[i];
    if (l.kat !== "tytul" && !(i === 0 && l.kat === "rodzaj" && !rodzajWLinii(l.t))) break;
    nazwa.push(l.t);
    if (rodzajWLinii(l.t)) { i++; break; }
  }
  let pl = nazwa.join(" ").replace(/(\p{L})-\s+(\p{L})/gu, "$1-$2").replace(/\s+/g, " ").trim();
  const ciecie = [RODZAJ_SKROT.exec(pl), RODZAJ_MYSLNIK.exec(pl), /\s+wg\s+harmonogramu|:?\s*https?:\/\//i.exec(pl), /,?\s*(?:wykład|ćwiczenia|konwersatorium|laboratorium|lecture|exercises|seminar|classes)\s*\(?\d/i.exec(pl), OSOBA_W.exec(pl)]
    .filter((m) => m && m.index > 0).sort((a, b) => a.index - b.index)[0];
  const ogon = ciecie ? pl.slice(ciecie.index) : "";
  const wGodz = new RegExp(String.raw`\s+w\s+godz\.?\s*${T}\s*[-–]\s*${T}`, "i").exec(pl);
  if (wGodz && !time) time = godzinyZ(wGodz[0]);
  if (ciecie) pl = pl.slice(0, ciecie.index);
  pl = pl.replace(/\s+w\s+godz\.?\s*\d.*$/i, "").replace(/\s*\(\d+\)\s*.*$/, "").replace(/\s+(?:według|wg|according to)\s+(?:planu|harmonogramu|the plan)\b.*$/i, "").replace(/\s+ACKJ\b.*$/, "").replace(/[\s,;:–*-]+$/, "").trim();
  const gr = /\s+gr\.?\s*(\d{1,2})$/i.exec(pl);
  if (gr) pl = pl.slice(0, gr.index).trim();
  let en = null;
  const nawias = /^(.+?)\s*\(([a-ząćęłńóśźż][^()]+)\)$/.exec(pl);
  if (nawias && /[a-z]/.test(nawias[1]) && !/[ąćęłńóśźż]/.test(nawias[1])) { en = nawias[1].trim(); pl = tytul(nawias[2].trim()); }
  if (/^(?:WF|W-F)(?:$|\s*[–-])/i.test(pl)) pl = "Wychowanie fizyczne";
  const reszta = L.slice(i);
  const wszystko = [ogon, ...L.map((l) => l.t)].join(" ");
  // rodzaj
  let k = "X";
  const rs = RODZAJ_SKROT.exec(wszystko), rm = RODZAJ_MYSLNIK.exec(ogon), rw = RODZAJ_SLOWO.exec([ogon, ...reszta.map((l) => l.t)].join(" "));
  if (rs) k = rodzajZ(rs[1]); else if (rm) k = rodzajZ(rm[1].replace(/^k\.$/, "konw").replace(/^w\.$/, "wykład")); else if (rw) k = rodzajZ(rw[1]);
  else if (/^seminarium/i.test(pl)) k = "S"; else if (/^(?:język|j\.\s|lektorat)|\blanguage$/i.test(pl) || pl === "Wychowanie fizyczne") k = "CW"; else if (/seminar/i.test(pl)) k = "S"; else if (/^wykład/i.test(pl)) k = "W";
  // prowadzący
  const osoby = [];
  reszta.forEach((l, j) => {
    if (l.kat === "osoba") {
      let o = l.t;
      for (let q = j + 1; q < j + 3 && reszta[q] && reszta[q].kat === "tytul" && (/^[A-ZŁŚŻŹĆ][\p{Ll}-]+(?:\s+[A-ZŁŚŻŹĆ][\p{Ll}-]+)?$/u.test(reszta[q].t)
        || (/\s\p{Lu}\.$/u.test(o) && /^\p{Lu}[\p{Ll}-]+(?:,\s*prof\.?\s*US)?$/u.test(reszta[q].t))); q++) o += " " + reszta[q].t;   // nazwisko w następnych liniach
      osoby.push(...o.split(/\s*,\s*(?=(?:prof|dr|mgr)\b(?!\.?\s*US))/i).map(normOsoba));
    } else if (l.kat === "sala") { const m = SALA_ZN.exec(l.t); const przed = m ? l.t.slice(0, m.index) : ""; if (OSOBA_POCZ.test(przed)) osoby.push(normOsoba(przed)); }
    else { const m = OSOBA_W.exec(l.t); if (m && l.kat !== "termin") osoby.push(normOsoba(m[0])); }
  });
  { const m = OSOBA_W.exec(ogon); if (m) osoby.unshift(normOsoba(m[0])); }
  // „… lecture (15) Dr N.” + „Maksymowicz Mróz” w następnej linii
  L.forEach((l, j) => {
    const m = /((?:prof\.?|dr|mgr)\s*(?:hab\.?\s*)?(?:inż\.?\s*)?\p{Lu}\.)$/iu.exec(l.t), nast = L[j + 1];
    if (m && l.kat !== "osoba" && nast && /^\p{Lu}[\p{Ll}-]+(?:\s+\p{Lu}[\p{Ll}-]+)?$/u.test(nast.t)) osoby.push(normOsoba(`${m[1]} ${nast.t}`));
  });
  // sala: pierwsza linia z salą bez daty; linia z salą i datą („Od 7 XII: s. 43/O”) = zmiana sali → notka
  let r = "";
  for (const l of reszta) {
    if (l.kat !== "sala" && !(l.kat === "uwaga" && jestSala(l.t))) continue;
    const zData = DATA_POCZ.test(l.t.replace(/^(?:od|from)\s*/i, "")) || /^\+/.test(l.t) || /^(?:od|from)\s+\d/i.test(l.t);
    if (zData) notki.push(l.t.replace(/[:]\s*(?:s\.|sala)\s*/i, ": ").replace(/\/\s*([KO])\b/, (_, b) => " " + BUDYNKI[b]));
    else if (!r) r = salaWNS(l.t);
    else if (/^(?:ul\.|al\.)/.test(l.t) && !r.includes(l.t)) r += " " + l.t.replace(/[,;]+$/, "");
  }
  if (!r && /e-learning|online|teams|zdaln/i.test(wszystko)) r = "online";
  // godzina zamiast bloków: „Zajęcia w godz. 9:05 – 11:30” (nie „ostatnie/pierwsze zajęcia”)
  for (const l of reszta) {
    const m = /^zaj(?:ęcia|\.)?\s+w\s+(?:godz\.?|g\.)\s*(.*)$/i.exec(l.t);
    if (m && !time && godzinyZ(m[1]) && !/^\(/.test(l.t)) time = godzinyZ(m[1]);
  }
  // terminy
  // linie terminów (+ dalszy ciąg niezamkniętego nawiasu z poprzedniej linii)
  const linieTerm = [];
  let otwarty = 0;
  for (const l of reszta) {
    const zData = new RegExp(String.raw`\d\s*(?:${RZ})(?![A-Za-z])`).test(l.t) || new RegExp(String.raw`^(?:${RZ})\s*[;,]`).test(l.t);
    const tak = ((l.kat === "termin" || l.kat === "uwaga" || l.kat === "rodzaj" || l.kat === "tytul") && (zData || l.kat === "termin" || /^\(/.test(l.t)) && !/^\+/.test(l.t)) || (otwarty > 0 && l.kat !== "sala");
    if (!tak) { otwarty = 0; continue; }
    linieTerm.push(l);
    otwarty += (l.t.match(/\(/g) || []).length - (l.t.match(/\)/g) || []).length;
  }
  const tekstTerm = linieTerm.map((l) => l.t).join(" ").replace(/^termin:?\s*/i, "").replace(/\+\s*(?=\d)/g, ", ");
  const { daty, inne } = terminyWNS(tekstTerm, d, sem, startRoku);
  for (const m of tekstTerm.matchAll(/(?:ostatnie|pierwsze|ost\.?)\s+zaj(?:[^;()]|\([^)]*\))*/gi)) notki.push(m[0].trim());
  for (const m of tekstTerm.matchAll(/\(([^)]*\d[^)]*)\)/g)) if (!/^(?:without|bez|oprócz)/i.test(m[1]) && /godz|\bg\.|\bat\b|\d[.:]\d\d/i.test(m[1]) && !notki.some((x) => x.includes(m[1]))) notki.push(m[1].trim());
  for (const l of reszta) if (l.kat === "uwaga" && !/^\(|^(?:ostatnie|pierwsze|ost\.?)\s/i.test(l.t) && !jestSala(l.t) && !/^zaj(?:ęcia|\.)?\s+w\s+(?:godz|g\.)/i.test(l.t)) notki.push(l.t);
  if (/\bwg\s+harmonogramu|https?:\/\//i.test(wszystko)) notki.push("według harmonogramu na stronie wydziału");
  if (inne.length) notki.push("termin w inny dzień: " + inne.map((x) => `${+x.slice(8)}.${x.slice(5, 7)}`).join(", "));
  const n = [...new Set(notki.map((x) => x.replace(/\s+/g, " ").replace(/^[-–\s]+/, "").trim()).filter(Boolean))].join("; ");
  return { pl, ...(en ? { en } : {}), k, time, p: [...new Set(osoby)].join(", "), r, ...(gr ? { pgTekst: "gr:" + gr[1] } : {}), daty, ...(n ? { n } : {}) };
}
const pomin = (pl) => !pl || !/\p{L}{2}/u.test(pl) || /^(?:konsultacje|consultations?|uwaga|wykład dla całego roku|zajęcia dydaktyczne)/i.test(pl) || jestGodzina(pl) || /^\d+$/.test(pl);

// ---------- etykiety grup (układ B) ----------
export function etykieta(t0) {
  const s = String(t0).replace(/\s+/g, " ").trim();
  let m;
  if ((m = /L\.?\s*(\d+)\s*$/.exec(s)) || (m = /^(\d+)\s*(?:lab|lb)\b/i.exec(s))) return { typ: "lab", nr: m[1] };
  if ((m = /^(\d+)\s*(?:ćw|cw)\b/i.exec(s))) return { typ: "ćw", nr: m[1] };
  if ((m = /^(\d+)\s+([\p{L}]{2,})$/u.exec(s))) return { typ: "spec", nr: m[2] };
  if ((m = /[-.](\d{1,3})\s*$/.exec(s))) return { typ: "gr", nr: m[1] };
  if ((m = /^(\d+)$/.exec(s))) return { typ: "gr", nr: m[1] };
  return { typ: "gr", nr: s };
}
// podgrupy, które zajmuje komórka (y0–y1): grupy (bez labów) w całości → per grupa; same laby → per lab; wszystko / nic → cały rok
function podgrupy(r, etykiety) {
  if (etykiety.length < 2) return [null];
  const zajete = etykiety.filter((e) => zakrycie(r[1], r[3], e.y0, e.y1) >= 0.7 * (e.y1 - e.y0));
  if (!zajete.length || zajete.length === etykiety.length) return [null];
  const grupy = etykiety.filter((e) => e.typ !== "lab"), zg = zajete.filter((e) => e.typ !== "lab");
  if (zg.length && zg.length === grupy.length) return [null];
  if (zg.length) return zg.map((e) => `${e.typ}:${e.nr}`);
  return zajete.map((e) => `${e.typ}:${e.nr}`);
}

// ---------- plik → wpisy {rok, d, pl, k, time, p, r, pg?, daty, n?} ----------
export function plikNaWpisy(tekst, { sem = semestrZKalendarza(), startRoku = 2026, lata = [] } = {}) {
  const wpisy = [], ostrzezenia = [];
  let dzien = null, ukladA = null, rokTabeli = lata.length === 1 ? lata[0] : null;
  const dodajCzesci = (k, d, rok, pgi, czasZ, strona) => {
    const cz = czesciKomorki(k.linie);
    cz.forEach((c, j) => {
      const z = zajeciaZCzesci(c, d, { sem, startRoku });
      if (pomin(z.pl)) return;
      if (!z.time) z.time = czasZ(c, j, cz.length);
      if (!z.time) { ostrzezenia.push(`s. ${strona.n}: brak godzin – ${z.pl}`); return; }
      const { pgTekst, ...reszta } = z;
      for (const pg of pgi) wpisy.push({ rok, d, ...reszta, ...(pg || pgTekst ? { pg: pg || pgTekst } : {}), strona: strona.n, prostokat: k.r.slice(0, 4), tekst: c.map((l) => l.t).join(" ") });
    });
  };
  for (const strona of tekst.strony) {
    const kom = komorki(strona);
    // --- układ A: wiersz z ≥ 3 dniami
    const dniK = kom.filter((k) => k.tekst.length < 40 && dzienZ(k.tekst) != null && /^[\p{L}\s/]+$/u.test(k.tekst));
    const rzad = dniK.filter((k) => dniK.filter((q) => Math.abs(q.r[1] - k.r[1]) < 4).length >= 3);
    if (rzad.length >= 3 || (ukladA && !kom.some((k) => etykietyGodzin(k.tekst) && k.r[0] > 150))) {
      if (rzad.length >= 3) {
        const dni = rzad.map((k) => ({ d: dzienZ(k.tekst), x0: k.r[0], x1: k.r[2] })).sort((a, b) => a.x0 - b.x0);
        const yH = Math.max(...rzad.map((k) => k.r[3]));
        const sub = kom.filter((k) => /^(?:grupa|group)(\d+)$/i.test(k.tekst.replace(/\s+/g, "")) && k.r[1] >= yH - 2)
          .map((k) => ({ nr: /(\d+)$/.exec(k.tekst.replace(/\s+/g, ""))[1], x0: k.r[0], x1: k.r[2], y1: k.r[3], d: dni.find((q) => srX(k) > q.x0 && srX(k) < q.x1)?.d })).filter((s) => s.d != null);
        ukladA = { dni, sub, yS: Math.max(yH, ...sub.map((s) => s.y1)), ostatni: ukladA?.ostatni };
      }
      const { dni, sub } = ukladA, yS = rzad.length >= 3 ? ukladA.yS : 0;
      const x0 = Math.min(...dni.map((q) => q.x0));
      const bloki = kom.filter((k) => k.r[2] <= x0 + 2 && srY(k) > yS && etykietyGodzin(k.tekst)).map((k) => { const [od, d0] = etykietyGodzin(k.tekst); return { y0: k.r[1], y1: k.r[3], od, do: d0 }; })
        .sort((a, b) => a.y0 - b.y0);
      if (!bloki.length) { if (kom.some((k) => k.linie.length > 2)) ostrzezenia.push(`s. ${strona.n}: brak bloków godzin`); continue; }
      const poprzedni = ukladA.ostatni;
      ukladA.ostatni = bloki[bloki.length - 1];
      for (const k of kom) {
        const dz = dni.find((q) => srX(k) > q.x0 && srX(k) < q.x1);
        if (!dz || srY(k) <= yS + 1 || k.r[1] < yS - 1 || srY(k) > bloki[bloki.length - 1].y1 + 2) continue;
        const subD = sub.filter((s) => s.d === dz.d);
        const zaj = subD.filter((s) => zakrycie(k.r[0], k.r[2], s.x0, s.x1) >= 0.6 * (s.x1 - s.x0));
        const pgi = !zaj.length || zaj.length === subD.length ? [null] : zaj.map((s) => `gr:${s.nr}`);
        // komórka nad pierwszym blokiem strony = dalszy ciąg ostatniego bloku poprzedniej strony
        const czas = () => { const b = bloki.filter((b) => { const z = zakrycie(k.r[1], k.r[3], b.y0, b.y1); return z >= 0.5 * (b.y1 - b.y0) || z >= 0.5 * (k.r[3] - k.r[1]); });
          return b.length ? [b[0].od, b[b.length - 1].do] : poprzedni && k.r[3] <= bloki[0].y0 + 2 ? [poprzedni.od, poprzedni.do] : null; };
        dodajCzesci(k, dz.d, rokTabeli, pgi, czas, strona);
      }
      continue;
    }
    // --- układ B: nagłówki tabel = wiersze komórek z godzinami
    const naglowki = kom.filter((k) => etykietyGodzin(k.tekst) && k.r[0] > 60);
    const wiersze = [];
    for (const k of naglowki.sort((a, b) => a.r[1] - b.r[1])) { const w = wiersze.find((q) => Math.abs(q.y0 - k.r[1]) < 4); if (w) w.k.push(k); else wiersze.push({ y0: k.r[1], k: [k] }); }
    const tabele = wiersze.filter((w) => w.k.length >= 2).map((w) => ({ y0: Math.min(...w.k.map((k) => k.r[1])), y1: Math.max(...w.k.map((k) => k.r[3])),
      kol: w.k.map((k) => { const [od, d0] = etykietyGodzin(k.tekst); return { x0: k.r[0], x1: k.r[2], od, do: d0 }; }).sort((a, b) => a.x0 - b.x0) }));
    // nazwy dni = linie z samą nazwą dnia
    const linieStr = linieZSlow(strona.slowa);
    const naglDni = linieStr.filter((l) => /^[\p{L}]+\s*:?$/u.test(l.t) && dzienZ(l.t) != null && l.t.length < 16).map((l) => ({ y: l.y, d: dzienZ(l.t) }));
    if (!tabele.length) { if (naglDni.length) dzien = naglDni[naglDni.length - 1].d; continue; }
    tabele.forEach((tb, ti) => {
      const nd = naglDni.filter((q) => q.y < tb.y0).pop();
      if (nd && (ti === 0 || nd.y > tabele[ti - 1].y0)) dzien = nd.d;
      if (dzien == null) { ostrzezenia.push(`s. ${strona.n}: tabela bez nazwy dnia`); return; }
      const nast = [tabele[ti + 1]?.y0, naglDni.find((q) => q.y > tb.y1)?.y].filter((x) => x != null);
      const dol = Math.min(strona.h, ...nast);
      const xT = tb.kol[0].x0;
      const wNaglowku = kom.filter((k) => zakrycie(k.r[1], k.r[3], tb.y0, tb.y1) > 2 && k.r[2] <= xT + 2);
      const rokK = wNaglowku.find((k) => /^rok/i.test(k.tekst));
      const xRok1 = rokK ? rokK.r[2] : null;
      const cialo = kom.filter((k) => srY(k) > tb.y1 && srY(k) < dol && k.r[1] >= tb.y1 - 2);
      const lataK = cialo.filter((k) => xRok1 != null && srX(k) < xRok1 && /^(?:I{1,3}|IV|V|[1-5])$/.test(k.tekst.replace(/\s+/g, "")))
        .map((k) => ({ y0: k.r[1], y1: k.r[3], rok: rzymska(k.tekst.replace(/\s+/g, "")) || +k.tekst.trim() }));
      const etyk = cialo.filter((k) => srX(k) < xT && (xRok1 == null || srX(k) > xRok1) && k.tekst && !/^(?:rok|specj|grupa|lab)\b/i.test(k.tekst))
        .map((k) => ({ ...etykieta(k.tekst), y0: k.r[1], y1: k.r[3] }));
      if (lataK.length) rokTabeli = lataK[0].rok;
      for (const k of cialo) {
        if (srX(k) < xT - 1 || !k.tekst || k.r[3] > dol + 2 || (dzienZ(k.tekst) != null && k.tekst.length < 16)) continue;
        const rok = lataK.find((q) => srY(k) >= q.y0 - 1 && srY(k) <= q.y1 + 1)?.rok ?? rokTabeli;
        const etR = lataK.length > 1 ? etyk.filter((e) => { const q = lataK.find((x) => (e.y0 + e.y1) / 2 >= x.y0 && (e.y0 + e.y1) / 2 <= x.y1); return q?.rok === rok; }) : etyk;
        const pgi = podgrupy(k.r, etR);
        const czas = () => { const c = tb.kol.filter((c) => { const z = zakrycie(k.r[0], k.r[2], c.x0, c.x1); return z >= 0.5 * (c.x1 - c.x0) || z >= 0.5 * (k.r[2] - k.r[0]); }); return c.length ? [c[0].od, c[c.length - 1].do] : null; };
        dodajCzesci(k, dzien, rok, pgi, czas, strona);
      }
    });
  }
  for (const w of wpisy.filter((x) => /^gr\.?\s*\d+$/i.test(x.pl))) {
    const nr = /\d+/.exec(w.pl)[0];
    const s = wpisy.find((x) => x !== w && x.rok === w.rok && x.d === w.d && x.time.join() === w.time.join() && /^gr:/.test(x.pg || "") && !/^gr\.?\s*\d/i.test(x.pl));
    w.pl = s ? s.pl : (w.k === "CW" && /lektorat/i.test(w.tekst) ? "Lektorat" : w.pl);
    if (!w.pg) w.pg = "gr:" + nr;
  }
  // dubel (ta sama komórka przecięta): ten sam rok, dzień, godzina, przedmiot i podgrupa – zostaje pełniejszy
  const pelnosc = (w) => (w.p ? 2 : 0) + (w.r ? 2 : 0) + (w.daty ? 1 : 0) + (w.k !== "X" ? 1 : 0);
  const naj = new Map();
  for (const w of wpisy) { const k = [w.rok, w.d, w.time.join("-"), w.pl, w.pg || ""].join("|"); if (!naj.has(k) || pelnosc(w) > pelnosc(naj.get(k))) naj.set(k, w); }
  return { wpisy: [...naj.values()], ostrzezenia };
}

export function plikNaPlany(buf, { kod, sem = semestrZKalendarza(), startRoku = 2026, lata = [], tekst = null } = {}) {
  const t = tekst || pdfNaTekst(buf);
  const { wpisy, ostrzezenia } = plikNaWpisy(t, { sem, startRoku, lata });
  const lataP = {};
  for (const { rok, daty, strona, prostokat, tekst: _t, ...e } of wpisy) {
    if (rok == null) { ostrzezenia.push(`bez roku: ${e.pl}`); continue; }
    const p = (lataP[rok] ||= { groups: {}, zajec: 0 });
    dodaj(p.groups, `${kod}${rok}`, e, { daty }); p.zajec++;
  }
  return { lata: lataP, ostrzezenia };
}

// ---------- importer wydziału (kontrakt scripts/us/importuj.mjs) ----------
export async function importuj({ wydzial, zrodla, kierunki, pobieracz, log = () => {}, naSucho = false }) {
  if (!jestPyMuPDF()) { log("WNS: brak PyMuPDF – pomijam plany z PDF"); return []; }
  const sem = semestrZKalendarza();
  const startRoku = +sem.od.slice(0, 4) - (+sem.od.slice(5, 7) < 9 ? 1 : 0);
  const wyniki = [];
  for (const z of zrodla.filter((x) => x.typ === "plan" && x.format === "pdf" && x.tryb === "st")) {
    const kz = z.kierunki[0];
    const k = kierunki.find((x) => x.kod && x.kod === kz.kod);
    if (!k) { wyniki.push({ id: `wns-${z.plik}`, kierunek: { pl: kz.nazwa }, blad: `brak kierunku w config/kierunki-us.json (${kz.nazwa}, kod ${kz.kod || "?"})` }); continue; }
    const f = await pobieracz.plik(z.url);
    if (!f || f.brak) { wyniki.push({ id: `wns-${z.plik}`, kierunek: { pl: k.pl }, blad: "brak pliku " + z.url }); continue; }
    const { lata, ostrzezenia } = plikNaPlany(f.buf, { kod: k.kod, sem, startRoku, lata: kz.lata || [] });
    for (const q of ostrzezenia) log(`WNS ${z.plik}: ${q}`);
    for (const rok of kz.lata || []) {
      const rr = k.roczniki?.find((x) => x.stopien === kz.stopien && x.rok === rok && x.tryb === "st");
      if (!rr) { wyniki.push({ id: `wns-${k.kod}-${z.plik}-${rok}`, kierunek: { pl: k.pl }, blad: `brak rocznika ${rok} w config/kierunki-us.json` }); continue; }
      if (!lata[rok]) { wyniki.push({ id: rr.id, kierunek: { pl: k.pl }, blad: `${z.plik}: parser nie znalazł zajęć ${rok}. roku` }); continue; }
      const r = { id: rr.id, kod: kodStrony(k.kod, rr.stopien, rr.tryb, rr.nabor), kierunek: { pl: k.pl, en: k.en || k.pl }, stopien: rr.stopien, tryb: rr.tryb, rok: rr.rok,
        groups: lata[rok].groups, source: z.url, wersja: z.wersja || z.plik, sha256: f.sha256, rokAkademicki: `${startRoku}/${startRoku + 1}`, semestr: sem.nazwa || "zimowy" };
      const q = await przezKolejke(r, { wydzial: "WNS", naSucho, log });
      const kolejka = { pozycji: q.pozycji, doDecyzji: q.doDecyzji, wyslany: q.wyslany, blad: q.blad };
      if (q.status === "zatwierdzony") wyniki.push({ ...r, groups: q.groups });
      else if (q.poprzedni) wyniki.push({ ...r, groups: q.poprzedni, wersja: `${z.plik} (na stronie wcześniejsza zatwierdzona wersja)`, sha256: undefined, kolejka });
      else wyniki.push({ ...r, zatwierdzenie: true, kolejka });
    }
  }
  // Etap 7: studia niestacjonarne (PDF na zjazd, plan rocznika = suma zjazdów) – osobny parser, ta sama kolejka
  const { importujNst } = await import("./wns-nst.mjs");
  wyniki.push(...await importujNst({ wydzial, zrodla, kierunki, pobieracz, log, naSucho }));
  return wyniki;
}
