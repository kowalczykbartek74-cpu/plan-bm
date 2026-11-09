// Etap 7 (cały US): studia niestacjonarne Wydziału Prawa i Administracji – PDF na rocznik (wpia.usz.edu.pl/rozklady-zajec/,
// „I-NSP-8.pdf”, „II-NSA-I-st.-9.pdf”, „I-NPSM-I-st.-5.pdf”…).
//
// Układ (obejrzany 9.11.2026 na I-NSP-8.pdf; pozostałe pliki z tego samego szablonu):
// - Jedna strona A3 poziomo, trzy pasy dni jeden pod drugim: PIĄTEK, SOBOTA, NIEDZIELA (nazwa dnia w lewej kolumnie).
// - W pasie: wiersz „Godzina | 02.10.2026 | 09.10.2026 | …” – kolumna = jeden zjazd (data), granice kolumn = czarne linie
//   pionowe przez wiersz dat; pod nim wiersze po 45 min z etykietą w lewej kolumnie („15:15-16:00”).
// - Zajęcia = kolorowa komórka (jak w planach stacjonarnych: plasterki tniemy liniami pionowymi, sklejamy w pionie). W jednej
//   kolumnie-dacie bywa kilka komórek obok siebie (grupy: „WP 1 (15 godz.)”, „K 2 (20 godz.)”), tekst komórki jak w trybie
//   stacjonarnym (nazwa, „(NN godz.)”, „[WP]”, prowadzący, „godz. 17.00 - 20.15”, sala, „MS TEAMS: kod”, „[zajęcia hybrydowe]”).
// - „PRZERWA OBIADOWA” = czarny pas – nie zajęcia.
// Data zajęć = data kolumny (zawsze „dates”). Wynik idzie przez kolejkę zatwierdzeń jak każdy PDF (scripts/us/kolejka.mjs).
import { pdfNaTekst, tekstW, skroty, czesciKomorki, czescNaZajecia, jestPyMuPDF } from "./wpia-pdf.mjs";
import { dodaj } from "./wspolne.mjs";
import { semestrZKalendarza } from "./wh-xlsx.mjs";
import { kodStrony } from "../kierunki.mjs";
import { przezKolejke } from "./kolejka.mjs";

const DNI = { PIĄTEK: 4, SOBOTA: 5, NIEDZIELA: 6 };
const czarny = (r) => r[4] === "#000000";
const hhmm = (h, m) => `${String(+h).padStart(2, "0")}:${m}`;
const DATA_RE = /^(\d{1,2})\.(\d{2})\.(20\d\d)$/;
const iso = (m) => `${m[3]}-${m[2]}-${m[1].padStart(2, "0")}`;
const dzTyg = (s) => (new Date(s + "T12:00:00Z").getUTCDay() + 6) % 7;

// ---------- siatka strony: pasy dni → kolumny dat, bloki godzin, komórki ----------
export function siatkaNst(strona) {
  const { slowa, prostokaty } = strona;
  const linieV = prostokaty.filter((r) => czarny(r) && r[2] - r[0] < 2.5 && r[3] - r[1] > 4);
  const linieH = prostokaty.filter((r) => czarny(r) && r[3] - r[1] < 2.5 && r[2] - r[0] > 8);
  const dniS = slowa.filter((w) => w[0] < 80 && DNI[String(w[4]).toUpperCase()] != null).sort((a, b) => a[1] - b[1]);
  if (!dniS.length) return { blad: "brak nazw dni (PIĄTEK/SOBOTA/NIEDZIELA) w lewej kolumnie" };
  const pasy = [], ostrzezenia = [];
  dniS.forEach((w, i) => {
    const d = DNI[String(w[4]).toUpperCase()], y0 = w[1] - 1, y1 = (dniS[i + 1]?.[1] ?? strona.h) - 1;
    // wiersz dat
    const daty = slowa.filter((x) => x[1] >= y0 && x[1] < y1 && DATA_RE.test(x[4]));
    if (!daty.length) { ostrzezenia.push(`${w[4]}: brak dat zjazdów`); return; }
    const yD = Math.min(...daty.map((x) => x[1])), yD1 = Math.max(...daty.map((x) => x[3]));
    const wDacie = daty.filter((x) => x[1] < yD + 3);
    const piony = [...new Set(linieV.filter((r) => r[1] <= yD + 1 && r[3] >= yD1 - 1).map((r) => Math.round(r[0])))].sort((a, b) => a - b);
    const kolumny = [];
    for (let j = 0; j + 1 < piony.length; j++) {
      const t = wDacie.find((x) => (x[0] + x[2]) / 2 > piony[j] && (x[0] + x[2]) / 2 < piony[j + 1]);
      if (t) { const data = iso(DATA_RE.exec(t[4])); if (dzTyg(data) !== d) ostrzezenia.push(`${w[4]}: data ${data} to inny dzień tygodnia`); kolumny.push({ x0: piony[j], x1: piony[j + 1], data }); }
    }
    if (!kolumny.length) { ostrzezenia.push(`${w[4]}: brak linii kolumn przy datach`); return; }
    const x0 = kolumny[0].x0;
    // bloki godzin: etykiety w lewej kolumnie, granice = poziome linie lewej kolumny
    const etyk = slowa.filter((x) => x[2] <= x0 + 1 && x[1] > yD1 && x[1] < y1 && /^\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}$/.test(x[4]));
    const poziome = [...new Set(linieH.filter((r) => r[2] <= x0 + 2 && r[1] > yD - 2 && r[1] < y1 + 2).map((r) => Math.round(r[1])))].sort((a, b) => a - b);
    const bloki = etyk.sort((a, b) => a[1] - b[1]).map((x) => {
      const yc = (x[1] + x[3]) / 2, [a, b] = x[4].replace(/\./g, ":").replace(/\s/g, "").split(/[-–]/);
      return { y0: poziome.filter((y) => y < yc).pop() ?? x[1] - 4, y1: poziome.find((y) => y > yc) ?? x[3] + 4, od: hhmm(...a.split(":")), do: hhmm(...b.split(":")) };
    });
    if (!bloki.length) { ostrzezenia.push(`${w[4]}: brak etykiet godzin`); return; }
    const gora = bloki[0].y0, dol = bloki[bloki.length - 1].y1;
    // plasterki kolorowe w pasie → cięte liniami pionowymi → sklejane w pionie
    const pl = prostokaty.filter((r) => r[4] && !czarny(r) && r[4] !== "#ffffff" && r[0] >= x0 - 1 && r[1] >= Math.min(gora, yD1) - 1 && r[1] < dol - 1 && r[2] - r[0] > 6 && r[3] - r[1] > 1.5)
      .flatMap((r) => {
        const h = r[3] - r[1];   // linia tnąca = przez cały plasterek (nie krótka linia podkomórki obok)
        const xs = [...new Set(linieV.filter((l) => l[0] > r[0] + 3 && l[0] < r[2] - 3 && Math.min(l[3], r[3]) - Math.max(l[1], r[1]) > Math.max(h * 0.9, h - 1)).map((l) => Math.round(l[0])))].sort((a, b) => a - b);
        const g = [r[0], ...xs, r[2]];
        return g.slice(0, -1).map((x, k) => [x, r[1], g[k + 1], r[3], r[4]]);
      })
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);   // od góry: plasterek doklejamy do komórki nad nim (x z tolerancją)
    const komorki = [];
    for (const r of pl) {
      const k = komorki.find((q) => Math.abs(q[0] - r[0]) < 1.5 && Math.abs(q[2] - r[2]) < 1.5 && q[4] === r[4] && Math.abs(q[3] - r[1]) < 1.5
        && !linieH.some((l) => Math.abs(l[1] - r[1]) < 1.5 && l[0] <= r[0] + 3 && l[2] >= r[2] - 3));
      if (k) k[3] = Math.max(k[3], r[3]); else komorki.push(r);
    }
    pasy.push({ d, kolumny, bloki, komorki: komorki.filter((k) => tekstW(slowa, k).join(" ").trim()) });
  });
  return { pasy, ostrzezenia };
}

// ---------- strona → wpisy (jeden wpis = zajęcia w jednym dniu zjazdu) ----------
export function stronaNst(strona, { startRoku = 2026 } = {}) {
  const sg = siatkaNst(strona);
  if (sg.blad) return { wpisy: [], ostrzezenia: [sg.blad] };
  const ostrzezenia = [...sg.ostrzezenia], wpisy = [];
  const linieK = (k) => tekstW(strona.slowa, k).map((l) => l.replace(/\bPiastow\b/g, "Piastów"));
  const teksty = sg.pasy.flatMap((p) => p.komorki.map(linieK));
  // skróty z wykładów: „Wstęp do prawoznawstwa [WP] (25 godz.)”, „Prawo konstytucyjne - zasady i źródła prawa (25 godz.) [K]”
  const skr = skroty(teksty.map((l) => l.join(" ")));
  for (const l of teksty) {
    const m = /^(.+?)\s*(?:\[([A-ZŁŚŻ][A-Za-z]{0,5})\]\s*\(\s*\d+\s*godz\.?\s*\)|\(\s*\d+\s*godz\.?\s*\)\s*\[([A-ZŁŚŻ][A-Za-z]{0,5})\])/.exec(l.join(" "));
    if (m) skr[m[2] || m[3]] = m[1].trim();
  }
  for (const p of sg.pasy) {
    for (const k of p.komorki) {
      const xc = (k[0] + k[2]) / 2, kol = p.kolumny.find((c) => xc >= c.x0 && xc <= c.x1);
      if (!kol) continue;
      const linie = linieK(k), tekst = linie.join(" ");
      if (/^(?:Konsultacje|PRZERWA)\b/i.test(tekst)) continue;
      const b0 = p.bloki.find((b) => k[1] + 2 >= b.y0 && k[1] + 2 <= b.y1) || p.bloki[0];
      const b1 = [...p.bloki].reverse().find((b) => k[3] - 2 >= b.y0 && k[3] - 2 <= b.y1) || p.bloki[p.bloki.length - 1];
      const czesci = czesciKomorki(linie).map((t) => ({ t, z: czescNaZajecia(t, skr, { startRoku }) }));
      czesci.forEach((c, j) => {
        const poprz = czesci.slice(0, j).reverse().find((x) => x.z.time || x.z.r);
        if (!c.z.time) c.z.time = poprz?.z.time || [b0.od, b1.do];
        if (!c.z.r && poprz) c.z.r = poprz.z.r;
        // MS TEAMS: kod / [zajęcia hybrydowe] → notka; „online (MS Teams)” bez sali
        const teams = /MS\s*TEAMS:?\s*([A-Za-z0-9]{5,10})/i.exec(c.t)?.[1];
        // rodzaj: komórka ze skrótem w nawiasie kwadratowym = wykład; „WP 3”, „K 1” = ćwiczenia do tego wykładu
        if (/\[[A-ZŁŚŻ][A-Za-z]{0,5}\]/.test(c.t)) c.z.k = "W";
        else if (c.z.kod && c.z.grupy.length && c.z.k === "X") c.z.k = "CW";
        if (!c.z.grupy.length) { const g = /\bgr\.\s*(\d{1,2})\b/.exec(c.t); if (g) c.z.grupy = [g[1]]; }
        // „KLINIKA PRAWA godz. 17.30 - 20.00,” (bez „(NN godz.)”), „Wykład ogólnouczelniany godz. … (wykaz wykładów … https://…)”
        const wykaz = /\(wykaz[^)]*?(https?:\/\/\S+?)\)/i.exec(c.t)?.[1];
        let pl = c.z.pl.replace(/\s*\[[^\]]*\]\s*/g, " ").replace(/\s*\(wykaz[^]*$/i, "").replace(/\s*,?\s*godz\.\s*\d[^]*$/i, "").replace(/[\s,]+$/, "").replace(/\s+/g, " ").trim();
        if (/^KLINIKA PRAWA$/.test(pl)) pl = "Klinika prawa";
        // sala poza budynkami wydziału: „s. 107 ICKiBS przy ul. Krakowskiej 71/79 (strzelnica)”
        const ick = /s\.\s*\d+\s+ICKiBS\s+przy\s+ul\.\s*Krakowskiej\s*[\d/]+(?:\s*\(strzelnica\))?/i.exec(c.t.replace(/\s+/g, " "));
        if (ick) c.z.r = ick[0];
        if (/^Wykład\b/.test(pl) && c.z.k === "X") c.z.k = "W";
        const n = [c.z.n, /hybryd/i.test(c.t) ? "zajęcia hybrydowe" : "", teams ? `kod MS Teams: ${teams}` : "", wykaz ? `wykaz wykładów: ${wykaz}` : ""].filter(Boolean).join("; ");
        if (!pl) ostrzezenia.push(`${kol.data} ${Math.round(k[0])},${Math.round(k[1])}: nie odczytałem nazwy`);
        for (const g of c.z.grupy.length ? c.z.grupy : [null]) {
          wpisy.push({ d: p.d, time: c.z.time, pl, k: c.z.k, p: c.z.p, r: c.z.r, ...(g ? { pg: `${pl}:${g}` } : {}), ...(n ? { n } : {}),
            daty: [kol.data], komorka: `${kol.data} ${Math.round(k[0])},${Math.round(k[1])}`, tekst: c.t });
        }
      });
    }
  }
  return { wpisy, ostrzezenia, skroty: skr };
}

// te same zajęcia w kilku zjazdach → jeden wpis z listą dat
export function zlozNst(wpisy) {
  const m = new Map();
  for (const { daty, komorka, tekst, ...e } of wpisy) {
    const k = JSON.stringify([e.pg || "", e.d, e.time, e.pl, e.k, e.p, e.r, e.n || ""]);
    const x = m.get(k); if (x) { for (const d of daty) if (!x.daty.includes(d)) x.daty.push(d); } else m.set(k, { e, daty: [...daty] });
  }
  return [...m.values()].map((x) => ({ ...x, daty: x.daty.sort() }));
}

export function plikNaPlanNst(buf, nazwaGrupy, { startRoku = 2026, tekst = null } = {}) {
  const t = tekst || pdfNaTekst(buf);
  const wpisy = [], ostrzezenia = [];
  for (const s of t.strony) { const r = stronaNst(s, { startRoku }); wpisy.push(...r.wpisy); ostrzezenia.push(...r.ostrzezenia); }
  const lista = zlozNst(wpisy), groups = {};
  for (const { e, daty } of lista) dodaj(groups, nazwaGrupy, e, { daty });
  return { groups, ostrzezenia, zajec: lista.length, wpisy };
}

// ---------- importer (wołany z wpia-pdf.mjs → importuj) ----------
export async function importujNst({ wydzial, zrodla, kierunki, pobieracz, log = () => {}, naSucho = false }) {
  if (!jestPyMuPDF()) return [];
  const sem = semestrZKalendarza();
  const startRoku = +sem.od.slice(0, 4) - (+sem.od.slice(5, 7) < 9 ? 1 : 0);
  const wyniki = [];
  for (const z of zrodla.filter((x) => x.typ === "plan" && x.format === "pdf" && x.tryb === "nst")) {
    const kz = z.kierunki[0];
    const k = kierunki.find((x) => x.kod && x.kod === kz.kod);
    const rr = k?.roczniki?.find((x) => x.stopien === kz.stopien && x.rok === (kz.lata || [])[0] && x.tryb === "nst");
    if (!rr) { wyniki.push({ id: `wpia-nst-${z.plik}`, kierunek: { pl: kz.nazwa }, blad: `brak rocznika nst w config/kierunki-us.json (${kz.nazwa}, ${kz.stopien} st., rok ${(kz.lata || [])[0]})` }); continue; }
    const f = await pobieracz.plik(z.url);
    if (!f || f.brak) { wyniki.push({ id: rr.id, kierunek: { pl: k.pl }, blad: "brak pliku " + z.url }); continue; }
    let wynik;
    try { wynik = plikNaPlanNst(f.buf, `${k.kod}${rr.rok}`, { startRoku }); }
    catch (e) { wyniki.push({ id: rr.id, kierunek: { pl: k.pl }, blad: `${z.plik}: ${e.message}` }); continue; }
    for (const q of wynik.ostrzezenia) log(`WPiA nst ${z.plik}: ${q}`);
    if (!wynik.zajec) { wyniki.push({ id: rr.id, kierunek: { pl: k.pl }, blad: `${z.plik}: nie odczytałem żadnych zajęć (${wynik.ostrzezenia[0] || "inny układ pliku"})` }); continue; }
    const r = { id: rr.id, kod: kodStrony(k.kod, rr.stopien, rr.tryb, rr.nabor), kierunek: { pl: k.pl, en: k.en || k.pl }, stopien: rr.stopien, tryb: rr.tryb, rok: rr.rok,
      groups: wynik.groups, source: z.url, wersja: z.plik, sha256: f.sha256, rokAkademicki: `${startRoku}/${startRoku + 1}`, semestr: sem.nazwa || "zimowy" };
    const q = await przezKolejke(r, { wydzial: wydzial.skrot, naSucho, log });
    const kolejka = { pozycji: q.pozycji, doDecyzji: q.doDecyzji, wyslany: q.wyslany, blad: q.blad };
    if (q.status === "zatwierdzony") wyniki.push({ ...r, groups: q.groups });
    else if (q.poprzedni) wyniki.push({ ...r, groups: q.poprzedni, wersja: `${z.plik} (na stronie wcześniejsza zatwierdzona wersja)`, sha256: undefined, kolejka });
    else wyniki.push({ ...r, zatwierdzenie: true, kolejka });
  }
  return wyniki;
}
