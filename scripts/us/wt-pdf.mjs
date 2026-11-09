// Etap 5 (cały US): Wydział Teologiczny – plany Teologii (jm, lata 1–5) i Nauk o rodzinie (I st. 1–3, II st. 1–2).
// Oba PDF-y (teo.usz.edu.pl) to SKANY: strona = obraz, bez warstwy tekstowej, więc parser współrzędnych (jak WPiA/WNS) nie ma czego
// czytać, a OCR dostępny lokalnie (macOS Vision) nie zna polskiego. Zgodnie ze spec (pkt 5.2: „niepewny odczyt → szkic AI według
// profilu importy/<wydział>.json”) plan pochodzi z ODCZYTU AI zapisanego w odczyty/wt/<plik>.json, który:
//   • obowiązuje tylko dla pliku o tym samym sha256 – nowa wersja PDF-u bez nowego odczytu = nic się nie zmienia na stronie
//     (zostaje poprzedni zatwierdzony plan), a w stanie importu jest „skan bez odczytu” z instrukcją dla Bartka;
//   • zawsze idzie przez kolejkę zatwierdzeń (przezKolejke, wydział „WT”) – na stronę tylko po „tak” w panelu Importy.
// Nowy odczyt: panel zdawalni.pl → Narzędzia starosty → Importy → wgraj PDF (profil importy/WT.json, klucz API Bartka),
// albo nowy plik odczyty/wt/<plik>.json w tym samym formacie (kol = kolumna tabeli z „kolumny”, d = dzień 0–4, t = godziny,
// kiedy = terminy z planu: „od 16 XI”, „12 X 19 X”, „pierwsza połowa”, „druga połowa”, „oprócz 8 X 5 XI”).
import fs from "node:fs";
import path from "node:path";
import { pdfNaTekst, jestPyMuPDF } from "./wpia-pdf.mjs";
import { semestrZKalendarza } from "./wh-xlsx.mjs";
import { terminyWNS } from "./wns-pdf.mjs";
import { dodaj } from "./wspolne.mjs";
import { kodStrony } from "../kierunki.mjs";
import { przezKolejke } from "./kolejka.mjs";

export const ODCZYTY = "odczyty/wt";
const iso = (d) => d.toISOString().slice(0, 10);
const plus = (s, n) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const dzienTyg = (s) => (new Date(s + "T12:00:00Z").getUTCDay() + 6) % 7;

// wszystkie daty danego dnia tygodnia w semestrze
export function tygodnie(d, sem) {
  const out = []; let x = sem.od;
  while (dzienTyg(x) !== d) x = plus(x, 1);
  for (; x <= sem.do; x = plus(x, 7)) out.push(x);
  return out;
}

// „kiedy” z odczytu → daty (null = co tydzień)
export function terminyWT(kiedy, d, sem, startRoku) {
  if (!kiedy) return null;
  const t = String(kiedy).trim(), wszystkie = tygodnie(d, sem), pol = Math.ceil(wszystkie.length / 2);
  if (/^pierwsza poł/i.test(t)) return wszystkie.slice(0, pol);
  if (/^druga poł/i.test(t)) return wszystkie.slice(pol);
  const m = /^(?:oprócz|bez)\s+(.+)$/i.exec(t);
  if (m) { const bez = new Set(terminyWNS(m[1], d, sem, startRoku).daty || []); return wszystkie.filter((x) => !bez.has(x)); }
  const daty = terminyWNS(t, d, sem, startRoku).daty;
  if (!daty?.length) throw new Error(`nieczytelne terminy: „${t}”`);
  return daty;
}

// rodzaj zajęć z dopisku w nazwie; reszta bez oznaczenia = X (stopka planu: kolejność wykładów i ćwiczeń ogłasza prowadzący)
export function rodzajWT(pl) {
  if (/\[(?:wykład|wyk\.?)\]/i.test(pl) || /^Wykład\b/.test(pl)) return "W";
  if (/\[(?:ćwiczenia|ćw\.?)\]/i.test(pl) || /^(?:Język|Emisja głosu|Wychowanie fizyczne)\b/.test(pl)) return "CW";
  if (/\[(?:laboratorium|lab\.?)\]/i.test(pl)) return "LAB";
  return "X";
}
export const salaWT = (r) => (/^\d+[a-z]?$/i.test(String(r || "").trim()) ? `s. ${String(r).trim()}` : String(r || "").trim());

const godz = (t) => { const m = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(t); if (!m || m[1] >= m[2]) throw new Error(`zły zapis godzin: „${t}”`); return [m[1], m[2]]; };

// odczyt → { "<stopień>-<rok>": { groups, zajec } }
export function odczytNaPlany(o, { kod, sem = semestrZKalendarza(), startRoku = 2026 } = {}) {
  const out = {};
  for (const z of o.zajecia) {
    const kol = o.kolumny[z.kol];
    if (!kol) throw new Error(`kolumna ${z.kol} spoza „kolumny” (${z.pl})`);
    if (!(z.d >= 0 && z.d <= 5)) throw new Error(`zły dzień ${z.d} (${z.pl})`);
    const n = [z.n, z.krotkie ? "zajęcia mające 8, 14 lub 15 godzin" : null].filter(Boolean).join("; ");
    const e = { d: z.d, time: godz(z.t), pl: z.pl.replace(/\s*\[[^\]]*\]\s*/g, " ").replace(/\s+/g, " ").trim(), k: rodzajWT(z.pl), p: z.p || "", r: salaWT(z.r), n };
    const klucz = `${kol.s}-${kol.rok}`, p = (out[klucz] ||= { groups: {}, zajec: 0 });
    dodaj(p.groups, `${kod}${kol.rok}`, e, { daty: terminyWT(z.kiedy, z.d, sem, startRoku) });
    p.zajec++;
  }
  return out;
}

export function wczytajOdczyt(plik, katalog = ODCZYTY) {
  const f = path.join(katalog, plik.replace(/\.pdf$/i, ".json"));
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
}
export const czySkan = (tekst) => (tekst.strony || []).every((s) => !(s.slowa || s.words || []).length);

// ---------- importer wydziału (kontrakt scripts/us/importuj.mjs) ----------
export async function importuj({ wydzial, zrodla, kierunki, pobieracz, log = () => {}, naSucho = false, katalog = ODCZYTY }) {
  const sem = semestrZKalendarza();
  const startRoku = +sem.od.slice(0, 4) - (+sem.od.slice(5, 7) < 9 ? 1 : 0);
  const wyniki = [];
  for (const z of zrodla.filter((x) => x.typ === "plan" && x.format === "pdf" && x.tryb === "st")) {
    const kz = z.kierunki[0];
    const k = kierunki.find((x) => x.kod && x.kod === kz?.kod);
    if (!k) { wyniki.push({ id: `wt-${z.plik}`, kierunek: { pl: kz?.nazwa || z.plik }, blad: `brak kierunku w config/kierunki-us.json (${kz?.nazwa}, kod ${kz?.kod || "?"})` }); continue; }
    const f = await pobieracz.plik(z.url);
    if (!f || f.brak) { wyniki.push({ id: `wt-${k.kod}`, kierunek: { pl: k.pl }, blad: "brak pliku " + z.url }); continue; }
    try { if (f.buf.subarray(0, 4).toString() === "%PDF" && jestPyMuPDF() && !czySkan(pdfNaTekst(f.buf))) log(`WT ${z.plik}: plik ma teraz warstwę tekstową – można dopisać parser współrzędnych (jak WNS)`); } catch { /* nieczytelny PDF – zostaje odczyt */ }
    const o = wczytajOdczyt(z.plik, katalog);
    const roczniki = (k.roczniki || []).filter((r) => r.tryb === "st" && r.zrodlo === z.url);
    const bezOdczytu = !o ? "brak odczytu" : o.sha256 !== f.sha256 ? `odczyt dotyczy innej wersji pliku (${o.sha256.slice(0, 8)} ≠ ${f.sha256.slice(0, 8)})` : null;
    if (bezOdczytu) {
      // nowa wersja skanu: nic nie zgadujemy – zostaje poprzedni plan, Bartek robi szkic AI w panelu (profil WT)
      for (const rr of roczniki) wyniki.push({ id: rr.id, kierunek: { pl: k.pl }, blad: `skan bez odczytu: ${bezOdczytu}; wgraj ${z.plik} w zdawalni.pl → Importy (profil WT) albo dodaj ${katalog}/${z.plik.replace(/\.pdf$/i, ".json")}` });
      continue;
    }
    const plany = odczytNaPlany(o, { kod: k.kod, sem, startRoku });
    for (const rr of roczniki) {
      const p = plany[`${rr.stopien}-${rr.rok}`];
      if (!p) { wyniki.push({ id: rr.id, kierunek: { pl: k.pl }, blad: `${z.plik}: odczyt nie ma kolumny ${rr.stopien === 0 ? "jm" : rr.stopien === 2 ? "II st." : "I st."} ${rr.rok}. rok` }); continue; }
      const r = { id: rr.id, kod: kodStrony(k.kod, rr.stopien, rr.tryb, rr.nabor), kierunek: { pl: k.pl, en: k.en || k.pl }, stopien: rr.stopien, tryb: rr.tryb, rok: rr.rok,
        groups: p.groups, source: z.url, wersja: o.aktualizacja ? `${z.plik} (aktualizacja ${o.aktualizacja})` : z.plik, sha256: f.sha256, rokAkademicki: `${startRoku}/${startRoku + 1}`, semestr: "zimowy" };
      const q = await przezKolejke(r, { wydzial: "WT", naSucho, log });
      const kolejka = { pozycji: q.pozycji, doDecyzji: q.doDecyzji, wyslany: q.wyslany, blad: q.blad };
      if (q.status === "zatwierdzony") wyniki.push({ ...r, groups: q.groups });
      else if (q.poprzedni) wyniki.push({ ...r, groups: q.poprzedni, wersja: `${z.plik} (na stronie wcześniejsza zatwierdzona wersja)`, sha256: undefined, kolejka });
      else wyniki.push({ ...r, zatwierdzenie: true, kolejka });
    }
  }
  return wyniki;
}

// ---------- siatka skanu (scripts/us/skan_siatka.py): prostokąt zajęć do wycinka pilota ----------
const BLOKI = ["08:15", "10:00", "11:45", "13:30", "15:15", "17:00"];
export function prostokatWT(z, siatka) {
  const dzien = siatka.dni[Math.min(z.d, siatka.dni.length - 1)], wierszy = dzien.length - 1;   // piątek wpisany w wiersz czwartku (TEO)
  const [od, doo] = godz(z.t);
  const wiersz = (t, koniec) => { let i = BLOKI.findIndex((b, j) => (koniec ? t <= (BLOKI[j + 1] || "24:00") : t < (BLOKI[j + 1] || "24:00"))); if (i < 0) i = BLOKI.length - 1; return Math.min(i, wierszy - 1); };
  const a = z.d === 4 && siatka.dni.length < 5 ? wierszy - 1 : wiersz(od, false), b = z.d === 4 && siatka.dni.length < 5 ? wierszy - 1 : Math.max(a, wiersz(doo, true));
  return [siatka.pionowe[z.kol], dzien[a], siatka.pionowe[z.kol + 1], dzien[b + 1]];
}
