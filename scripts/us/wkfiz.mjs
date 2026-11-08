// Etap 3 planu całego US: importer Wydziału Kultury Fizycznej i Zdrowia (aplikacja planyzajec-kfz.usz.edu.pl).
// Dane: jedno zapytanie GET api/get_schedule.php → { classes: [{ subject, type, teacher, day, startTime, endTime, room, group, studyMode }] }.
// Grupa aplikacji = rocznik („WF 1 rok I stopień”) → plan/<id rocznika z config/kierunki-us.json>.json, jedna grupa „WF1”.
// W nazwie przedmiotu aplikacja trzyma resztę informacji, np.:
//   „8:00-9:30; teoria i metodyka lekkiej atletyki 30h, 1ćs (8.10-25.01.27)”
//    └ prawdziwa godzina  └ przedmiot                 └ godz. └ podgrupa  └ terminy (zakres co tydzień albo lista dat)
// Podgrupy mają osobną numerację dla każdego rodzaju zajęć (ćs = ćw. specjalistyczne, lb = laboratoria, ć = ćwiczenia,
// k = konwersatoria, zt = zajęcia terenowe, [Ngr] = seminarium N) → pole „pg” (np. "ćs1", "lb3"); strona ma wybór podgrup.
// Bez numeru („w”, „ć”) = cały rok. Terminy → „dates” (YYYY-MM-DD); gdy terminów nie da się odczytać, zostają jako notka „n”.
// Tylko studia stacjonarne (niestacjonarne w aplikacji to HTML na grupę – Etap 7).
import crypto from "node:crypto";
import { dzienZ, godzinyZ, rodzajZ, prowadzacyZ, dodaj, rokDla } from "./wspolne.mjs";
import { grupaWKFiZ } from "./zrodla.mjs";
import { kodStrony } from "../kierunki.mjs";

export const API = "https://planyzajec-kfz.usz.edu.pl/api/get_schedule.php";
export const APLIKACJA = "https://planyzajec-kfz.usz.edu.pl/index.html";
const RODZAJ = { "Wykład": "W", "Ćwiczenia": "CW", "Ćwiczenia specjalistyczne": "CW", "Laboratorium": "LAB", "Konwersatoria": "K", "Seminarium": "S", "Zajęcia terenowe": "X", "Zajęcia": "X" };
const PG = { "ćs": "ćs", lb: "lb", "ć": "ć", "ćw": "ć", k: "k", zt: "zt", gr: "sem" };

const iso = (r, m, d) => `${r}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const rok = (yy, m, start) => (yy ? (String(yy).length === 2 ? 2000 + +yy : +yy) : rokDla(m, start));
const dzienTyg = (s) => (new Date(s + "T12:00:00Z").getUTCDay() + 6) % 7;   // 0 = poniedziałek
const dodajDni = (s, n) => { const t = new Date(s + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

// „8.10-25.01.27”, „5-26.10”, „8-29.10; 12.11-28.01.27”, „3,10,17,24.11; 1,8,15,22.12; 12,19.01.27”, „29.10; 5,12,11; 3,10.12”, „9,16.10; 4,12”
// → lista dat (zakres: co tydzień w dniu d). null, gdy coś jest nie do odczytania.
export function terminy(tekst, d, startRoku = 2026) {
  const out = [];
  for (let seg of String(tekst).replace(/\s+oraz\s+/gi, ";").replace(/-{2,}/g, "-").split(";")) {
    seg = seg.trim().replace(/-\s*\./g, "-").replace(/\s+/g, "");
    if (!seg) continue;
    const z = /^(\d{1,2})(?:\.(\d{1,2}))?(?:\.(\d{2,4}))?-(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/.exec(seg);
    if (z) {
      const m2 = +z[5], m1 = z[2] ? +z[2] : m2;
      let a = iso(rok(z[3], m1, startRoku), m1, +z[1]); const b = iso(rok(z[6], m2, startRoku), m2, +z[4]);
      if (a > b || d == null) return null;
      while (dzienTyg(a) !== d) a = dodajDni(a, 1);
      for (; a <= b; a = dodajDni(a, 7)) out.push(a);
      continue;
    }
    if (!/^[\d.,]+$/.test(seg)) return null;
    const t = seg.split(",").filter(Boolean);
    const zapisz = (dni, mies, yy) => {
      if (!(mies >= 1 && mies <= 12) || !dni.length) return false;
      for (const dd of dni) { const x = +dd; if (!(x >= 1 && x <= 31)) return false; out.push(iso(rok(yy, mies, startRoku), mies, x)); }
      return true;
    };
    if (!t.some((x) => x.includes("."))) {   // „5,12,11” = 5 i 12 listopada, „4,12” = 4 grudnia
      if (t.length < 2 || !zapisz(t.slice(0, -1), +t[t.length - 1], null)) return null;
      continue;
    }
    // „7,21.10, 4,25.11, 13.01.27”: dni zbierają się do najbliższego „dd.mm[.yy]”, który zamyka miesiąc
    let dni = [];
    for (const x of t) {
      const q = x.split(".");
      if (q.length === 1) { dni.push(q[0]); continue; }
      if (!zapisz([...dni, q[0]], +q[1], q[2] || null)) return null;
      dni = [];
    }
    if (dni.length) return null;
  }
  return out.length ? [...new Set(out)].sort() : null;
}

// Jedne zajęcia z aplikacji → wpis planu (+ daty, notka)
export function wpis(c, startRoku = 2026) {
  let s = String(c.subject || "").replace(/\s+/g, " ").trim();
  let time = [c.startTime, c.endTime].map((t) => String(t || "").slice(0, 5).padStart(5, "0"));
  const g0 = /^(\d{1,2}[:.]\d{2})\s*-\s*(\d{1,2}[:.]\d{2})\s*[;,]\s*/.exec(s);
  if (g0) { time = godzinyZ(g0[1] + "-" + g0[2]) || time; s = s.slice(g0[0].length); }
  // terminy w ostatnim nawiasie z cyframi
  let daty = null, n = null;
  const nw = /\(([^()]*\d[^()]*)\)\s*[,.]?\s*$/.exec(s);
  const d = dzienZ(c.day);
  if (nw) { daty = terminy(nw[1], d, startRoku); if (!daty || daty.some((x) => dzienTyg(x) !== d)) { n = nw[1].trim(); daty = daty?.filter((x) => dzienTyg(x) === d) || null; if (!daty?.length) daty = null; } s = s.slice(0, nw.index).trim(); }
  // „… 30h, 1ćs”, „… 30h, [4gr]”, „… 30h, ć 4h”, „… 15h, w,”
  let pg = null;
  const h = /\s*\d+\s*h\b\s*,?\s*(.*)$/i.exec(s);
  let pl = s;
  if (h) {
    pl = s.slice(0, h.index).trim();
    const reszta = h[1].replace(/[,\s]+$/, "");
    const m = /^\[?\s*(\d+)\s*([a-ząćęłńóśźż]+)\s*\]?/i.exec(reszta);
    if (m && PG[m[2].toLowerCase()]) pg = PG[m[2].toLowerCase()] + m[1];
  }
  pl = pl.replace(/[,;]\s*$/, "").trim();
  const k = RODZAJ[c.type] ?? rodzajZ(c.type);
  const r = String(c.room || "").replace(/^sala\s+/i, "s. ").trim();
  return { wpis: { d, time, pl, k, p: prowadzacyZ(c.teacher).replace(/,$/, ""), r, ...(pg ? { pg } : {}), ...(n ? { n } : {}) }, daty };
}

const semestr = (t) => { const m = t.getMonth() + 1; return { rokAkademicki: m >= 9 ? `${t.getFullYear()}/${t.getFullYear() + 1}` : `${t.getFullYear() - 1}/${t.getFullYear()}`, semestr: m >= 9 || m <= 2 ? "zimowy" : "letni" }; };

// Grupa aplikacji → rocznik z inwentarza (kierunek po skrócie, stopień, rok)
export function rocznikDla(grupa, kierunki) {
  const p = grupaWKFiZ(grupa);
  if (!p) return null;
  const k = kierunki.find((x) => x.skroty?.some((s) => s.toUpperCase() === p.skrot.toUpperCase()));
  const r = k?.roczniki?.find((x) => x.stopien === p.stopien && x.rok === p.rok && x.tryb === "st");
  return r ? { k, r, p } : null;
}

export function zbuduj(dane, kierunki, { teraz = new Date() } = {}) {
  const start = +semestr(teraz).rokAkademicki.slice(0, 4);
  const wg = new Map(), pominiete = [];
  for (const c of dane.classes || []) {
    if (c.studyMode && c.studyMode !== "stacjonarne") continue;
    (wg.get(c.group) || wg.set(c.group, []).get(c.group)).push(c);
  }
  const wyniki = [];
  for (const [grupa, lista] of wg) {
    const x = rocznikDla(grupa, kierunki);
    if (!x) { pominiete.push(`${grupa} (${lista.length} zajęć): nie ma rocznika w config/kierunki-us.json`); continue; }
    const { k, r, p } = x;
    const nazwa = p.skrot.toUpperCase() + p.rok;
    const groups = {};
    for (const c of lista) { const { wpis: e, daty } = wpis(c, start); dodaj(groups, nazwa, e, { daty }); }
    const wersja = "dane-" + crypto.createHash("sha256").update(JSON.stringify(lista.map(({ id, ...c }) => c))).digest("hex").slice(0, 12);
    wyniki.push({ id: r.id, kod: kodStrony(k.kod, r.stopien, r.tryb, r.nabor), kierunek: { pl: k.pl, en: k.en || k.pl }, stopien: r.stopien, tryb: r.tryb, rok: r.rok,
      groups, source: APLIKACJA, wersja, ...semestr(teraz), zajecAplikacji: lista.length, grupaAplikacji: grupa });
  }
  return { wyniki, pominiete };
}

// Kontrakt importera (scripts/us/importuj.mjs)
export async function importuj({ zrodla, kierunki, pobieracz, log = () => {} }) {
  const url = zrodla.find((z) => z.tryb === "st" && /get_schedule/.test(z.url))?.url || API;
  const t = await pobieracz.strona(url);
  if (!t) throw new Error("aplikacja WKFiZ nie odpowiada: " + url);
  const dane = JSON.parse(t);
  if (!dane.success) throw new Error("aplikacja WKFiZ: success=false " + (dane.message || ""));
  const { wyniki, pominiete } = zbuduj(dane, kierunki);
  for (const q of pominiete) log("WKFiZ: pominięta grupa " + q);
  return wyniki;
}
