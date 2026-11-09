// Etap 6 (cały US): komunikaty DOS dla roczników spoza WEFiZ. Tytuły wpisów nie mają tam formy „GRUPA C111”, tylko np.
//   „Geologia I st. 1 rok – odwołane zajęcia z chemii z dr T. Millerem w dniu 4.11”   (WNŚiP)
//   „PSM I st. I r. zmiana sali w dn. 30.X podstawy prawoznawstwa dr M. Peno”         (WPiA)
//   „Hydrobiology 1st degree 2nd year – lecture with dr … cancelled on 5th November”  (WNŚiP, EN)
//   „Dr Barbara Popiel-Kobielska – odwołanie zajęć”                                   (WH: tylko prowadzący)
// Dopasowanie do rocznika po kierunku (nazwa PL/EN albo skrót), roku, stopniu i prowadzącym z planu:
//   wysoka pewność – kierunek pasuje, a rok i stopień (gdy podane) się zgadzają → zwykłe odczytanie wpisu (odwołanie/odrabianie);
//   niska pewność  – pasuje tylko prowadzący z planu (bez kierunku) albo kierunek bez roku i bez prowadzącego
//                    → tylko oryginał wpisu jako notka pod dniem, bez zgadywania zajęć (spec, Etap 6 pkt 2).
// Rok albo stopień sprzeczny z rocznikiem = wpis nie dotyczy rocznika.

export const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/\s+/g, " ");
const RZ = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
const MALE = new Set(["i", "w", "oraz", "and", "of", "the", "in", "z", "na", "do", "dla", "–", "-", "—"]);

// rdzeń słowa do odmiany: „psychologia” → „psycholog”, „narodowe” → „narodow”
const rdzen = (w) => (w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 2)));
const slowa = (nazwa) => norm(nazwa).replace(/\(.*?\)/g, " ").split(/[^a-z0-9]+/).filter((w) => w && !MALE.has(w));
// czy wszystkie słowa nazwy kierunku są w tekście (w kolejności, z odmianą)
export function maNazwe(tekst, nazwa) {
  const w = slowa(nazwa);
  if (!w.length) return false;
  const t = " " + norm(tekst).replace(/[^a-z0-9]+/g, " ") + " ";
  let od = 0;
  for (const s of w) { const i = t.indexOf(" " + rdzen(s), od); if (i < 0) return false; od = i + 1; }
  return true;
}
// miejsce nazwy w tekście (indeks w znormalizowanym tekście) albo -1
function gdzieNazwa(tekst, nazwa) {
  const w = slowa(nazwa);
  if (!w.length) return -1;
  const t = " " + norm(tekst).replace(/[^a-z0-9]+/g, " ") + " ";
  let od = 0, pocz = -1;
  for (const s of w) { const i = t.indexOf(" " + rdzen(s), od); if (i < 0) return -1; if (pocz < 0) pocz = i; od = i + 1; }
  return pocz;
}
const gdzieSkrot = (tytul, s) => { if (!s || s.length < 2) return -1; const m = new RegExp(`(^|[^\\p{L}\\d])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\d])`, "u").exec(tytul); return m ? m.index : -1; };
const maSkrot = (tytul, s) => s && s.length >= 2 && new RegExp(`(^|[^\\p{L}\\d])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\d])`, "u").test(tytul);

// rok z tekstu: „1 rok”, „I r.”, „II roku”, „dla V roku”, „rok 2”, „2nd year”, „year II”
export function rokZ(t) {
  const s = String(t);
  let m = /(?<![\p{L}\d])([1-5]|IV|V|I{1,3})\s*(?:rok|roku|r\.)(?![\p{L}])/u.exec(s);
  if (m) return RZ[m[1]] || +m[1];
  m = /(?<![\p{L}])rok(?:u)?\s+([1-5]|IV|V|I{1,3})(?![\p{L}\d])/u.exec(s);
  if (m) return RZ[m[1]] || +m[1];
  m = /\b([1-5])(?:st|nd|rd|th)\s+year\b/i.exec(s) || /\byear\s+([1-5]|IV|V|I{1,3})\b/i.exec(s);
  if (m) return RZ[m[1]] || +m[1];
  m = /\b(first|second|third|fourth|fifth)\s+year\b/i.exec(s);
  return m ? ORD[m[1].toLowerCase()] : null;
}
// stopień: 1, 2, 0 (jednolite) albo null
export function stopienZ(t) {
  const s = String(t);
  if (/jednolit|\bJM\b|\bjm\b|long-cycle/i.test(s)) return 0;
  let m = /(?<![\p{L}\d])(II|I)\s*(?:st\.|st\b|stop(?:nia|ień|ien))/u.exec(s) || /(?<![\p{L}\d])([12])(?:\s+st\.|\s+st\b|\.?\s*stop(?:nia|ień|ien))/u.exec(s);
  if (m) return m[1] === "II" || m[1] === "2" ? 2 : 1;
  m = /\b(1st|2nd|first|second)\s+(?:degree|cycle)\b/i.exec(s);
  if (m) return /^(1st|first)$/i.test(m[1]) ? 1 : 2;
  if (/\b(BA|licencjat\w*)\b/.test(s)) return 1;
  if (/\b(MA|magistersk\w* II|uzupełniając\w*)\b/.test(s)) return 2;
  return null;
}
// grupa z tytułu: „(Gr.1)”, „GR. 1”, „grupa 11”, „group 2” → numer
export const grupaZ = (t) => grupyZ(t)[0] || null;
// wszystkie grupy: „gr. 1 i 2”, „(gr. 3,5,9)”, „gr. 1, 2, 3, 5”, „grupy 3, 5, 9”
export function grupyZ(t) {
  const m = /(?<![\p{L}])(?:gr\.?|grupa|grupy|group|groups)\s*(\d{1,2}(?:\s*(?:,|i|oraz|and)\s*\d{1,2})*)(?!\d)/iu.exec(String(t));
  return m ? m[1].split(/\s*(?:,|i|oraz|and)\s*/).filter(Boolean) : [];
}

// nazwisko z prowadzącego planu → rdzeń do szukania w tekście (jak surnameStem w dziekanat.mjs, bez polskich znaków)
export function nazwisko(p) {
  const w = String(p || "").replace(/\(.*?\)/g, "").split(/[\s,]+/).filter((x) => /^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]/.test(x) && !/^(Ks|Dr|Prof|Mgr|Inż|Hab|US|Lic|Mgr\.)\.?$/i.test(x));
  const last = w[w.length - 1];
  if (!last) return null;
  const n = norm(last.split("-")[0]);
  return n.length < 4 ? null : n.slice(0, Math.max(4, n.length - 2));
}
const maNazwisko = (tekst, stem) => stem && new RegExp(`(^|[^a-z])${stem}`).test(norm(tekst));

// Dopasowanie dla rocznika. r = { kierunek: {pl, en}, skroty: [..], stopien, rok, inne: [nazwy innych kierunków wydziału] },
// plan = plan/<id>.json. Zwraca funkcję (post, { tylkoTytul }) → null | { pewnosc: "wysoka"|"niska", nr?, prowadzacy: [p…] }.
export function dopasowanie(r, plan) {
  const grupy = Object.keys(plan.groups || {});
  const prow = [...new Set(grupy.flatMap((g) => ["odd", "even"].flatMap((w) => plan.groups[g][w] || [])).map((e) => e.p).filter(Boolean)
    .flatMap((p) => p.split(/\s*[,;/]\s*|\s+i\s+/)))];
  const stemy = new Map(prow.map((p) => [p, nazwisko(p)]).filter(([, s]) => s));
  const nazwy = [r.kierunek?.pl, r.kierunek?.en].filter(Boolean);
  // dłuższa nazwa innego kierunku, która zawiera naszą („Pedagogika” ⊂ „Pedagogika specjalna”) – wtedy to nie nasz kierunek
  const dluzsze = (r.inne || []).filter((n) => nazwy.some((x) => slowa(n).length > slowa(x).length && maNazwe(n, x)));
  return (post, { tylkoTytul = false } = {}) => {
    const tytul = post.title || "", tekst = tylkoTytul ? tytul : `${tytul} ${post.text || ""}`;
    if ((/niestacjonarn|zaoczn/i.test(tytul) || (r.nst || []).some((x) => maSkrot(tytul, x))) && r.tryb !== "nst") return null;
    const nasz = (r.skroty || []).some((s) => maSkrot(tytul, s));
    // skrót innego kierunku wydziału w tytule, bez naszego („SSA … Prawo administracyjne” to nie Prawo)
    if (!nasz && (r.inneSkroty || []).some((s) => maSkrot(tytul, s))) return null;
    const kier = (nasz || nazwy.some((n) => maNazwe(tytul, n))) && !dluzsze.some((n) => maNazwe(tytul, n));
    // rok/stopień: zaraz po nazwie naszego kierunku („PPiW 1 rok, Reso I st. 1 rok, EA I st. 3 rok”), inaczej z całego tytułu
    let rok = rokZ(tytul), st = stopienZ(tytul);
    if (kier) {
      const i = Math.max(...nazwy.map((n) => gdzieNazwa(tytul, n)), -1), j = Math.max(...(r.skroty || []).map((x) => gdzieSkrot(tytul, x)), -1);
      if (i >= 0 || j >= 0) {
        // znormalizowany indeks ≈ indeks w tytule (norm nie zmienia długości poza spacjami); fragment do następnego przecinka/nawiasu
        const od = j >= 0 ? j : i, kaw = tytul.slice(od).split(/[,;)]|\s[–-]\s/)[0];
        if (rokZ(kaw) != null) rok = rokZ(kaw);
        else if (j >= 0) { const rz = /^\S+\s+(IV|V|I{1,3})(?![\p{L}\d.])/u.exec(kaw); if (rz && !/^\S+\s+(?:IV|V|I{1,3})\s*st/u.test(kaw)) rok = RZ[rz[1]]; }   // WPiA: „SSP IV – …”
        if (stopienZ(kaw) != null) st = stopienZ(kaw);
      }
    }
    if (rok != null && rok !== r.rok) return null;
    if (st != null && r.stopien != null && st !== r.stopien && !(st === 1 && r.stopien === 0)) return null;
    const ludzie = [...stemy].filter(([, s]) => maNazwisko(tekst, s)).map(([p]) => p);
    const gr = grupyZ(tytul), nr = gr.length ? gr.join(",") : null;
    // wysoka: kierunek i rok w tytule; kierunek bez roku = tylko notka
    if (kier && rok != null) return { pewnosc: "wysoka", ...(nr ? { nr } : {}), prowadzacy: ludzie };
    if (kier) return { pewnosc: "niska", prowadzacy: ludzie };
    // bez kierunku: prowadzący z planu w TYTULE, tytuł bez roku i innego kierunku, treść nie wskazuje innego kierunku bez naszego
    const wTytule = [...stemy].filter(([, s]) => maNazwisko(tytul, s)).map(([p]) => p);
    const tresc = post.text || "";
    const inny = (n) => maNazwe(tytul, n) || (!nazwy.some((x) => maNazwe(tresc, x)) && maNazwe(tresc, n) && slowa(n).length > 1);
    if (wTytule.length && rok == null && !(r.inne || []).some(inny)) return { pewnosc: "niska", prowadzacy: wTytule };
    return null;
  };
}

// Roczniki US spoza WEFiZ (WEFiZ ma kierunki/*.json, scripts/roczniki.mjs) z planem w plan/<id>.json:
// sekcja DOS = pierwszy adres „dos” wydziału z config/zrodla-us.json, kierunek/skróty/rok/stopień z config/kierunki-us.json.
import fs from "node:fs";
import { budynek, DOS } from "../roczniki.mjs";
export function rocznikiUS({ kierunki = "config/kierunki-us.json", zrodla = "config/zrodla-us.json", wydzialy = "config/wydzialy-us.json", planDir = "plan" } = {}) {
  if (!fs.existsSync(kierunki) || !fs.existsSync(zrodla)) return [];
  const cfgW = fs.existsSync(wydzialy) ? JSON.parse(fs.readFileSync(wydzialy, "utf8")).wydzialy : [];
  const K = JSON.parse(fs.readFileSync(kierunki, "utf8")).wydzialy, Z = JSON.parse(fs.readFileSync(zrodla, "utf8")).wydzialy;
  const out = [];
  for (const [w, wd] of Object.entries(K)) {
    const dosW = (Z[w]?.dos || [])[0];
    const nazwyW = wd.kierunki.flatMap((k) => [k.pl, k.en].filter(Boolean));
    for (const k of wd.kierunki) for (const r of k.roczniki || []) {
      const plik = `${planDir}/${r.id}.json`;
      // WEFiZ stacjonarne: kierunki/ (scripts/roczniki.mjs); tu tylko niestacjonarne (Etap 7)
      if (!r.id || (w === "wefiz" ? r.tryb !== "nst" : r.tryb !== "st") || !fs.existsSync(plik)) continue;
      const dos = w === "wefiz" && budynek(JSON.parse(fs.readFileSync(plik, "utf8"))) === "mic" ? DOS.mic : dosW;
      const cw = cfgW.find((x) => x.kod === w) || {};
      out.push({ id: r.id, plik, dos, wydzial: { kod: wd.skrot }, kierunek: { pl: k.pl, en: k.en || null }, skroty: [...new Set([...(k.skroty || []), k.kod, ...((cw.dosSkroty || {})[k.kod] || [])].filter(Boolean))],
        rok: r.rok, stopien: r.stopien, tryb: r.tryb, nst: cw.dosNiestacjonarne || [], inne: nazwyW.filter((n) => n !== k.pl && n !== k.en),
        inneSkroty: wd.kierunki.filter((x) => x !== k).flatMap((x) => [...(x.skroty || []), x.kod, ...((cw.dosSkroty || {})[x.kod] || [])]).filter((x) => x && x.length >= 2) });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// ---------- „formularz dotyczący nieobecności w pracy” (system uczelni; WH i inne wydziały) ----------
// Wpis = tabela pozycji: „Lp. Z dnia Z godziny Na dzień Na godzinę Numer sali Numer grupy Forma realizacji…” + „Kierunek studiów
// Forma studiów Stopień studiów Rok studiów Przedmiot Forma zajęć…”. Każda pozycja mówi dokładnie: kierunek, tryb, stopień, rok,
// przedmiot, rodzaj, dzień i godzinę przepadających zajęć oraz (gdy podany) termin i salę odrabiania – bez zgadywania.
const NAGL_A = /Lp\. Z dnia Z godziny Na dzień Na godzinę Numer sali Numer grupy Forma realizacji przepadających zajęć/;
const NAGL_B = /Kierunek studiów Forma studiów Stopień studiów Rok studiów Przedmiot Forma zajęć(?: Proponowane zastępstwo)?/;
const FORMY = { "wykład": "W", "ćwiczenia": "CW", "konwersatorium": "K", "laboratorium": "LAB", "seminarium": "S", "lektorat": "CW", "warsztaty": "CW", "proseminarium": "S", "projekt": "CW" };
const KOD_GR = String.raw`[A-Za-z]+-S\w*\.\d{2}[^\s,]*`;
export function formularz(tekst) {
  const t = String(tekst || "");
  if (!NAGL_A.test(t)) return null;   // nagłówek tabeli (zdanie „formularz dotyczący nieobecności…” bywa pominięte, np. WNS)
  const out = [];
  for (const cz of t.split(NAGL_A).slice(1)) {
    const [a, b = ""] = cz.split(NAGL_B);
    const m = /(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s+(\d{4}-\d{2}-\d{2}|[–-])\s+(\d{1,2}:\d{2}|[–-])\s+(.{0,300})/.exec(a);
    const k = new RegExp(String.raw`^\s*(.+?)\s+(stacjonarne|niestacjonarne)\s+(pierwszego stopnia|drugiego stopnia|jednolite\S*(?:\s+magisterskie)?)\s+(\d)\s+(.+?)\s+(${Object.keys(FORMY).join("|")})(?=\s|$)`).exec(b);
    if (!m || !k) continue;
    const g = new RegExp(String.raw`^(.*?)\s*((?:${KOD_GR})(?:\s*,\s*${KOD_GR})*|[–-])\s+[A-ZŁŚŻ]`).exec(m[5]);
    const sala = g ? g[1].replace(/^[–-]$/, "").replace(/^dowolna.*$/i, "").trim() : "";
    const grupy = g && !/^[–-]$/.test(g[2]) ? g[2].split(/\s*,\s*/) : [];
    const lab = grupy.map((x) => /-L\.(\d+)$/.exec(x)?.[1]).filter(Boolean);
    out.push({ zDnia: m[1], zGodz: m[2], ...(/^\d/.test(m[3]) && /^\d/.test(m[4]) ? { naDzien: m[3], naGodz: m[4] } : {}), ...(sala ? { sala } : {}), grupy, ...(lab.length === 1 ? { nr: lab[0] } : {}),
      kierunek: k[1], tryb: k[2] === "stacjonarne" ? "st" : "nst", stopien: /^pierwsz/.test(k[3]) ? 1 : /^drugi/.test(k[3]) ? 2 : 0, rok: +k[4], przedmiot: k[5], k: FORMY[k[6]] });
  }
  return out;
}
// pozycja formularza dotyczy rocznika: ta sama nazwa kierunku (bez dłuższej nazwy innego kierunku), tryb, stopień, rok
export function formularzDla(r) {
  const nazwy = [r.kierunek?.pl, r.kierunek?.en].filter(Boolean);
  const ta = (n) => nazwy.some((x) => slowa(x).length === slowa(n).length && maNazwe(n, x));
  return (poz) => poz.tryb === "st" && poz.rok === r.rok && poz.stopien === r.stopien && ta(poz.kierunek);
}
