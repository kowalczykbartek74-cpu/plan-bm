// Etap 3 planu całego US: importer Wydziału Kultury Fizycznej i Zdrowia (aplikacja planyzajec-kfz.usz.edu.pl).
// Dane: jedno zapytanie GET api/get_schedule.php → { classes: [{ subject, type, teacher, day, startTime, endTime, room, group, studyMode }] }.
// Grupa aplikacji = rocznik („WF 1 rok I stopień”) → plan/<id rocznika z config/kierunki-us.json>.json, jedna grupa „WF1”.
// W nazwie przedmiotu aplikacja trzyma resztę informacji, np.:
//   „8:00-9:30; teoria i metodyka lekkiej atletyki 30h, 1ćs (8.10-25.01.27)”
//    └ prawdziwa godzina  └ przedmiot                 └ godz. └ podgrupa  └ terminy (zakres co tydzień albo lista dat)
// Podgrupy mają osobną numerację dla każdego rodzaju zajęć (ćs = ćw. specjalistyczne, lb = laboratoria, ć = ćwiczenia,
// k = konwersatoria, zt = zajęcia terenowe, [Ngr] = seminarium N) → pole „pg” (np. "ćs1", "lb3"); strona ma wybór podgrup.
// Bez numeru („w”, „ć”) = cały rok. Terminy → „dates” (YYYY-MM-DD); gdy terminów nie da się odczytać, zostają jako notka „n”.
// Studia niestacjonarne (Etap 7): api/get_html_plans.php?group=… → { plan: { file_content } } = tabela HTML na grupę:
// kolumny = dni zjazdów („10.10.2026<br>Sob”), wiersze = bloki („1.<br>8:15-9:45”), komórka = „przedmiot 10h ćs 1gr<br>prowadzący<br>sala”.
// Ta sama komórka w kolejnych blokach = jedne zajęcia (godziny od–do). Zajęcia zawsze z „dates” (konkretne dni zjazdów).
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
  // niestacjonarne: plan HTML na grupę (Etap 7); błąd nst nie blokuje stacjonarnych
  try { wyniki.push(...await importujNst({ zrodla, kierunki, pobieracz, log })); } catch (e) { log("WKFiZ nst: " + e.message); }
  return wyniki;
}

// ---------- studia niestacjonarne (Etap 7) ----------
const encjeH = (t) => String(t).replace(/&nbsp;?/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const hh = (h, m) => `${String(+h).padStart(2, "0")}:${m}`;
const SL = (x) => new RegExp(`(?<![\\p{L}])(?:${x})(?![\\p{L}])`, "iu");   // całe słowo (też „ćs”, „ć”)
const RODZ_NST = [[SL("ćwiczenia specjalistyczne|ćs"), "CW", "ćs"], [SL("laboratori(?:a|um)|lb"), "LAB", "lb"], [SL("konwersatori(?:a|um)|k"), "K", "k"],
  [SL("zajęcia terenowe|zt"), "X", "zt"], [SL("seminarium"), "S", "sem"], [SL("ćwiczenia|ć"), "CW", "ć"], [SL("wykład|w"), "W", null], [SL("lektorat"), "CW", null]];
// pierwsza linia komórki → { pl, k, pg?, time? }
export function komorkaNst(linia) {
  let t = encjeH(linia).replace(/\s+/g, " ").trim(), time = null;
  const g = /(\d{1,2})\s*[:.]\s*(\d{2})\s*[-–]\s*(\d{1,2})\s*[:.]\s*(\d{2})/.exec(t);
  if (g) { time = [hh(g[1], g[2]), hh(g[3], g[4])]; t = (t.slice(0, g.index) + " " + t.slice(g.index + g[0].length)).trim(); }
  let nr = null;
  const gr = /(?<![\p{L}\d])(\d{1,2})\s*gr\b|\bgr\.?\s*(\d{1,2})\b/iu.exec(t);
  if (gr) { nr = gr[1] || gr[2]; t = (t.slice(0, gr.index) + " " + t.slice(gr.index + gr[0].length)).trim(); }
  t = t.replace(/(?<![\p{L}\d])\d+\s*h\b/gu, " ").replace(/\s+/g, " ").trim();
  let k = "X", pre = null;
  for (const [re, kk, p] of RODZ_NST) {
    const m = re.exec(t);
    if (!m) continue;
    k = kk; pre = p;
    // słowo rodzaju na końcu albo skrót – usuwamy z nazwy; „seminarium magisterskie”, „język angielski lektorat” zostają w nazwie (bez „lektorat”)
    // słowo rodzaju w środku/na końcu usuwamy z nazwy; na początku zostaje („wykład ogólnouczelniany”), „seminarium magisterskie” też
    if (kk !== "S" && m.index > 0) t = (t.slice(0, m.index) + " " + t.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim();
    break;
  }
  let pl = t.replace(/[,;:\s]+$/, "").trim(), n = null;
  const wou = /^(wykład ogólnouczelniany)\s+(.+)$/i.exec(pl);
  if (wou) { pl = "Wykład ogólnouczelniany"; n = wou[2]; }
  return { pl, k, ...(n ? { n } : {}), ...(nr && pre ? { pg: pre + nr } : nr ? { pg: "gr" + nr } : {}), ...(time ? { time } : {}) };
}

// tabela HTML planu zjazdów → [{ wpis, daty }] (jedne zajęcia w wielu zjazdach = jeden wpis z listą dat)
export function zHtmlNst(html) {
  const wiersze = [...String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]));
  if (wiersze.length < 2) throw new Error("plan niestacjonarny bez tabeli");
  const linie = (c) => encjeH(c).split(/<br\s*\/?>/i).map((x) => x.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  const daty = wiersze[0].map((c) => { const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(linie(c).join(" ")); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; });
  const bloki = wiersze.slice(1).map((w) => { const m = /(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})/.exec(linie(w[0]).join(" ")); return m ? [hh(m[1], m[2]), hh(m[3], m[4])] : null; });
  const zajecia = [];
  for (let c = 1; c < daty.length; c++) {
    if (!daty[c]) continue;
    let prev = null;
    for (let r = 1; r < wiersze.length; r++) {
      const raw = wiersze[r][c] ?? "", l = linie(raw), blok = bloki[r - 1];
      while (l.length && !l[l.length - 1]) l.pop();
      const klucz = l.join(" | ");
      if (!l.length || !l[0] || !blok) { prev = null; continue; }
      if (prev && prev.klucz === klucz && !prev.wlasnaGodz) { for (const z of prev.czesci) z.do = blok[1]; continue; }
      // komórka z kilkoma zajęciami (dwie podgrupy naraz): nowa część od linii z liczbą godzin („… 10h ćs 2gr”)
      const starty = l.map((x, i) => (i === 0 || /(?<![\p{L}\d])\d+\s*h\b/u.test(x) ? i : -1)).filter((i) => i >= 0);
      const czesci = starty.map((a, n) => {
        const cz = l.slice(a, starty[n + 1] ?? l.length), k = komorkaNst(cz[0]);
        const sala = cz.slice(2).filter(Boolean).join(", ").replace(/^sala\s+/i, "s. ").trim();
        return { data: daty[c], od: k.time ? k.time[0] : blok[0], do: k.time ? k.time[1] : blok[1], pl: k.pl, k: k.k, pg: k.pg, n: k.n, p: prowadzacyZ(cz[1] || "").replace(/,$/, ""), r: sala, wlasna: !!k.time };
      });
      prev = { klucz, czesci, wlasnaGodz: czesci.some((z) => z.wlasna) };
      zajecia.push(...czesci);
    }
  }
  const wg = new Map();
  for (const z of zajecia) {
    const d = dzienTyg(z.data);
    const e = { d, time: [z.od, z.do], pl: z.pl, k: z.k, p: z.p, r: z.r, ...(z.pg ? { pg: z.pg } : {}), ...(z.n ? { n: z.n } : {}) };
    const key = JSON.stringify(e);
    (wg.get(key) || wg.set(key, { wpis: e, daty: [] }).get(key)).daty.push(z.data);
  }
  return [...wg.values()].map((x) => ({ ...x, daty: [...new Set(x.daty)].sort() }));
}

export async function importujNst({ zrodla, kierunki, pobieracz, log = () => {}, teraz = new Date() }) {
  const wyniki = [];
  for (const z of zrodla.filter((x) => x.tryb === "nst" && /get_html_plans/.test(x.url))) {
    const kz = z.kierunki[0];
    const k = kierunki.find((x) => x.kod === kz?.kod);
    const r = k?.roczniki?.find((x) => x.tryb === "nst" && x.stopien === kz.stopien && x.rok === kz.lata?.[0]);
    if (!r) { wyniki.push({ id: `wkfiz-nst-${z.grupa}`, kierunek: { pl: z.grupa }, blad: `brak rocznika niestacjonarnego w config/kierunki-us.json (${z.grupa})` }); continue; }
    const t = await pobieracz.strona(z.url);
    const j = t ? JSON.parse(t) : null;
    if (!j?.success || !j.plan?.file_content) { wyniki.push({ id: r.id, kierunek: { pl: k.pl }, blad: `aplikacja WKFiZ: brak planu ${z.grupa}` }); continue; }
    const nazwa = kz.skrot.toUpperCase() + r.rok;
    const groups = {};
    const lista = zHtmlNst(j.plan.file_content);
    for (const { wpis: e, daty } of lista) dodaj(groups, nazwa, e, { daty });
    log(`WKFiZ nst ${z.grupa}: ${lista.length} zajęć`);
    wyniki.push({ id: r.id, kod: kodStrony(k.kod, r.stopien, r.tryb, r.nabor), kierunek: { pl: k.pl, en: k.en || k.pl }, stopien: r.stopien, tryb: r.tryb, rok: r.rok,
      groups, source: APLIKACJA, wersja: `${j.plan.file_name || "plan"} ${j.plan.last_modified || ""}`.trim(), ...semestr(teraz), grupaAplikacji: z.grupa });
  }
  return wyniki;
}
