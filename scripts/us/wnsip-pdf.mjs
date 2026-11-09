// Etap 5 planu całego US: parser planów Wydziału Nauk Ścisłych i Przyrodniczych (PDF, plik na kierunek i rok,
// spr.usz.edu.pl/studenci/plany-zajec-studia-stacjonarne/).
//
// Układ (obejrzane 8.11.2026: Matematyka I st. 1 rok, Biologia I st. 1 rok, Mikrobiologia I st. 3 rok, Fizyka 2, Geologia II st. 2):
// - Jedna strona A4 poziomo, ten sam szkielet co WPiA: nagłówek „KIERUNEK I stopnia 1 rok”, wiersz dni (Poniedziałek…Piątek),
//   kolumna „Godzina” z blokami 45 min („8.15-9.00”, „9.05-9.50” …) – siatkę czyta scripts/us/wpia-pdf.mjs → siatka().
// - Dzień bywa podzielony na kolumny grup (Biologia, Mikrobiologia); zajęcia = komórka (prostokąt z tłem, cięty czarnymi liniami).
//   W Matematyce sąsiednie zajęcia mają to samo tło bez linii między nimi – wtedy dzielimy komórkę po tekście.
// - Tekst zajęć: [godziny „08:15-09:45”] nazwa [rodzaj/godziny w nawiasie kwadratowym: „[w/30h]”, „[k/15h/45h]”, „[lab/36h]”,
//   „[lektorat/30h]”] [grupa „gr. 1”] [terminy na czerwono: „05.10.-07.12.”, „15.10; 29.10; 12.11”, „27.10 - 15.12; 12.01 - 26.01”,
//   „21.12 - 8:15-13:00” (data z inną godziną)] prowadzący, sala („s. 212”, „s. 202F” – litera = budynek z legendy: W ul. Wąska 13,
//   F ul. Felczaka 3c; „Aula ul. Wielkopolska 15”). Sala stoi zwykle na dole ramki zajęć.
// - Godzina: z pierwszej linii zajęć, a gdy jej brak – od bloku z nazwą do bloku z salą (ostatnią linią zajęć).
// Wynik zawsze idzie do kolejki zatwierdzeń (scripts/us/kolejka.mjs).
import { siatka, pdfNaTekst, jestPyMuPDF } from "./wpia-pdf.mjs";
import { OSOBA_RE, czyGodzina, datyZTekstu, semestrZKalendarza } from "./wh-xlsx.mjs";
import { prowadzacyZ, dodaj } from "./wspolne.mjs";
import { kodStrony } from "../kierunki.mjs";
import { przezKolejke } from "./kolejka.mjs";

const hhmm = (h, m) => `${String(+h).padStart(2, "0")}:${m}`;
// „[w/30h]”, „[k/15h/45h]”, „[lab/36h]”, „[lektorat/30h]”, „[zte/4h]”, „[lecture/30h]”, „[practical classes/20h]”
const NAWIAS = /\[\s*([A-Za-ząćęłńóśźż][A-Za-ząćęłńóśźż .]{0,24}?)\s*(?:\/[^\]]*)?\]/;
const rodzajZ = (x) => { const t = String(x).toLowerCase().trim();
  if (/^(w|wykład|wyk|lecture)/.test(t)) return "W";
  if (/^(lab|lb|l|laborat|laboratory)/.test(t)) return "LAB";
  if (/^(k|konw|konwersat|conversation)/.test(t)) return "K";
  if (/^(s|sem|seminar)/.test(t)) return "S";
  if (/^(ćw|ć|c|lektorat|lek|practical|classes|exercise|tutorial|warszt)/.test(t)) return "CW";
  return "X"; };
const GODZ_START = /^(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})\b/;

// linie tekstu w prostokącie z położeniem y (jak tekstW, ale z y)
export function linieW(slowa, r, pad = 1) {
  const w = slowa.filter((x) => (x[0] + x[2]) / 2 >= r[0] - pad && (x[0] + x[2]) / 2 <= r[2] + pad && (x[1] + x[3]) / 2 >= r[1] - pad && (x[1] + x[3]) / 2 <= r[3] + pad)
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const linie = [];
  for (const x of w) { const yc = (x[1] + x[3]) / 2; const l = linie.find((q) => Math.abs(q.y - yc) < 2.2); if (l) l.w.push(x); else linie.push({ y: yc, w: [x] }); }
  return linie.sort((a, b) => a.y - b.y).map((l) => ({ y: l.y, t: l.w.sort((a, b) => a[0] - b[0]).map((x) => x[4]).join(" ") }));
}

// komórka → zajęcia: nowe zajęcia zaczyna linia z „[w/30h]” (albo linia nad nią z nazwą); linia z samą godziną nad nazwą
// też należy do nowych zajęć
export function podzialKomorki(linie) {
  const start = [];
  linie.forEach((l, i) => {
    if (!NAWIAS.test(l.t)) return;
    let s = /^\s*\[/.test(l.t) && i > 0 && !NAWIAS.test(linie[i - 1].t) && !/^s\.\s*\d|^dr|^mgr|^prof/.test(linie[i - 1].t) ? i - 1 : i;
    if (s > 0 && GODZ_START.test(linie[s - 1].t) && linie[s - 1].t.length < 16) s--;
    if (!start.length || s > start[start.length - 1]) start.push(s);
  });
  if (!start.length) return [linie];
  start[0] = 0;
  return start.map((s, j) => linie.slice(s, start[j + 1] ?? linie.length));
}

export function zajeciaZLinii(linie, d, sem, startRoku = 2026) {
  let t = linie.map((l) => l.t).join(" ").replace(/\s+/g, " ").trim();
  const g0 = GODZ_START.exec(t);
  // WNŚiP: bloki 45 min z przerwą 5 min, więc godziny kończą się też na :05, :20, :35, :50
  const g5 = (h, m) => +h >= 7 && +h <= 21 && +m % 5 === 0 && +m < 60;
  const time = g0 && g5(g0[1], g0[2]) && g5(g0[3], g0[4]) && `${g0[1].padStart(2, "0")}${g0[2]}` < `${g0[3].padStart(2, "0")}${g0[4]}` ? [hhmm(g0[1], g0[2]), hhmm(g0[3], g0[4])] : null;
  if (time) t = t.slice(g0[0].length).trim();
  const nw = NAWIAS.exec(t);
  const k = nw ? rodzajZ(nw[1]) : /wykład|lecture/i.test(t) ? "W" : "X";
  let pl = (nw ? t.slice(0, nw.index) : t.split(/\s+(?:dr|mgr|prof)\b|\s\d{1,2}\.\d{1,2}/)[0]).replace(/\*+$/, "").replace(/[,\s]+$/, "").trim();
  const gr = /\bgr\.?\s*(\d{1,2})\b/i.exec(t);
  let reszta = nw ? t.slice(nw.index + nw[0].length) : t.slice(pl.length);
  // prowadzący: także tytuły bez kropek i medyczne („prof US dr hab Lidia Skuza”, „dr n. med. A. Nowakowska”, „dr inż Ewa Filip”)
  const OSOBA = /(?:(?:prof\.?|Prof\.?)\s*(?:US\s*,?\s*)?|dr\.?\s*(?:hab\.?\s*)?(?:inż\.?\s*)?(?:n\.\s*[a-zł]+\.\s*)?|mgr\.?\s*(?:inż\.?\s*)?)+(?:[A-ZŁŚŻŹĆŃÓ][\wąćęłńóśźżĄĆĘŁŃÓŚŹŻ'.-]*\.?\s*(?:-\s*)?){1,4}(?:,\s*prof\.?\s*US)?/g;
  const osoby = [...new Set([...reszta.matchAll(OSOBA)].map((x) => prowadzacyZ(x[0]).replace(/[\s,.-]+$/, "").replace(/\s+(?:s|room|Gr|gr)$/, "")))]
    .filter((x) => !/^(?:dr|mgr|prof)\.?$/i.test(x) && /[A-ZŁŚŻ][a-ząćęłńóśźż]/.test(x.replace(/^(?:prof|dr|mgr)\S*/i, "")));
  reszta = reszta.replace(/\broom\s+(\d)/gi, "s. $1").replace(/\b(s\.\s*\d+[a-z]?)\s+([WF])\b/g, "$1$2");
  const sala = /\b(?:s\.\s*\d+[A-Za-z]{0,2}\b(?:\s*\((?:aula|lab\.?)\))?(?:\s*,?\s*ul\.\s*[A-ZŁŚŻ][\wąćęłńóśźż]+\s*\d+[a-z]?)?|Aula\s+ul\.\s*[A-ZŁŚŻ][\wąćęłńóśźż]+\s*\d+|aula\b[^,;]*?(?=\s+(?:dr|mgr|prof)|$))/i.exec(reszta)?.[0] || (/e-zajęcia|online|teams/i.test(t) ? "online" : "");
  // terminy bez linii z godzinami wyjątków („21.12 - 8:15-13:00” → data zostaje, godzina do notki)
  const wyjatki = [...reszta.matchAll(/(\d{1,2}\.\d{1,2})\.?\s*[-–]\s*(\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2})(?:\s*\([^)]*\))?/g)].map((m) => m[0]);
  const dt = datyZTekstu(reszta.replace(/(\d{1,2}\.\d{1,2})\.?\s*[-–]\s*\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}/g, "$1"), d, sem, startRoku);
  const n = [wyjatki.length ? "inne godziny: " + wyjatki.join("; ") : "", dt.niejasne ? "terminy: " + (reszta.match(/\d{1,2}\.\d{1,2}[^a-zA-Z]{0,60}/)?.[0] || "").trim() : "",
    /\(ostatnie zajęcia[^)]*\)/i.exec(t)?.[0] || ""].filter(Boolean).join("; ");
  return { pl, k, time, p: osoby.join(", "), r: sala, ...(gr ? { pg: "gr:" + gr[1] } : {}), daty: dt.daty, ...(n ? { n } : {}) };
}

// Komórki z linii: słowo należy do komórki ograniczonej najbliższymi czarnymi liniami z lewej, prawej, z góry i z dołu
// (tło komórek bywa przypadkowe – w Matematyce zmienia się co wiersz – a linie zawsze oddzielają zajęcia).
export function komorkiZLinii(strona, sg) {
  const cz = (r) => r[4] === "#000000";
  const V = strona.prostokaty.filter((r) => cz(r) && r[2] - r[0] < 2.5 && r[3] - r[1] > 3).map((r) => ({ x: (r[0] + r[2]) / 2, y0: r[1], y1: r[3] }))
    .concat((strona.linie || []).filter((l) => Math.abs(l[0] - l[2]) < 1).map((l) => ({ x: l[0], y0: Math.min(l[1], l[3]), y1: Math.max(l[1], l[3]) })));
  const H = strona.prostokaty.filter((r) => cz(r) && r[3] - r[1] < 2.5 && r[2] - r[0] > 3).map((r) => ({ y: (r[1] + r[3]) / 2, x0: r[0], x1: r[2] }))
    .concat((strona.linie || []).filter((l) => Math.abs(l[1] - l[3]) < 1).map((l) => ({ y: l[1], x0: Math.min(l[0], l[2]), x1: Math.max(l[0], l[2]) })));
  const gx0 = Math.min(...sg.dni.map((d) => d.x0)), gx1 = Math.max(...sg.dni.map((d) => d.x1));
  const gy0 = sg.bloki[0].y0, gy1 = sg.dol;
  const mapa = new Map();
  for (const w of strona.slowa) {
    const x = (w[0] + w[2]) / 2, y = (w[1] + w[3]) / 2;
    if (x <= gx0 || x >= gx1 || y <= gy0 - 1 || y >= gy1 + 2) continue;   // pod siatką legenda
    const L = Math.max(gx0, ...V.filter((v) => v.x < x && v.y0 <= y + 1 && v.y1 >= y - 1).map((v) => v.x));
    const R = Math.min(gx1, ...V.filter((v) => v.x > x && v.y0 <= y + 1 && v.y1 >= y - 1).map((v) => v.x));
    const T = Math.max(gy0, ...H.filter((h) => h.y < y && h.x0 <= x + 1 && h.x1 >= x - 1).map((h) => h.y));
    const B = Math.min(gy1 + 30, ...H.filter((h) => h.y > y && h.x0 <= x + 1 && h.x1 >= x - 1).map((h) => h.y));
    const k = [L, T, R, B].map((v) => Math.round(v * 2) / 2).join(",");
    if (!mapa.has(k)) mapa.set(k, [L, T, R, Math.min(B, gy1 + 30)]);
  }
  // kawałek bez nazwy z „[…]” (sama sala, terminy, prowadzący) doklejamy do komórki tuż nad nim w tej samej kolumnie
  const kom = [...mapa.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const wynik = [];
  for (const k of kom) {
    const t = linieW(strona.slowa, k).map((l) => l.t).join(" ");
    const nad = wynik.find((q) => Math.abs(q[0] - k[0]) < 1.5 && Math.abs(q[2] - k[2]) < 1.5 && Math.abs(q[3] - k[1]) < 1.5);
    if (nad && !NAWIAS.test(t) && /^(?:s\.\s*\d|room|\d{1,2}\.\d{1,2}|dr|mgr|prof|Prof|gr\.|Gr\.)/.test(t)) { nad[3] = k[3]; continue; }
    wynik.push([...k]);
  }
  return wynik;
}

export function stronaNaZajecia(strona, { sem = semestrZKalendarza(), startRoku = 2026 } = {}) {
  const sg0 = siatka(strona);
  if (sg0.blad) return { wpisy: [], ostrzezenia: [sg0.blad] };
  const sg = { ...sg0, komorki: komorkiZLinii(strona, sg0) };
  const blok = (y) => sg.bloki.find((b) => y >= b.y0 - 1 && y <= b.y1 + 1);
  const wpisy = [], ostrzezenia = [];
  for (const k of sg.komorki) {
    const xc = (k[0] + k[2]) / 2;
    const dz = sg.dni.find((d) => xc >= d.x0 && xc <= d.x1);
    if (!dz) continue;
    const linie = linieW(strona.slowa, k);
    if (!linie.length) continue;
    const czesci = podzialKomorki(linie);
    czesci.forEach((cz, j) => {
      const z = zajeciaZLinii(cz, dz.d, sem, startRoku);
      if (!z.pl || /^(?:Zajęcia dydaktyczne|Oznaczenia|Dni zamienne|UWAGA)/i.test(z.pl) || /^\d{1,2}\.\d{1,2}\.?\s+\d{1,2}[:.]\d{2}\s+szkolenie/i.test(z.pl)) return;   // ogłoszenia, nie zajęcia
      if (!z.time) {
        // jedna część → cała komórka; kilka → od bloku pierwszej linii do bloku ostatniej (sala na dole ramki)
        const y0 = czesci.length === 1 ? k[1] + 2 : cz[0].y, y1 = czesci.length === 1 ? k[3] - 2 : (czesci[j + 1] ? czesci[j + 1][0].y - 3 : k[3] - 2);
        const b0 = blok(y0) || sg.bloki[0], b1 = blok(Math.max(y0, czesci.length === 1 ? y1 : cz[cz.length - 1].y)) || b0;
        z.time = [b0.od, (czesci.length > 1 && !czesci[j + 1] ? (blok(k[3] - 2) || b1) : b1).do];
      }
      wpisy.push({ d: dz.d, ...z, komorka: `${Math.round(k[0])},${Math.round(k[1])}`, prostokat: k.slice(0, 4), tekst: cz.map((l) => l.t).join(" ") });
    });
  }
  // dubel z rozciętej komórki: ten sam dzień, godzina, przedmiot i grupa – zostaje wpis z większą liczbą danych
  const pelnosc = (w) => (w.p ? 2 : 0) + (w.r ? 2 : 0) + (w.daty ? 1 : 0) + (w.k !== "X" ? 1 : 0);
  const naj = new Map();
  for (const w of wpisy) { const k = [w.d, w.time.join("-"), w.pl, w.pg || ""].join("|"); if (!naj.has(k) || pelnosc(w) > pelnosc(naj.get(k))) naj.set(k, w); }
  return { wpisy: [...naj.values()], ostrzezenia };
}

export function plikNaPlan(buf, nazwaGrupy, { sem = semestrZKalendarza(), startRoku = 2026, tekst = null } = {}) {
  const t = tekst || pdfNaTekst(buf);
  const groups = {}, ostrzezenia = [];
  let zajec = 0;
  for (const s of t.strony) {
    const r = stronaNaZajecia(s, { sem, startRoku });
    ostrzezenia.push(...r.ostrzezenia);
    for (const { daty, komorka, prostokat, tekst: _t, ...e } of r.wpisy) { dodaj(groups, nazwaGrupy, e, { daty }); zajec++; }
  }
  return { groups, ostrzezenia, zajec };
}

// ---------- importer wydziału (kontrakt scripts/us/importuj.mjs) ----------
export async function importuj({ wydzial, zrodla, kierunki, pobieracz, log = () => {}, naSucho = false }) {
  if (!jestPyMuPDF()) { log("WNŚiP: brak PyMuPDF – pomijam plany z PDF"); return []; }
  const sem = semestrZKalendarza();
  const startRoku = +sem.od.slice(0, 4) - (+sem.od.slice(5, 7) < 9 ? 1 : 0);
  const wyniki = [];
  for (const z of zrodla.filter((x) => x.typ === "plan" && x.format === "pdf" && x.tryb === "st")) {
    const kz = z.kierunki[0];
    const k = kierunki.find((x) => x.kod && x.kod === kz.kod);
    const rr = k?.roczniki?.find((x) => x.stopien === kz.stopien && x.rok === (kz.lata || [])[0] && x.tryb === "st");
    if (!rr) { wyniki.push({ id: `wnsip-${z.plik}`, kierunek: { pl: kz.nazwa }, blad: `brak rocznika w config/kierunki-us.json (${kz.nazwa}, kod ${kz.kod || "?"})` }); continue; }
    const f = await pobieracz.plik(z.url);
    if (!f || f.brak) { wyniki.push({ id: rr.id, kierunek: { pl: k.pl }, blad: "brak pliku " + z.url }); continue; }
    const { groups, ostrzezenia } = plikNaPlan(f.buf, `${k.kod}${rr.rok}`, { sem, startRoku });
    for (const q of ostrzezenia) log(`WNŚiP ${z.plik}: ${q}`);
    const r = { id: rr.id, kod: kodStrony(k.kod, rr.stopien, rr.tryb, rr.nabor), kierunek: { pl: k.pl, en: k.en || k.pl }, stopien: rr.stopien, tryb: rr.tryb, rok: rr.rok,
      groups, source: z.url, wersja: z.wersja || z.plik, sha256: f.sha256, rokAkademicki: `${startRoku}/${startRoku + 1}`, semestr: sem.nazwa || "zimowy" };
    const q = await przezKolejke(r, { wydzial: wydzial.skrot.normalize("NFD").replace(/[^A-Za-z]/g, ""), naSucho, log });
    const kolejka = { pozycji: q.pozycji, doDecyzji: q.doDecyzji, wyslany: q.wyslany, blad: q.blad };
    if (q.status === "zatwierdzony") wyniki.push({ ...r, groups: q.groups });
    else if (q.poprzedni) wyniki.push({ ...r, groups: q.poprzedni, wersja: `${z.plik} (na stronie wcześniejsza zatwierdzona wersja)`, sha256: undefined, kolejka });
    else wyniki.push({ ...r, zatwierdzenie: true, kolejka });
  }
  return wyniki;
}
