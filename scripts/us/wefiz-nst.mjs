// Etap 7: WEFiZ – studia niestacjonarne z systemu „planynst” (efz.usz.edu.pl/studenci/planynst-lista-wykladowcow/).
// System nie ma planu na grupę, tylko plan każdego wykładowcy:
//   /wp-content/include-me/plany_mick/pracow_zajecia_xml.php?nazw=dr Michał&nazw1=Kuczyński → tabela
//   Data | Godzina | Nazwa przedmiotu | Grupa | Nr sali
//   2026/10/10 | 14.35-17.05 | matematyka (8h)(w ) | A20: Finanse i Rachunkowość, stopień 1, rok 1<br>A21: … | s.N020 Mic.64
// Plan grupy = złożenie planów wszystkich wykładowców (jedne zajęcia u dwóch prowadzących = jeden wpis). Grupa „A20” = grupa
// ćwiczeniowa (klucz w planie); „(lab gr. A)” → pg „lab:A”, „gr.1” → „gr:1”, „(sp. FPiP)” → „spec:FPiP”. Zajęcia zawsze z „dates”.
// Rocznik = kierunek (nazwa z config/kierunki-us.json), stopień, rok, tryb nst (inwentarz: PDF-y „Wykaz grup … NZ”).
import crypto from "node:crypto";
import { dodaj, porzadkuj } from "./wspolne.mjs";
import { kodStrony } from "../kierunki.mjs";

export const LISTA = "https://efz.usz.edu.pl/studenci/planynst-lista-wykladowcow/";
const BAZA = "https://efz.usz.edu.pl";
const norm = (s) => String(s || "").toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
const encje = (t) => String(t).replace(/&nbsp;?/g, " ").replace(/&amp;|&#038;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const tekst = (h) => encje(String(h).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).split("\n").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
const dzienTyg = (s) => (new Date(s + "T12:00:00Z").getUTCDay() + 6) % 7;

// lista wykładowców → [{ url, p }]
export function wykladowcy(html) {
  return [...String(html).matchAll(/href='(\/wp-content\/include-me\/plany_mick\/pracow_zajecia_xml\.php\?[^']+)'[^>]*>([^<]+)</g)]
    .map((m) => ({ url: new URL(encje(m[1]), BAZA).href, p: encje(m[2]).replace(/\s+/g, " ").trim() }));
}

// „analiza i modelowanie popytu (lab gr. B)(12h)(M: Zastosowanie …)”, „język angielski (lk)(15)(zo) gr.1”, „seminarium (s) e-zajęcia”
const RODZ = { w: "W", "ćw": "CW", "ćwiczenia": "CW", lb: "LAB", lab: "LAB", s: "S", k: "K", lk: "CW" };
export function przedmiot(t) {
  let s = String(t).replace(/\s+/g, " ").trim(), k = null, pg = null, n = [], grupaPo = null;
  // niezamknięty nawias modułu, ucięty przez system („…(E)(M: Zastosowanie data sci”)
  const uciety = /\s*\(M:\s*([^()]*)$/.exec(s);
  if (uciety) { pg = `spec:${uciety[1].trim()}`; s = s.slice(0, uciety.index).trim(); }
  // tekst po nawiasach („(w)(15h)(zo) godz. 17.00-19.30-szczegółowy harmonogram na stronie Wydziału”) → notka
  const po = /\)\s*((?:godz\.|szczeg|Szczeg)[^()]*)$/.exec(s);
  if (po) { n.push(po[1].replace(/\s*-\s*(?=szczeg)/i, "; ").trim()); s = s.slice(0, po.index + 1).trim(); }
  for (let zmiana = true; zmiana;) {
    zmiana = false;
    const ogon = [
      [/\s*\be-zajęcia\s*$/i, () => n.push("e-zajęcia")],
      [/\s*\bgr\.\s*(\w+)\s*$/i, (m) => { grupaPo = m[1]; }],
      [/\s*\bE\s*$/, () => {}],
      [/\s*\(([^()]*)\)\s*$/, (m) => {
        const x = m[1].trim(), lab = /^lab\s+gr\.?\s*(\w+)$/i.exec(x);
        if (lab) { k ||= "LAB"; pg ||= `lab:${lab[1]}`; return; }
        if (RODZ[x.toLowerCase()] !== undefined) { k ||= RODZ[x.toLowerCase()]; return; }
        const zDop = /^(w|ćw|lb|lab|s|k|lk)\s+(.+)$/i.exec(x);   // „(w US-EM)”
        if (zDop) { k ||= RODZ[zDop[1].toLowerCase()]; n.push(zDop[2].trim()); return; }
        if (/^\d+\s*h?$/i.test(x) || /^(E|zo|zal)$/i.test(x) || x === "") return;   // godziny, forma zaliczenia
        const sp = /^sp\.\s*(.+)$/i.exec(x); if (sp) { pg ||= `spec:${sp[1].trim()}`; return; }
        const mod = /^M:\s*(.+)$/i.exec(x); if (mod) { pg ||= `spec:${mod[1].trim()}`; return; }
        return false;   // nawias należy do nazwy („Customer experience (doświadczenie klienta)”)
      }],
    ];
    for (const [re, f] of ogon) {
      const m = re.exec(s);
      if (m && f(m) !== false) { s = s.slice(0, m.index).trim(); zmiana = true; break; }
    }
  }
  if (grupaPo) pg ||= /^\d+$/.test(grupaPo) && k !== "LAB" ? `gr:${grupaPo}` : `lab:${grupaPo}`;
  return { pl: s, k: k || "X", ...(pg ? { pg } : {}), ...(n.length ? { n: n.join(", ") } : {}) };
}

// „A20: Finanse i Rachunkowość, stopień 1, rok 1” → { g, kierunek, stopien, rok }
export function grupa(t) {
  const m = /^\s*([A-Z]\d{2}[A-Za-z]?)\s*:\s*(.+?),\s*stopień\s*(\d)\s*,\s*rok\s*(\d)\s*$/i.exec(t);
  return m ? { g: m[1].toUpperCase(), kierunek: m[2].trim(), stopien: +m[3], rok: +m[4] } : null;
}

// plan wykładowcy → zajęcia [{ data, time, pl, k, pg?, n?, r, grupy: [...] }]
export function planWykladowcy(html) {
  const out = [];
  for (const r of String(html).replace(/<script[\s\S]*?<\/script>/gi, "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const c = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((x) => x[1]);
    if (c.length < 5) continue;
    const d = /(\d{4})\/(\d{2})\/(\d{2})/.exec(tekst(c[0]).join(" ")), g = /(\d{1,2})[.:](\d{2})\s*-\s*(\d{1,2})[.:](\d{2})/.exec(tekst(c[1]).join(" "));
    if (!d || !g) continue;
    const hh = (h, m) => `${String(+h).padStart(2, "0")}:${m}`;
    const grupy = tekst(c[3]).map(grupa).filter(Boolean);
    const sala = tekst(c[4]).join(", ").replace(/^s\.\s*/, "s. ");
    out.push({ data: `${d[1]}-${d[2]}-${d[3]}`, time: [hh(g[1], g[2]), hh(g[3], g[4])], ...przedmiot(tekst(c[2]).join(" ")), r: sala, grupy });
  }
  return out;
}

// zajęcia wszystkich wykładowców → plany roczników { "<kierunek>|<stopień>|<rok>": { groups, zajec } }
export function zloz(plany) {
  const jedne = new Map();   // te same zajęcia u kilku prowadzących → jeden wpis, prowadzący razem
  for (const { p, zajecia } of plany) for (const z of zajecia) {
    const klucz = JSON.stringify([z.data, z.time, z.pl, z.k, z.pg || "", z.r, z.grupy.map((g) => g.g).sort()]);
    const x = jedne.get(klucz) || jedne.set(klucz, { ...z, p: [] }).get(klucz);
    if (p && !x.p.includes(p)) x.p.push(p);
  }
  const wg = new Map();
  for (const z of jedne.values()) for (const g of z.grupy) {
    const rk = `${norm(g.kierunek)}|${g.stopien}|${g.rok}`;
    const r = wg.get(rk) || wg.set(rk, { kierunek: g.kierunek, stopien: g.stopien, rok: g.rok, wpisy: new Map() }).get(rk);
    const e = { d: dzienTyg(z.data), time: z.time, pl: z.pl, k: z.k, p: z.p.join(", "), r: z.r, ...(z.pg ? { pg: z.pg } : {}), ...(z.n ? { n: z.n } : {}) };
    const ek = g.g + "|" + JSON.stringify(e);
    (r.wpisy.get(ek) || r.wpisy.set(ek, { g: g.g, e, daty: [] }).get(ek)).daty.push(z.data);
  }
  const out = {};
  for (const [rk, r] of wg) {
    const groups = {};
    for (const { g, e, daty } of r.wpisy.values()) dodaj(groups, g, e, { daty: [...new Set(daty)].sort() });
    out[rk] = { kierunek: r.kierunek, stopien: r.stopien, rok: r.rok, groups: porzadkuj(groups), zajec: r.wpisy.size };
  }
  return out;
}

const semestr = (t) => { const m = t.getMonth() + 1; return { rokAkademicki: m >= 9 ? `${t.getFullYear()}/${t.getFullYear() + 1}` : `${t.getFullYear() - 1}/${t.getFullYear()}`, semestr: m >= 9 || m <= 2 ? "zimowy" : "letni" }; };

// ---------- importer wydziału (kontrakt scripts/us/importuj.mjs): tylko niestacjonarne, stacjonarne WEFiZ robi update-plan.mjs ----------
export async function importuj({ kierunki, pobieracz, log = () => {}, teraz = new Date() }) {
  const lista = await pobieracz.strona(LISTA);
  if (!lista) throw new Error("WEFiZ nst: lista wykładowców nie odpowiada " + LISTA);
  const wyk = wykladowcy(lista);
  if (wyk.length < 50) throw new Error(`WEFiZ nst: tylko ${wyk.length} wykładowców na liście (zmienił się wygląd strony?)`);
  const plany = [];
  let bledy = 0;
  for (const w of wyk) {
    try { const h = await pobieracz.strona(w.url); if (h) plany.push({ p: w.p, zajecia: planWykladowcy(h) }); else bledy++; }
    catch { bledy++; }
  }
  // zły plan gorszy niż brak: przy braku części wykładowców nic nie nadpisujemy (zapiszPlan zostawia poprzednią wersję)
  if (bledy > wyk.length * 0.05) throw new Error(`WEFiZ nst: ${bledy} z ${wyk.length} planów wykładowców nie odpowiada – zostają poprzednie plany`);
  const zlozone = zloz(plany);
  const wersja = "planynst-" + crypto.createHash("sha256").update(JSON.stringify(zlozone)).digest("hex").slice(0, 12);
  const wyniki = [], uzyte = new Set();
  for (const k of kierunki) for (const r of (k.roczniki || []).filter((x) => x.tryb === "nst")) {
    const rk = `${norm(k.pl)}|${r.stopien}|${r.rok}`;
    const p = zlozone[rk] || Object.entries(zlozone).find(([x]) => x.replace(/ inż\.$/, "") === rk)?.[1];
    if (!p) { wyniki.push({ id: r.id, kierunek: { pl: k.pl }, blad: `planynst: brak zajęć ${k.pl}, ${r.stopien === 2 ? "II" : "I"} st., ${r.rok}. rok` }); continue; }
    uzyte.add(rk);
    wyniki.push({ id: r.id, kod: kodStrony(k.kod, r.stopien, r.tryb, r.nabor), kierunek: { pl: k.pl, en: k.en || k.pl }, stopien: r.stopien, tryb: "nst", rok: r.rok,
      groups: p.groups, source: LISTA, wersja, ...semestr(teraz) });
  }
  for (const [rk, p] of Object.entries(zlozone)) if (!uzyte.has(rk)) log(`WEFiZ nst: zajęcia bez rocznika w config/kierunki-us.json: ${p.kierunek}, stopień ${p.stopien}, rok ${p.rok} (${p.zajec} zajęć)`);
  return wyniki;
}
