// Porządki nazw zajęć w planach US (po parserze, przed zapisem i przed wysłaniem szkicu do kolejki) – 9.11.2026, przegląd
// wszystkich planów: w nazwie zostawały godziny („[30h]”, „(9h)”), adresy stron („https://swfis…”), dopiski („Szczegółowy rozkład…”,
// „I lub II połowa semestru…”), godziny i daty z przodu („22.10. godz. 12:00 szkolenie…”), gwiazdki, WIELKIE LITERY.
// Zasada: nic nie ginie – usunięty dopisek trafia do notki „n”. Wpis bez nazwy przedmiotu (sam prowadzący / sala – kawałek komórki)
// znika tylko wtedy, gdy w tej grupie w tym samym czasie są inne zajęcia (to ich resztka); inaczej zostaje bez zmian.
import fs from "node:fs";
// zakres dat roku akademickiego z kalendarz.json (pierwszy dzień zajęć − 2 dni … ostatni + 14 dni)
let ZAKRES = null;
function zakresRoku(plik = "kalendarz.json") {
  if (ZAKRES) return ZAKRES;
  try {
    const t = JSON.parse(fs.readFileSync(plik, "utf8")).tygodnie.map((w) => w[0]).concat(JSON.parse(fs.readFileSync(plik, "utf8")).tygodnie.map((w) => w[1])).sort();
    const przes = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    ZAKRES = [przes(t[0], -2), przes(t[t.length - 1], 14)];
  } catch { ZAKRES = ["0000-01-01", "9999-12-31"]; }
  return ZAKRES;
}
const OSOBA = /^(?:(?:prof|dr|mgr|doc|adw)\.?\b|[A-ZŁŚŻŹĆ][\p{Ll}-]+,\s*prof\.?\s*US)/u;
const resztka = (pl) => /^(?:godz\.|x\s|\d+[a-z]?\),)/i.test(pl) && /w terminach/i.test(pl);
const tylkoOsobaLubSala = (pl) => resztka(pl) || OSOBA.test(pl) && !/\p{Ll}{4,}\s+\p{Ll}{4,}/u.test(pl.replace(OSOBA, "").replace(/\b[A-ZŁŚŻŹĆ][\p{Ll}-]+/gu, "")) || /^s\.\s*\d+[a-z]?(?:\s+s\.\s*\d+[a-z]?)*$/i.test(pl);
const zdanie = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const dopisz = (e, t) => { const x = String(t || "").replace(/\s+/g, " ").replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, ""); if (x && !(e.n || "").includes(x)) e.n = [e.n, x].filter(Boolean).join("; "); };

export function porzadkujWpis(e0) {
  const e = { ...e0 };
  let pl = String(e.pl || "");
  if (!pl.trim()) return e;
  const stary = pl;
  // adresy stron i dopiski z nimi → notka
  pl = pl.replace(/\s*\((?:wykaz|the list)[^()]*?(https?:\/\/[^\s)]+)\)?/i, (x, u) => { dopisz(e, `wykaz: ${u.replace(/[).,]+$/, "")}`); return " "; }).trim();
  pl = pl.replace(/\s*\(?(?:wykaz|the list)[^()]*?(https?:\/\/\S+?)\)?\s*$/i, (x, u) => { dopisz(e, `wykaz: ${u.replace(/[).,]+$/, "")}`); return ""; });
  pl = pl.replace(/\s*(?:Szczeg[oó][lł]owy rozk[lł]ad[^]*?|(?:Akademickie Centrum|Studium) Wychowania Fizycznego i Sportu)?\s*(https?:\/\/\S+)\s*$/i, (x, u) => { dopisz(e, `szczegóły: ${u.replace(/[).,]+$/, "")}`); return ""; });
  // „I lub II połowa semestru (w zależności od wybranego przedmiotu)”, „e-classes”, „kod do zajęć zgodnie z wybranym wykładem”
  pl = pl.replace(/\s*(?:I lub II połowa semestru|first or second half of the semester)[^]*$/i, (x) => { dopisz(e, x); return ""; })
    .replace(/\s+(?:kod do zajęć zgodnie z wybranym wykładem|e-classes)\s*$/i, (x) => { dopisz(e, x); return ""; });
  // WF: „WYCHOWANIE FIZYCZNE …”, „Wychowanie fizyczne [30h] …”, „wychowanie fizyczne Uwaga wyjątkowo … szkolenie …”
  if (/^wychowanie fizyczne\b/i.test(pl)) { const reszta = pl.replace(/^wychowanie fizyczne\b/i, "").replace(/\[[^\]]*\]/g, " ").trim(); if (reszta) dopisz(e, reszta); pl = "Wychowanie fizyczne"; if (e.k === "X") e.k = "CW"; }
  // szkolenie z obrony cywilnej z datą i miejscem w nazwie
  if (pl !== "Wychowanie fizyczne" && /szkolenie z obrony cywilnej/i.test(pl)) { if (pl.replace(/szkolenie z obrony cywilnej/i, "").trim()) dopisz(e, pl); pl = "Szkolenie z obrony cywilnej"; }
  // egzamin w nazwie: „ekonomia godz. 9.00-egzamin”, „rachunkowość finansowa-egzamin godz. 8.00”
  const egz = /^(.*?)\s*(?:godz\.?\s*\d{1,2}[.:]\d{2}\s*)?[-–]\s*egzamin(?:\s*godz\.?\s*\d{1,2}[.:]\d{2})?\s*$/i.exec(pl);
  if (egz && egz[1].trim()) { dopisz(e, pl); pl = `${egz[1].replace(/\s*godz\.?\s*\d{1,2}[.:]\d{2}\s*$/i, "").trim()} – egzamin`; }
  // godzina / data z przodu: „11:45 Metody…”, „9:00-12:00 Water chemistry Water chemistry”, „22.10. 12:00 Język niemiecki”
  pl = pl.replace(/^(?:\d{1,2}\.\d{1,2}\.?\s*)?(?:godz\.?\s*)?\d{1,2}[.:]\d{2}(?:\s*[-–]\s*\d{1,2}[.:]\d{2})?\s+(?=\p{L})/u, (x) => { dopisz(e, x); return ""; });
  // data z przodu: „2.12 do 9.00 …”, „, 7.10-27.01 i 29.01 (pt) Epigenetyka”
  pl = pl.replace(/^[\s,]*\d{1,2}\.\d{1,2}\.?(?:\s*[-–]\s*\d{1,2}\.\d{1,2}\.?)?(?:\s*i\s*\d{1,2}\.\d{1,2}\.?)?(?:\s*\(\p{L}{2,3}\))?(?:\s+(?:do|od)\s+\d{1,2}[.:]\d{2})?\s+(?=\p{L})/u, (x) => { dopisz(e, x); return ""; })
    .replace(/\s*more info:?\s*$/i, "")
    .replace(/^(?:do|od)\s+(?:godz\.?\s*)?\d{1,2}[.:]\d{2}\s+(?=\p{L})/iu, (x) => { dopisz(e, x); return ""; });
  // data po rzymsku / z kropkami z przodu: „26 XI do godz.9.00 …”, „26.XI …”, „19.01.do 10.45 17.11- …”, „28.01.- -16.45 . …”, „2. praktyczna …”
  for (let i = 0; i < 3; i++) pl = pl.replace(/^[\s,]*\d{1,2}\s*[. ]\s*(?:\d{1,2}|XII|XI|IX|X|VIII|VII|VI|IV|V|III|II|I)\b\.?(?:\s*[-–.]\s*)*(?:do\s+(?:godz\.?\s*)?\d{1,2}[.:]\d{2}|[-–]?\s*\d{1,2}[.:]\d{2})?(?:\s*[-–.]\s*)*\s+(?=\p{L}|\d)/u, (x) => { dopisz(e, x); return ""; });
  pl = pl.replace(/^\d\.\s+(?=\p{Ll})/u, "");
  pl = pl.replace(/^(?:do|od)\s+(?:godz\.?\s*)?\d{1,2}[.:]\d{2}\s+(?=\p{L})/iu, (x) => { dopisz(e, x); return ""; })
    .replace(/\s+\d{1,2}[.:]\d{2}\s*[-–]\s*\d{1,2}[.:]\d{2}\s*$/, (x) => { dopisz(e, x); return ""; });
  // grupa z przodu: „1 gr lab: X”, „2 gr ćw: X”
  const gr = /^(\d{1,2})\s*gr\.?\s*(lab|ć|ćw|cw)\.?\s*:\s*(.+)$/i.exec(pl);
  if (gr) { pl = gr[3]; if (!e.pg) e.pg = `${/^l/i.test(gr[2]) ? "lab" : "ćw"}:${gr[1]}`; }
  // godziny w nazwie: „[30h]”, „[lektorat 30h]”, „(9h)”, „Laboratoria 30 h”, ucięte „[lab/45”, „w/15h]”
  pl = pl.replace(/\s*\[(?:[^\]]*?)\d+\s*h\]\s*/gi, " ").replace(/\s*\(\s*\d+\s*h\s*\)/gi, "").replace(/\s+(?:Laboratoria|Wykład|Ćwiczenia)\s+\d+\s*h\b/gi, "")
    .replace(/\s*\[\s*(?:lab|w|ć|ćw)\s*\/\s*\d+\s*$/i, "").replace(/\s+(?:lab|w|ć|ćw)\s*\/\s*\d+\s*h\s*\]\s*$/i, "")
    .replace(/\s*\[?\s*(?:\d+\s*h\s*\/\s*\p{L}+\.?|\p{L}+\s*\/\s*\d+\s*h)\s*\]/gu, "")
    .replace(/\s*\*+\s*$/, "").replace(/^[-–]\s+/, "");
  // ta sama fraza dwa razy: „Water chemistry Water chemistry”, „s. 207 s. 207”
  { const m = /^(.{4,}?)\s+\1$/.exec(pl.trim()); if (m) pl = m[1]; }
  if (/^physical education\b/i.test(pl)) { pl = "Physical Education"; if (e.k === "X") e.k = "CW"; }
  if (/^ONLINE OGÓLNOUCZELNIANY$/.test(pl)) { pl = "Wykład ogólnouczelniany"; dopisz(e, "online"); }
  // rodzaj z początku nazwy, gdy parser go nie znał
  if (e.k === "X") e.k = /^(?:wykład|lecture|university-wide lecture)\b/i.test(pl) ? "W" : /^(?:seminarium|seminar|diploma seminar)\b/i.test(pl) ? "S"
    : /^(?:konwersatorium)\b/i.test(pl) ? "K" : /^(?:laboratorium|pracownia)\b/i.test(pl) ? "LAB"
    : /^(?:ćwiczenia|lektorat|język\s|j\.\s|praktyczna nauka języka|english language|spanish language|german language)/i.test(pl) ? "CW" : "X";
  // WIELKIE LITERY → zdanie („DNI ADAPTACYJNE”); skróty (PNJA, ZSJ, MODUŁ:) zostają, gdy nazwa jest krótka
  if (pl.length >= 12 && pl === pl.toUpperCase() && /\p{Lu}{4,}/u.test(pl)) pl = zdanie(pl);
  pl = pl.replace(/\s{2,}/g, " ").replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "").trim();
  // pierwsza litera wielka (pliki wydziałów piszą raz tak, raz tak)
  if (/^\p{Ll}/u.test(pl) && !tylkoOsobaLubSala(pl)) pl = pl.charAt(0).toUpperCase() + pl.slice(1);
  e.pl = pl || stary;
  // zajęcia zdalne bez sali: „e-learning”, „kod do teams”, „online”, „– e-zajęć”
  e.pl = e.pl.replace(/\s*[–-]\s*(?:e-\s*zaj\p{L}*|hasło do e-learn\p{L}*:?\s*\S*|e-\s*\(\s*[\d.]+\s*\))\s*$/iu, (x) => { dopisz(e, x); return ""; }).trim() || e.pl;
  if (!e.r && /e-learn|teams|online|e-zaj|zdaln/i.test(`${e.pl} ${e.n || ""}`)) e.r = "online";
  // daty spoza roku akademickiego (literówka w pliku: „od 6.09.” zamiast 6.10) – wypadają; gdy wypadłyby wszystkie, zostają
  if (e.dates?.length) {
    const [od, doo] = zakresRoku(), w = e.dates.filter((x) => x >= od && x <= doo);
    if (w.length && w.length < e.dates.length) { dopisz(e, `pominięte terminy spoza roku akademickiego: ${e.dates.filter((x) => !w.includes(x)).join(", ")}`); e.dates = w; }
  }
  if (e.p) e.p = e.p.replace(/\s*kod\s+zespo\S*\s*:?\s*(?:[a-z0-9]{6,8}\b)?/gi, "").replace(/[\s,]+$/, "").trim();
  return e;
}

// groups → groups po porządkach; resztki komórek (sam prowadzący / sala) przy innych zajęciach w tym samym czasie – usunięte
export function porzadkujGroups(groups) {
  const out = {};
  for (const [g, w] of Object.entries(groups || {})) {
    out[g] = {};
    for (const l of ["odd", "even"]) {
      const lista = (w[l] || []).map(porzadkujWpis);
      const nachodzi = (a, b) => a !== b && a.d === b.d && a.time && b.time && a.time[0] < b.time[1] && b.time[0] < a.time[1] && (!a.dates || !b.dates || a.dates.some((x) => b.dates.includes(x)));
      let l2 = lista.filter((e) => !(tylkoOsobaLubSala(e.pl) && lista.some((x) => nachodzi(e, x) && !tylkoOsobaLubSala(x.pl))));
      // sama sala („s. 207”) w komórce pod zajęciami bez sali (koniec zajęć ≤ 2 h przed nią, nic pomiędzy) → sala tych zajęć (plany WNŚiP)
      const min = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
      l2 = l2.filter((e) => {
        if (!/^s\.\s*\d+[a-z]?$/i.test(e.pl) || !e.time) return true;
        const cel = l2.filter((x) => x !== e && x.d === e.d && x.time && !x.r && !tylkoOsobaLubSala(x.pl) && min(e.time[0]) - min(x.time[1]) >= 0 && min(e.time[0]) - min(x.time[1]) <= 120
          && !l2.some((y) => y !== e && y !== x && y.d === e.d && y.time && min(y.time[0]) >= min(x.time[1]) && min(y.time[1]) <= min(e.time[0])));   // nic pomiędzy
        if (!cel.length) return true;
        for (const x of cel) x.r = e.pl.replace(/^s\.\s*/i, "s. ");
        return false;
      });
      out[g][l] = l2;
    }
  }
  return out;
}
