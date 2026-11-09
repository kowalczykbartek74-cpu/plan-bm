// Etap 7 (cały US): studia niestacjonarne Wydziału Nauk Społecznych – PDF na ZJAZD (nsp.usz.edu.pl/studenci/plany-zajec-studia-
// niestacjonarne/, „BN-1-zjazd-3.pdf”, „1-zjazd-PPiW-1.pdf” …). Plan rocznika = suma wszystkich opublikowanych zjazdów.
//
// Dwa układy (obejrzane 9.11.2026 na wszystkich 38 plikach):
//  A) bezpieczeństwo (BN, BW, MIPiPR): tytuł „ZJAZD 1 09 - 11.10. 2026 r.”; pas dnia = komórka z nazwą dnia (PIĄTEK/SOBOTA/
//     NIEDZIELA) z lewej, w pasie wiersz „Godziny | BN I° 1 rok | BN I° 2 rok specj. WiBM | …”, pod nim wiersze godzin
//     („17.00 - 18.30”, „8.15 - 9.00”). Niedziela bywa na drugiej stronie.
//  B) pedagogika (Ped/PS, RESO, PPiW, PedSpec): nagłówek kolumn „ppiw 1”, „reso 1 II st”, „pedspec jm 3”, „ps 3”, wiersz „I zjazd”,
//     potem dla każdego dnia wiersz z datą w każdej kolumnie (data może się różnić między kolumnami); wiersze godzin co 45 min.
// Komórki z czarnych linii i tekst komórki – jak w planach stacjonarnych WNS (scripts/us/wns-pdf.mjs). Komórka przez kilka
// kolumn = zajęcia każdego z tych roczników. Data zajęć = data dnia w kolumnie. Wynik idzie do kolejki zatwierdzeń.
import { komorki, czesciKomorki, zajeciaZCzesci } from "./wns-pdf.mjs";
import { pdfNaTekst, jestPyMuPDF } from "./wpia-pdf.mjs";
import { semestrZKalendarza } from "./wh-xlsx.mjs";
import { dodaj } from "./wspolne.mjs";
import { kodStrony } from "../kierunki.mjs";
import { przezKolejke } from "./kolejka.mjs";

const DZIEN = [[/^pi[ąa]tek$/i, 4], [/^sobota$/i, 5], [/^niedziela$/i, 6]];
const dzien = (t) => DZIEN.find(([r]) => r.test(String(t).replace(/\s+/g, "")))?.[1] ?? null;
const DATA = /^(\d{1,2})\.(\d{1,2})\.(20\d\d)$/;
const iso = (m) => `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
const plus = (s, n) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dzTyg = (s) => (new Date(s + "T12:00:00Z").getUTCDay() + 6) % 7;
const GODZ = /^(\d{1,2})[.:](\d{2})-(\d{1,2})[.:](\d{2})$/;
const hhmm = (h, m) => `${String(+h).padStart(2, "0")}:${m}`;

// etykieta kolumny → rocznik: „BN I° 1 rok”, „BW II° 2 rok”, „ppiw4”, „reso 1 II st”, „pedspec jm 3”, „pespec jm 1”, „ps 3”, „Ped 2”
export function etykietaRocznika(t0) {
  const t = String(t0).replace(/\s+/g, " ").trim();
  let m = /^(BN|BW|MIPiPR)\s+(II|I)°\s*(\d)\s*rok\b/i.exec(t);
  if (m) return { skrot: m[1].toUpperCase() === "MIPIPR" ? "MIPiPR" : m[1].toUpperCase(), stopien: m[2].toUpperCase() === "II" ? 2 : 1, rok: +m[3] };
  m = /^(ppiw|pe?d?\s?spec(?:\s*jm)?|reso|ped|ps)\s*(\d)(?:\s+(II|I)\s*st\.?)?$/i.exec(t);
  if (!m) return null;
  const s = m[1].toLowerCase().replace(/\s/g, "");
  const skrot = s.startsWith("ppiw") ? "ppiw" : /spec/.test(s) ? "pedspec" : s;
  const stopien = skrot === "ppiw" || skrot === "pedspec" ? 0 : m[3]?.toUpperCase() === "II" ? 2 : 1;
  return { skrot, stopien, rok: +m[2] };
}
const pomin = (pl) => !pl || !/\p{L}{2}/u.test(pl) || /^(?:konsultacje|uwaga|licz\.? studentów)/i.test(pl) || /^\d+$/.test(pl);

// ---------- strony pliku → wpisy {rocznik, d, data, time, pl, k, p, r, n?} ----------
export function plikNst(tekst, { sem = semestrZKalendarza(), startRoku = 2026 } = {}) {
  const wpisy = [], ostrzezenia = [];
  let kolumny = [], tytulOd = null, pas = null;   // stan między stronami (ciąg dalszy dnia na kolejnej stronie)
  for (const strona of tekst.strony) {
    const kom = komorki(strona);
    const tyt = kom.map((k) => /ZJAZD\s*\d+\s*(\d{1,2})\s*-\s*\d{1,2}\s*\.(\d{1,2})\.\s*(20\d\d)/i.exec(k.tekst)).find(Boolean);
    if (tyt) tytulOd = `${tyt[3]}-${tyt[2].padStart(2, "0")}-${tyt[1].padStart(2, "0")}`;
    // kolumny roczników (nagłówek bywa powtórzony w każdym pasie dnia – bierzemy pierwszy na stronie)
    const nagl = kom.map((k) => ({ k, e: etykietaRocznika(k.tekst.replace(/\s*specj\..*$/i, "")) })).filter((x) => x.e);
    const nowe = [];
    for (const { k, e } of nagl.sort((a, b) => a.k.r[1] - b.k.r[1])) if (!nowe.some((c) => Math.abs(c.x0 - k.r[0]) < 3)) nowe.push({ x0: k.r[0], x1: k.r[2], ...e });
    if (nowe.length) kolumny = nowe.sort((a, b) => a.x0 - b.x0);
    if (!kolumny.length) { ostrzezenia.push(`s. ${strona.n}: brak nagłówków roczników`); continue; }
    const xMin = Math.min(...kolumny.map((c) => c.x0));
    // podgrupy w kolumnie: „gr. BW-NI.26-11” (BW II° 1 rok) → pg „gr:11”
    const podgr = kom.map((k) => ({ k, m: /^(?:gr\.?\s*)?[A-Za-z]+-[A-Za-z]+\.\d{2}-(\d{1,2})$/.exec(k.tekst.trim()) })).filter((x) => x.m)
      .map(({ k, m }) => ({ x0: k.r[0], x1: k.r[2], pg: "gr:" + m[1] }));
    if (podgr.length) for (const c of kolumny) { const g = podgr.filter((q) => q.x0 >= c.x0 - 2 && q.x1 <= c.x1 + 2); if (g.length > 1) c.podgr = g; }
    // etykiety godzin (z lewej od kolumn)
    const etyk = kom.filter((k) => k.r[2] <= xMin + 2).map((k) => ({ k, m: GODZ.exec(k.tekst.replace(/\s+/g, "").replace(/[–]/g, "-")) })).filter((x) => x.m)
      .map(({ k, m }) => ({ y0: k.r[1], y1: k.r[3], od: hhmm(m[1], m[2]), do: hhmm(m[3], m[4]) })).sort((a, b) => a.y0 - b.y0);
    // początki pasów dni: (A) komórka z nazwą dnia z lewej, (B) wiersz dat w kolumnach
    const starty = [];
    for (const k of kom) {
      const d = k.r[2] <= xMin + 2 ? dzien(k.tekst) : null;
      if (d != null) starty.push({ y: k.r[1], y1: k.r[3], d, typ: "A" });
    }
    const datyK = kom.filter((k) => k.r[0] >= xMin - 2 && DATA.test(k.tekst.trim()));
    const wiersze = [...new Set(datyK.map((k) => Math.round(k.r[1])))].sort((a, b) => a - b);
    for (const y of wiersze) {
      const w = datyK.filter((k) => Math.abs(k.r[1] - y) < 2);
      const daty = kolumny.map((c) => { const k = w.find((q) => q.r[0] < c.x1 - 2 && q.r[2] > c.x0 + 2); return k ? iso(DATA.exec(k.tekst.trim())) : null; });
      const d0 = daty.find(Boolean);
      starty.push({ y, y1: Math.max(...w.map((k) => k.r[3])), d: dzTyg(d0), daty, typ: "B" });
    }
    // (A) nazwa dnia obejmująca wiersz dat (B) – zostaje (B), z datami
    for (let i = starty.length - 1; i >= 0; i--) { const a = starty[i]; if (a.typ === "A" && starty.some((b) => b.typ === "B" && b.y >= a.y - 3 && b.y <= a.y1 + 3)) starty.splice(i, 1); }
    starty.sort((a, b) => a.y - b.y);
    // (A) i (B) naraz – układ B ma też komórkę „PIĄTEK” w wierszu dat: zostaje wpis z datami
    const pasy = [];
    for (const s of starty) { const p = pasy.find((q) => Math.abs(q.y - s.y) < 3); if (p) { if (s.typ === "B") Object.assign(p, { daty: s.daty, typ: "B", y1: Math.max(p.y1, s.y1) }); } else pasy.push({ ...s }); }
    for (const p of pasy) {
      if (!p.daty) {
        if (!tytulOd) { ostrzezenia.push(`s. ${strona.n}: dzień ${p.d} bez daty (brak tytułu „ZJAZD …”)`); continue; }
        const data = plus(tytulOd, p.d - dzTyg(tytulOd));
        p.daty = kolumny.map(() => data);
      }
    }
    pasy.forEach((p, i) => { p.koniec = p.typ === "A" ? p.y1 : (pasy[i + 1]?.y ?? strona.h); p.start = p.y; });
    // ciąg dalszy pasa z poprzedniej strony (strona bez nagłówka dnia na górze)
    const gora = pasy.length ? pasy[0].start : strona.h;
    if (pas && etyk.some((e) => e.y0 < gora - 2)) pasy.unshift({ ...pas, start: 0, koniec: gora });
    for (const k of kom) {
      if (k.r[0] < xMin - 2 || etykietaRocznika(k.tekst.replace(/\s*specj\..*$/i, "")) || DATA.test(k.tekst.trim()) || /^(?:[IVX]+\s+zjazd|godziny|\d+(?:\s+\d+)*|licz\.?\s*studentów.*|\d\s*(?:gr\.?\s*)?ćw|(?:gr\.?\s*)?[A-Za-z]+-[A-Za-z]+\.\d{2}-\d{1,2})$/i.test(k.tekst.trim())) continue;
      const yc = (k.r[1] + k.r[3]) / 2;
      const p = pasy.find((q) => yc > q.start && yc < q.koniec);
      if (!p || !p.daty) continue;
      const kol = kolumny.map((c, i) => ({ c, i })).filter(({ c }) => Math.min(c.x1, k.r[2]) - Math.max(c.x0, k.r[0]) > (c.x1 - c.x0) * 0.5);
      if (!kol.length) continue;
      const wiersz = etyk.filter((e) => Math.min(e.y1, k.r[3]) - Math.max(e.y0, k.r[1]) > (e.y1 - e.y0) * 0.5);
      const czas = wiersz.length ? [wiersz[0].od, wiersz[wiersz.length - 1].do] : null;
      // „kod zespołu: xxx” w osobnej linii należy do zajęć nad nią (inaczej wygląda jak nowy tytuł)
      const linie = [];
      for (const l of k.linie) { if (/^kod\s+zespo/i.test(l.t) && linie.length) linie[linie.length - 1] = { ...linie[linie.length - 1], t: `${linie[linie.length - 1].t} ${l.t}` }; else linie.push({ ...l }); }
      for (const c of czesciKomorki(linie)) {
        const z = zajeciaZCzesci(c, p.d, { sem, startRoku });
        if (pomin(z.pl)) continue;
        if (!z.time) z.time = czas;
        if (!z.time) { ostrzezenia.push(`s. ${strona.n}: brak godzin – ${z.pl}`); continue; }
        const { pgTekst, daty: _d, ...e } = z;
        // kod zespołu MS Teams / e-zajęcia → notka i sala „online”
        const tekst = c.map((l) => l.t).join(" ");
        const teams = /kod\s+(?:zespo[łl][uay]?\s*)?(?:MS\s*Teams)?\s*:?\s*([a-z0-9]{6,8})\b/i.exec(tekst)?.[1];
        if (teams) { e.n = [e.n, `kod MS Teams: ${teams}`].filter(Boolean).join("; "); if (!e.r || /^online$/.test(e.r)) e.r = "online (MS Teams)"; }
        if (/e-zaj[ęe]cia/i.test(tekst) && !e.r) e.r = "online (MS Teams)";
        e.p = (e.p || "").replace(/\s*kod\s+zespo\S*\s*(?:MS\s*Teams)?\s*:?\s*[a-z0-9]{6,8}\b/gi, "").trim();
        e.pl = e.pl.replace(/\s*kod\s+zespo[łl][ua]?.*$/i, "").replace(/\s*e-zaj[ęe]cia\s*$/i, "").trim();
        if (/\s+ks\.?$/.test(e.pl)) { e.pl = e.pl.replace(/\s+ks\.?$/, ""); if (e.p && !/^ks\./.test(e.p)) e.p = "ks. " + e.p; }   // „Filozofia edukacji ks dr A. …”
        { const w = /^Przedmiot do wyboru:?\s+(.+)$/i.exec(e.pl); if (w) e.pl = `${w[1]} (przedmiot do wyboru)`; }
        if (/^Jezyk\b/.test(e.pl)) { e.pl = e.pl.replace(/^Jezyk/, "Język"); if (e.k === "X") e.k = "CW"; }
        if (/^(?:spotkanie|\d{1,2}[.:]\d{2}\s*-\s*\d{1,2}[.:]\d{2}\s*-\s*spotkanie)/i.test(e.pl)) { e.n = [tekst.slice(0, 200), e.n].filter(Boolean).join("; "); e.pl = "Spotkanie organizacyjne"; e.k = "X"; }
        for (const { c: col, i } of kol) {
          const data = p.daty[i];
          if (!data) continue;
          if (dzTyg(data) !== p.d) ostrzezenia.push(`s. ${strona.n}: ${data} w pasie dnia ${p.d}`);
          // komórka w jednej podkolumnie grupy → ta grupa
          const pgK = col.podgr ? col.podgr.filter((g) => Math.min(g.x1, k.r[2]) - Math.max(g.x0, k.r[0]) > (g.x1 - g.x0) * 0.5) : [];
          const pg = pgK.length === 1 ? pgK[0].pg : pgTekst;
          wpisy.push({ rocznik: { skrot: col.skrot, stopien: col.stopien, rok: col.rok }, d: dzTyg(data), ...e, ...(pg ? { pg } : {}), daty: [data], tekst });
        }
      }
    }
    pas = pasy.length ? pasy[pasy.length - 1] : pas;
  }
  return { wpisy, ostrzezenia };
}

export const rocznikiPlikuNst = (wpisy) => [...new Map(wpisy.map((w) => [kluczRocznika(w.rocznik), w.rocznik])).values()];
export const kluczRocznika = (r) => `${r.skrot}|${r.stopien}|${r.rok}`;
export function zlozNst(wpisy) {
  const m = new Map();
  for (const { daty, tekst, rocznik, ...e } of wpisy) {
    const k = JSON.stringify([kluczRocznika(rocznik), e.pg || "", e.d, e.time, e.pl, e.k, e.p, e.r, e.n || ""]);
    const x = m.get(k); if (x) { for (const d of daty) if (!x.daty.includes(d)) x.daty.push(d); } else m.set(k, { rocznik, e, daty: [...daty] });
  }
  const out = {};
  for (const { rocznik, e, daty } of m.values()) (out[kluczRocznika(rocznik)] ||= []).push({ e, daty: daty.sort() });
  return out;
}

// ---------- importer (wołany z wns-pdf.mjs → importuj) ----------
export async function importujNst({ wydzial, zrodla, kierunki, pobieracz, log = () => {}, naSucho = false }) {
  if (!jestPyMuPDF()) return [];
  const sem = semestrZKalendarza();
  const startRoku = +sem.od.slice(0, 4) - (+sem.od.slice(5, 7) < 9 ? 1 : 0);
  const etyk = wydzial.nstEtykiety || {};
  const wpisy = [], pliki = [];
  for (const z of zrodla.filter((x) => x.typ === "plan" && x.format === "pdf" && x.tryb === "nst")) {
    const f = await pobieracz.plik(z.url);
    if (!f || f.brak) { log(`WNS nst: brak pliku ${z.url}`); continue; }
    try { const r = plikNst(pdfNaTekst(f.buf), { sem, startRoku }); wpisy.push(...r.wpisy); for (const q of r.ostrzezenia) log(`WNS nst ${z.plik}: ${q}`); pliki.push({ z, sha: f.sha256 }); }
    catch (e) { log(`WNS nst ${z.plik}: ${e.message}`); }
  }
  const plany = zlozNst(wpisy), wyniki = [];
  for (const k of kierunki) for (const rr of (k.roczniki || []).filter((x) => x.tryb === "nst")) {
    const skrot = Object.entries(etyk).find(([s, n]) => !s.startsWith("_") && n === k.pl)?.[0];
    const lista = skrot && plany[`${skrot}|${rr.stopien}|${rr.rok}`];
    if (!lista?.length) { wyniki.push({ id: rr.id, kierunek: { pl: k.pl }, blad: `brak zajęć w planach zjazdów (${skrot || "brak etykiety w config nstEtykiety"} ${rr.stopien} st. ${rr.rok} rok)` }); continue; }
    const groups = {}, g = `${k.kod}${rr.rok}`;
    for (const { e, daty } of lista) dodaj(groups, g, e, { daty });
    const zjazdy = [...new Set(lista.flatMap((x) => x.daty))].length;
    const r = { id: rr.id, kod: kodStrony(k.kod, rr.stopien, rr.tryb, rr.nabor), kierunek: { pl: k.pl, en: k.en || k.pl }, stopien: rr.stopien, tryb: rr.tryb, rok: rr.rok,
      groups, source: "https://nsp.usz.edu.pl/studenci/plany-zajec-studia-niestacjonarne/", wersja: `${pliki.length} plików zjazdów (${zjazdy} dni)`, sha256: pliki.map((p) => p.sha.slice(0, 8)).join(""),
      rokAkademicki: `${startRoku}/${startRoku + 1}`, semestr: "zimowy" };
    const q = await przezKolejke(r, { wydzial: "WNS", naSucho, log });
    const kolejka = { pozycji: q.pozycji, doDecyzji: q.doDecyzji, wyslany: q.wyslany, blad: q.blad };
    if (q.status === "zatwierdzony") wyniki.push({ ...r, groups: q.groups });
    else if (q.poprzedni) wyniki.push({ ...r, groups: q.poprzedni, wersja: `${r.wersja} (na stronie wcześniejsza zatwierdzona wersja)`, sha256: undefined, kolejka });
    else wyniki.push({ ...r, zatwierdzenie: true, kolejka });
  }
  return wyniki;
}
