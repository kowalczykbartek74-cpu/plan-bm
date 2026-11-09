// Etap 5 planu całego US: parser planów Wydziału Prawa i Administracji (PDF, plik na rok, wpia.usz.edu.pl/rozklady-zajec/).
//
// Układ (obejrzany 8.11.2026 na I rok Prawa, I-SSP-26.pdf; Administracja, EP i PSM mają ten sam szablon):
// - Jedna strona A3 poziomo. Wiersz nagłówka z dniami (PONIEDZIAŁEK … PIĄTEK), pierwsza kolumna „Godzina” z blokami po 45 min
//   („8:15-9:00”, „9:00-9:45” …). Dni oddzielają pionowe linie, które przecinają wiersz nagłówka.
// - Zajęcia = kolorowa komórka (prostokąty wypełnione kolorem, pocięte w PDF na plasterki wierszy – sklejamy je w pionie, gdy
//   mają ten sam kolor i szerokość, a między nimi nie ma czarnej linii). Kolor oznacza przedmiot/rodzaj, nie niesie danych.
// - W dniu obok siebie stoją zajęcia różnych grup: wykład (cała szerokość), ćwiczenia „WP 8 (30 godz.)” = ćwiczenia ze Wstępu do
//   prawoznawstwa grupa 8 (skrót z „[WP]” przy wykładzie), konwersatorium „K 4 (20 godz.)”, warsztaty „LTS (10 godz.) gr. 1”
//   (skróty warsztatów w legendzie pod siatką), „Łacińska terminologia prawnicza - gr. 1 (20 godz.)”.
// - Komórka podaje własną godzinę („godz. 8.15 - 10.45”, „w godzinach 8.15 - 9.00”), salę („s. 118 al. Piastów 40b”,
//   „s. 218 Narutowicza”), prowadzącego i terminy („wykład w terminach: 5.X, 12.X …”, „co tydzień”). Wyjątki
//   („zajęcia dn. 24.XI trwają 1 godz. w godzinach 8.15 - 9.00”, „UWAGA! wykład w dn. 28.X odbywa się w godzinach 17.00-20.15”)
//   idą do notki i nie zmieniają godziny zajęć.
// - Jedna komórka bywa dwojgiem zajęć jedno pod drugim (LTS, a pod nim SRzS): dzielimy przed każdym kolejnym „(NN godz.)”;
//   część bez godziny/sali bierze je z poprzedniej.
// Grupy → pole „pg” = „<przedmiot>:<nr>” (np. „Wstęp do prawoznawstwa:8”); strona pokazuje wybór dla każdego przedmiotu.
// Wynik zawsze idzie do kolejki zatwierdzeń (scripts/us/kolejka.mjs) – na stronę dopiero po zatwierdzeniu.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OSOBA_RE, czyGodzina, semestrZKalendarza } from "./wh-xlsx.mjs";
import { rzymska, prowadzacyZ } from "./wspolne.mjs";

const TU = path.dirname(fileURLToPath(import.meta.url));
const DNI = { PONIEDZIAŁEK: 0, WTOREK: 1, ŚRODA: 2, CZWARTEK: 3, PIĄTEK: 4, SOBOTA: 5, MONDAY: 0, TUESDAY: 1, WEDNESDAY: 2, THURSDAY: 3, FRIDAY: 4 };
const czarny = (r) => r[4] === "#000000";
const hhmm = (h, m) => `${String(+h).padStart(2, "0")}:${m}`;

// PDF → słowa z pozycjami (scripts/us/pdf_tekst.py, PyMuPDF)
export function pdfNaTekst(buf) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-")), f = path.join(d, "plik.pdf");
  fs.writeFileSync(f, buf);
  try { return JSON.parse(execFileSync("python3", ["-I", path.join(TU, "pdf_tekst.py"), f], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8")); }
  finally { fs.rmSync(d, { recursive: true, force: true }); }
}

// słowa w prostokącie → tekst w kolejności czytania (linie po y, w linii po x)
export function tekstW(slowa, r, pad = 1) {
  const w = slowa.filter((x) => (x[0] + x[2]) / 2 >= r[0] - pad && (x[0] + x[2]) / 2 <= r[2] + pad && (x[1] + x[3]) / 2 >= r[1] - pad && (x[1] + x[3]) / 2 <= r[3] + pad)
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const linie = [];
  for (const x of w) { const l = linie.find((q) => Math.abs(q.y - (x[1] + x[3]) / 2) < 2.2); if (l) l.w.push(x); else linie.push({ y: (x[1] + x[3]) / 2, w: [x] }); }
  return linie.sort((a, b) => a.y - b.y).map((l) => l.w.sort((a, b) => a[0] - b[0]).map((x) => x[4]).join(" "));
}

// ---------- siatka: dni, bloki godzin, komórki ----------
export function siatka(strona) {
  const { slowa, prostokaty } = strona;
  const dzien = (t) => DNI[String(t).toUpperCase().replace(/[^A-ZĄĆĘŁŃÓŚŹŻ]/g, "")];
  // nagłówek = wiersz z największą liczbą nazw dni (nazwy dni bywają też w treści komórek: „Piątek, 12.12”)
  const wszystkie = slowa.filter((w) => dzien(w[4]) != null);
  const wiersze = new Map();
  for (const w of wszystkie) { const k = Math.round(w[1] / 4); wiersze.set(k, [...(wiersze.get(k) || []), w]); }
  const nagl = [...wiersze.values()].sort((a, b) => b.length - a.length)[0] || [];
  if (nagl.length < 3) return { blad: "brak nagłówka dni" };
  const yN = Math.min(...nagl.map((w) => w[1])), yN1 = Math.max(...nagl.map((w) => w[3]));
  const piony = [...new Set(prostokaty.filter((r) => czarny(r) && r[2] - r[0] < 2.5 && r[1] <= yN + 2 && r[3] >= yN1 - 2).map((r) => Math.round(r[0])))].sort((a, b) => a - b);
  const dni = [];
  for (let i = 0; i + 1 < piony.length; i++) {
    const h = nagl.find((w) => w[0] >= piony[i] && w[2] <= piony[i + 1] + 1);
    if (h) dni.push({ d: dzien(h[4]), x0: piony[i], x1: piony[i + 1] });
  }
  const x0 = dni.length ? Math.min(...dni.map((d) => d.x0)) : 0;
  // etykiety godzin w pierwszej kolumnie: „8:15-9:00”, „8.15-9.00”, „8.15 - 9.00” (kilka słów) → linie po y
  const lewe = slowa.filter((w) => w[2] <= x0 + 1 && w[1] >= yN1 - 1).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const linieL = [];
  for (const w of lewe) { const yc = (w[1] + w[3]) / 2; const l = linieL.find((q) => Math.abs(q.yc - yc) < 2.2); if (l) { l.w.push(w); l.y0 = Math.min(l.y0, w[1]); l.y1 = Math.max(l.y1, w[3]); } else linieL.push({ yc, y0: w[1], y1: w[3], w: [w] }); }
  const etyk = linieL.map((l) => ({ l, m: /^(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})$/.exec(l.w.sort((a, b) => a[0] - b[0]).map((x) => x[4]).join(" ").replace(/\s*[-–]\s*/, "-")) }))
    .filter((x) => x.m).map((x) => [0, x.l.y0, 0, x.l.y1, `${x.m[1]}:${x.m[2]}-${x.m[3]}:${x.m[4]}`]);
  const poziomeLewe = [...new Set(prostokaty.filter((r) => czarny(r) && r[3] - r[1] < 2.5 && r[2] <= x0 + 2 && r[2] - r[0] > 10).map((r) => Math.round(r[1])))].sort((a, b) => a - b);
  const bloki = etyk.map((w) => {
    const yc = (w[1] + w[3]) / 2, [a, b] = w[4].replace(/\./g, ":").split("-");
    const g = poziomeLewe.filter((y) => y < yc).pop() ?? w[1] - 5, d = poziomeLewe.find((y) => y > yc) ?? w[3] + 5;
    return { y0: g, y1: d, od: hhmm(...a.split(":")), do: hhmm(...b.split(":")) };
  });
  if (!bloki.length) return { blad: "brak etykiet godzin w pierwszej kolumnie" };
  const dol = bloki[bloki.length - 1].y1;
  const linieH = prostokaty.filter((r) => czarny(r) && r[3] - r[1] < 2.5 && r[2] - r[0] > 8);
  // plasterki komórek: wypełnione kolorem (nie czarne, nie białe) w obszarze siatki
  const pl = prostokaty.filter((r) => r[4] && !czarny(r) && r[4] !== "#ffffff" && r[0] >= x0 - 1 && r[1] >= yN1 - 1 && r[1] < dol - 1 && r[2] - r[0] > 8 && r[3] - r[1] > 2)
    .map((r) => [...r]).sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  const komorki = [];
  for (const r of pl) {
    const k = komorki.find((q) => Math.abs(q[0] - r[0]) < 1.5 && Math.abs(q[2] - r[2]) < 1.5 && q[4] === r[4] && Math.abs(q[3] - r[1]) < 1.5
      && !linieH.some((l) => Math.abs(l[1] - r[1]) < 1.5 && l[0] <= r[0] + 3 && l[2] >= r[2] - 3));
    if (k) k[3] = Math.max(k[3], r[3]); else komorki.push(r);
  }
  // jeden kolorowy prostokąt bywa kilkoma komórkami obok siebie (wtorkowe warsztaty): tniemy go czarnymi liniami pionowymi
  const linieV = prostokaty.filter((r) => czarny(r) && r[2] - r[0] < 2.5 && r[3] - r[1] > 8);
  const pociete = komorki.flatMap((k) => {
    const h = k[3] - k[1];
    const xs = [...new Set(linieV.filter((l) => l[0] > k[0] + 3 && l[0] < k[2] - 3 && Math.min(l[3], k[3]) - Math.max(l[1], k[1]) > h * 0.6).map((l) => Math.round(l[0])))].sort((a, b) => a - b);
    if (!xs.length) return [k];
    const granice = [k[0], ...xs, k[2]];
    return granice.slice(0, -1).map((x, i) => [x, k[1], granice[i + 1], k[3], k[4]]);
  });
  // … i tak samo liniami poziomymi przez (prawie) całą szerokość komórki (środowe warsztaty: jedna kolumna, kilka grup)
  const pocieteH = pociete.flatMap((k) => {
    const w = k[2] - k[0];
    const ys = [...new Set(linieH.filter((l) => l[1] > k[1] + 3 && l[1] < k[3] - 3 && Math.min(l[2], k[2]) - Math.max(l[0], k[0]) > w * 0.8).map((l) => Math.round(l[1])))].sort((a, b) => a - b);
    if (!ys.length) return [k];
    const g = [k[1], ...ys, k[3]];
    return g.slice(0, -1).map((y, i) => [k[0], y, k[2], g[i + 1], k[4]]);
  });
  // kawałek komórki bez nagłówka i bez prowadzącego (np. „20.I godz. 15.15 - 16.45”) doklejamy do komórki nad nim w tej samej kolumnie
  const pelne = pocieteH.filter((k) => tekstW(slowa, k).join(" ").trim()).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const wynik = [];
  for (const k of pelne) {
    const t = tekstW(slowa, k).join(" ");
    const nad = wynik.filter((q) => Math.abs(q[0] - k[0]) < 2 && Math.abs(q[2] - k[2]) < 2 && q[3] <= k[1] + 2).sort((a, b) => b[3] - a[3])[0];
    if (!/\(\s*\d+\s*godz/.test(t) && !/\b(?:dr|mgr|prof)\b/.test(t) && nad && k[1] - nad[3] < 3) { nad[3] = k[3]; continue; }
    wynik.push([...k]);
  }
  return { dni, bloki, komorki: wynik, dol };
}

// ---------- skróty: „[WP]” przy wykładzie, legenda „Legal Tech start (LTS)” ----------
export function skroty(teksty) {
  const m = {};
  for (const t of teksty) {
    for (const x of poPolsku(t).matchAll(/([A-ZŁŚŻ][^()[\]]{3,90}?)\s*\(\d+\s*godz\.?\)\s*\[([A-ZŁŚŻa-ząćęłńóśźż]{1,6})\]/g)) m[x[2]] ||= x[1].trim();
    for (const x of t.matchAll(/([A-ZŁŚŻ][A-Za-ząćęłńóśźżŁŚŻ ,-]{3,80}?)\s*\(([A-Z][A-Za-z]{1,6})\)/g)) if (!/godz/.test(x[1])) m[x[2]] ||= x[1].trim();
  }
  return m;
}

// ---------- jedna część komórki → zajęcia ----------
const RODZAJ = [[/(?<!\p{L})wykład/iu, "W"], [/(?<!\p{L})konwersatori/iu, "K"], [/(?<!\p{L})seminari/iu, "S"], [/(?<!\p{L})(?:ćwiczeni|warsztat|lektorat)/iu, "CW"], [/(?<!\p{L})laborator/iu, "LAB"]];
const DATA_LISTA = /(\d{1,2})\s*\.\s*(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I|\d{1,2})\b\.?/g;
export function terminyWPiA(t, startRoku = 2026) {
  const m = /w\s+termin(?:ach|ie)\s*:?\s*([^]*?)(?=\s*(?:[-–]\s*zajęcia|zajęcia\s+dn|UWAGA|godz\.|s\.\s*\d|$))/i.exec(t);
  if (!m) return null;
  if (/co\s+tydzień/i.test(m[1])) return null;
  const out = [];
  for (const x of m[1].matchAll(DATA_LISTA)) {
    const mies = rzymska(x[2]) || +x[2];
    if (mies >= 1 && mies <= 12 && +x[1] >= 1 && +x[1] <= 31) out.push(`${mies >= 9 ? startRoku : startRoku + 1}-${String(mies).padStart(2, "0")}-${String(+x[1]).padStart(2, "0")}`);
  }
  return out.length ? [...new Set(out)].sort() : null;
}
// IEBL (po angielsku): „(15 hours)” → „(15 godz.)”, „lecture, 17.45 - 20.15” → „wykład godz. 17.45 - 20.15”, „room 117” → „s. 117”,
// lista dat bez „w terminach” → „w terminach: …”, „classes on 19.I lasts …” → wyjątek
export const poPolsku = (t) => String(t).replace(/\((\d+)\s*hours?\)/gi, "($1 godz.)").replace(/\broom\s+(\d)/gi, "s. $1")
  .replace(/\b(lecture|discussion class(?:es)?|classes|workshops?|seminar)\s*,\s*(\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2})/gi,
    (x, k, g) => `${/lecture/i.test(k) ? "wykład" : /seminar/i.test(k) ? "seminarium" : "ćwiczenia"} godz. ${g}`)
  .replace(/[-–]\s*(?:discussion class|classes?|lecture)\s+on\s+[^]*$/i, (x) => " zajęcia dn. " + x.replace(/^[-–\s]+/, "") + " godz.")
  .replace(/((?:\d{1,2}\.(?:XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\b,?\s*){2,})/, (x, l, off, all) => /terminach|termin/i.test(all.slice(Math.max(0, off - 20), off)) ? x : " w terminach: " + x);
export function czescNaZajecia(t0, skr, { startRoku = 2026 } = {}) {
  const t = poPolsku(t0);
  const uwagi = [];
  // wyjątki do notki, bez wpływu na godzinę
  let s = t.replace(/[-–]?\s*zajęcia\s+(?:w\s+)?dn\.?[^]*?(?:godz\.?|godziny)(?:\s+w\s+godzinach\s+\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2})?/gi, (x) => { uwagi.push(x.replace(/^[-–\s]+/, "").trim()); return " "; })
    .replace(/UWAGA!?[^]*$/i, (x) => { uwagi.push(x.trim()); return " "; });
  const naglowek = /^(.*?)\(\s*(\d+)\s*godz\.?\s*\)\s*(?:\[([^\]]+)\])?/.exec(s);
  let nazwa = (naglowek ? naglowek[1] : s.split(/\s+(?:dr|mgr|prof)\b/)[0]).replace(/^godz\.\s*\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}\s*,?/i, "").replace(/\bs\.\s*[\d-]+\s*(?:al\.?\s*Piastów\s*40b|Narutowicza)?/i, "").trim();
  // grupa: „WP 8”, „K 4”, „gr. 1”, „- gr. 1”, „WP 1 / WP 10”
  let grupy = [], kod = null;
  const kg = /^([A-ZŁŚŻ][A-Za-zŁŚŻ]{0,6})\s+(\d{1,2})(?:\s*\/\s*\1\s+(\d{1,2}))?$/.exec(nazwa);
  if (kg && skr[kg[1]]) { kod = kg[1]; grupy = [kg[2], kg[3]].filter(Boolean); nazwa = skr[kod]; }
  else {
    const g = /\s*[-–]?\s*\bgr\.\s*(\d{1,2})\b/i.exec(nazwa) || /\bgr\.\s*(\d{1,2})\b/i.exec(s.slice(naglowek ? naglowek.index + naglowek[0].length : 0, (naglowek ? naglowek.index + naglowek[0].length : 0) + 12));
    if (g) { grupy = [g[1]]; nazwa = nazwa.replace(/\s*[-–]?\s*\bgr\.\s*\d{1,2}\b/i, "").trim(); }
    if (skr[nazwa]) { kod = nazwa; nazwa = skr[nazwa]; }
  }
  nazwa = nazwa.replace(/\s+[-–,]\s*$/, "").replace(/\s{2,}/g, " ").trim();
  const k = (RODZAJ.find(([re]) => re.test(s)) || [null, kod && !grupy.length ? "W" : "X"])[1];
  const g1 = /(?:godz\.|w\s+godzinach)\s*(\d{1,2})[.:](\d{2})\s*[-–]\s*(\d{1,2})[.:](\d{2})/i.exec(s);
  const time = g1 && czyGodzina(g1[1], g1[2]) && czyGodzina(g1[3], g1[4]) ? [hhmm(g1[1], g1[2]), hhmm(g1[3], g1[4])] : null;
  const sala = /\b(?:s\.\s*[\d]+(?:-\d+)?[a-z]?(?:\s*(?:al\.?\s*Piastów\s*40b|Narutowicza|ul\.?\s*Krakowska\s*[\d-]+))?|aula[^,;]*?(?=\s+(?:konwersatorium|wykład|ćwiczenia|warsztaty|w\s+termin)|[,;]|$))/i.exec(s)?.[0]?.replace(/\bal\s+Piastów/, "al. Piastów") || "";
  const osoby = [...new Set([...s.matchAll(new RegExp(OSOBA_RE.source, "g"))].map((x) => prowadzacyZ(x[0]).replace(/[\s,.-]+$/, "")))].filter((x) => !/^(?:dr|mgr|prof)\.?$/.test(x));
  const daty = terminyWPiA(s, startRoku);
  const online = /\[e-classes\]|MS\s*TEAMS|e-zajęcia|online/i.test(s);
  return { pl: nazwa, k, time, r: sala || (online ? "online (MS Teams)" : ""), p: osoby.join(", "), grupy, kod, daty, n: uwagi.join("; ") };
}

// komórka → części (kolejne „(NN godz.)” od nowej linii zaczynają nowe zajęcia)
export function czesciKomorki(linie0) {
  const linie = linie0.map((l) => l.replace(/\((\d+)\s*hours?\)/gi, "($1 godz.)"));
  const out = [];
  let biez = [];
  let byl = false;
  for (const l of linie) {
    if (/\(\s*\d+\s*godz\.?\s*\)/.test(l) && byl && !/^\(\s*\d+\s*godz/.test(l)) {
      // linie tuż nad nagłówkiem („godz. 11.00 - 13.30”, „s. 118 al Piastów 40b”) należą już do nowych zajęć
      const nad = [];
      while (biez.length && /^(?:godz\.\s*\d|s\.\s*\d)/.test(biez[biez.length - 1])) nad.unshift(biez.pop());
      out.push(biez.join(" ")); biez = nad;
    }
    if (/\(\s*\d+\s*godz\.?\s*\)/.test(l)) byl = true;
    biez.push(l);
  }
  if (biez.length) out.push(biez.join(" "));
  return out;
}

// ---------- strona → zajęcia ----------
export function stronaNaZajecia(strona, { startRoku = 2026 } = {}) {
  const sg = siatka(strona);
  if (sg.blad) return { wpisy: [], ostrzezenia: [sg.blad] };
  const ostrzezenia = [];
  const legenda = tekstW(strona.slowa, [0, sg.dol, strona.w, strona.h]).join(" ");
  const komTekst = sg.komorki.map((k) => tekstW(strona.slowa, k));
  const skr = skroty([legenda, ...komTekst.map((l) => l.join(" "))]);
  const wpisy = [];
  sg.komorki.forEach((k, i) => {
    const xc = (k[0] + k[2]) / 2;
    const dz = sg.dni.find((d) => xc >= d.x0 && xc <= d.x1);
    if (!dz) return;
    const b0 = sg.bloki.find((b) => k[1] + 2 >= b.y0 && k[1] + 2 <= b.y1) || sg.bloki[0];
    const b1 = [...sg.bloki].reverse().find((b) => k[3] - 2 >= b.y0 && k[3] - 2 <= b.y1) || sg.bloki[sg.bloki.length - 1];
    if (/^(?:Konsultacje|OFFICE HOURS)\b/i.test(komTekst[i].join(" "))) return;   // dyżur prowadzących, nie zajęcia
    const czesci = czesciKomorki(komTekst[i]).map((t) => ({ t, z: czescNaZajecia(t, skr, { startRoku }) }));
    czesci.forEach((c, j) => {
      const poprz = czesci.slice(0, j).reverse().find((x) => x.z.time || x.z.r);
      if (!c.z.time) c.z.time = poprz?.z.time || [b0.od, b1.do];
      if (!c.z.r && poprz) c.z.r = poprz.z.r;
      if (!c.z.pl) ostrzezenia.push(`komórka ${Math.round(k[0])},${Math.round(k[1])}: nie odczytałem nazwy`);
      const typ = c.z.pl;
      for (const g of c.z.grupy.length ? c.z.grupy : [null]) {
        wpisy.push({ d: dz.d, time: c.z.time, pl: c.z.pl, k: c.z.k, p: c.z.p, r: c.z.r, ...(g ? { pg: `${typ}:${g}` } : {}), ...(c.z.n ? { n: c.z.n } : {}),
          daty: c.z.daty, komorka: `${Math.round(k[0])},${Math.round(k[1])}`, prostokat: k.slice(0, 4), tekst: c.t });
      }
    });
  });
  return { wpisy, ostrzezenia, skroty: skr };
}

// ---------- importer wydziału (kontrakt scripts/us/importuj.mjs) ----------
import { kodStrony } from "../kierunki.mjs";
import { dodaj } from "./wspolne.mjs";
import { przezKolejke } from "./kolejka.mjs";

// plik PDF → groups (jedna grupa na rocznik, podgrupy w „pg”)
export function plikNaPlan(buf, nazwaGrupy, { startRoku = 2026, tekst = null } = {}) {
  const t = tekst || pdfNaTekst(buf);
  const groups = {}, ostrzezenia = [];
  let zajec = 0;
  for (const s of t.strony) {
    const r = stronaNaZajecia(s, { startRoku });
    ostrzezenia.push(...r.ostrzezenia);
    for (const { daty, komorka, prostokat, tekst: _t, ...e } of r.wpisy) { dodaj(groups, nazwaGrupy, e, { daty }); zajec++; }
  }
  return { groups, ostrzezenia, zajec };
}

export const jestPyMuPDF = () => { try { execFileSync("python3", ["-I", "-c", "import pymupdf"], { stdio: "ignore" }); return true; } catch { return false; } };
export async function importuj({ wydzial, zrodla, kierunki, pobieracz, log = () => {}, naSucho = false }) {
  // bez PyMuPDF (stary workflow bez kroku pip) wydział jest pomijany, a nie zgłaszany jako błąd codziennego przebiegu
  if (!jestPyMuPDF()) { log("WPiA: brak PyMuPDF (pip install pymupdf==1.28.2, workflow docs/aktualizacja-planu-us.yml) – pomijam plany z PDF"); return []; }
  const sem = semestrZKalendarza();
  const startRoku = +sem.od.slice(0, 4) - (+sem.od.slice(5, 7) < 9 ? 1 : 0);
  const wyniki = [];
  for (const z of zrodla.filter((x) => x.typ === "plan" && x.format === "pdf" && x.tryb === "st")) {
    const kz = z.kierunki[0];
    const k = kierunki.find((x) => x.kod && x.kod === kz.kod);
    const rr = k?.roczniki?.find((x) => x.stopien === kz.stopien && x.rok === (kz.lata || [])[0] && x.tryb === "st");
    if (!rr) { wyniki.push({ id: `wpia-${z.plik}`, kierunek: { pl: kz.nazwa }, blad: `brak rocznika w config/kierunki-us.json (${kz.nazwa}, kod ${kz.kod || "?"})` }); continue; }
    const f = await pobieracz.plik(z.url);
    if (!f || f.brak) { wyniki.push({ id: rr.id, kierunek: { pl: k.pl }, blad: "brak pliku " + z.url }); continue; }
    const { groups, ostrzezenia } = plikNaPlan(f.buf, `${k.kod}${rr.rok}`, { startRoku });
    for (const q of ostrzezenia) log(`WPiA ${z.plik}: ${q}`);
    const r = { id: rr.id, kod: kodStrony(k.kod, rr.stopien, rr.tryb, rr.nabor), kierunek: { pl: k.pl, en: k.en || k.pl }, stopien: rr.stopien, tryb: rr.tryb, rok: rr.rok,
      groups, source: z.url, wersja: z.plik, sha256: f.sha256, rokAkademicki: `${startRoku}/${startRoku + 1}`, semestr: sem.nazwa || "zimowy" };
    const q = await przezKolejke(r, { wydzial: wydzial.skrot, naSucho, log });
    if (q.status === "zatwierdzony") wyniki.push({ ...r, groups: q.groups, ...(q.odRazu ? { kolejka: { pozycji: q.pozycji, doDecyzji: q.doDecyzji, wyslany: q.wyslany, blad: q.blad, odRazu: true } } : {}) });
    else {
      const kolejka = { pozycji: q.pozycji, doDecyzji: q.doDecyzji, wyslany: q.wyslany, blad: q.blad };
      // nowa wersja czeka, a wcześniejsza jest zatwierdzona → na stronie zostaje zatwierdzona (z jej znacznikiem wersji)
      if (q.poprzedni) wyniki.push({ ...r, groups: q.poprzedni, wersja: `${z.plik} (na stronie wcześniejsza zatwierdzona wersja)`, sha256: undefined, kolejka });
      else wyniki.push({ ...r, zatwierdzenie: true, kolejka });
    }
  }
  // Etap 7: studia niestacjonarne (pasy piątek/sobota/niedziela, kolumny = zjazdy) – osobny parser, ta sama kolejka
  const { importujNst } = await import("./wpia-nst.mjs");
  wyniki.push(...await importujNst({ wydzial, zrodla, kierunki, pobieracz, log, naSucho }));
  return wyniki;
}
