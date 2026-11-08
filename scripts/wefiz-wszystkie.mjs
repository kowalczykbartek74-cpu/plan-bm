// Plany zajęć wszystkich kierunków i lat WEFiZ naraz (optymalizacja nr 2: „Etap A hurtem”).
// Czyta listę kierunków z formularza uczelni, znajduje grupy każdego kierunku i roku, sprawdza je na stronach grup
// i zapisuje kierunki/<id>.json w tym samym formacie co skrot-bm/scripts/kierunek.mjs. Dalej robi resztę codzienny automat
// (update-plan.mjs --wszystkie, kierunki.mjs, dziekanat.mjs --kierunki), bez żadnej zmiany w kodzie strony.
//
//   node scripts/wefiz-wszystkie.mjs --na-sucho            nic nie zapisuje: lista kierunków, lat i znalezionych grup
//   node scripts/wefiz-wszystkie.mjs                        zapisuje nowe pliki kierunki/<id>.json (istniejących nie rusza)
//   node scripts/wefiz-wszystkie.mjs --lata 1               tylko 1. rok (I i II stopnia); domyślnie wszystkie lata z planów
//   node scripts/wefiz-wszystkie.mjs --tylko "Logistyka,Ekonomia"
//   node scripts/wefiz-wszystkie.mjs --odswiez              nadpisuje też pliki zrobione wcześniej tym skryptem (nigdy te z skrot-bm)
//
// Grzecznie wobec uczelni: najwyżej 1 zapytanie na sekundę, jeden przebieg (raz w semestrze, gdy uczelnia opublikuje plany).
// Raport: docs/wefiz-wszystkie.md (co znalezione, czego nie, skąd wzięty rok).
// Grupy: (1) nazwy grup z planu kierunku i roku (planKierunek), każda sprawdzona na stronie grupy (planGrup: ten sam kierunek, ≥ 5 zajęć);
//        (2) jeśli strona kierunku nie podaje grup: lista grup z formularza uczelni, kierunek ze strony grupy, a rok = rok,
//            którego plan ma najwięcej tych samych przedmiotów (co najmniej połowę), z dopiskiem „rok dopasowany po przedmiotach”;
//        (3) gdy formularz nie ma listy grup (numer wpisuje się ręcznie, np. Marketing II st.): przegląd numerów
//            <litera kampusu><100–499> (domyślnie C i M, --skan-litery, --skan-zakres), dalej jak w (2). Wynik przeglądu zostaje
//            w docs/wefiz-grupy.json i do zmiany „Aktualizacja planu” na stronie uczelni kolejne przebiegi nie pytają uczelni drugi raz.
// Testy: node --test scripts/*.test.mjs
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { parseGroupPage, parseUpdated } from "./parse.mjs";

export const BASE = process.env.PLAN_BASE_URL || "https://planyzajec-efz.usz.edu.pl/";
const UA = "plan-bm (projekt studencki, plany kierunkow WEFiZ, 1 zapytanie/s; skrotbm@outlook.com)";
// [nazwa roku w formularzu uczelni, stopień, rok studiów]
export const LATA = [["1 rokI", 1, 1], ["2 rokI", 1, 2], ["3 rokI", 1, 3], ["4 rokI", 1, 4], ["1 rokII", 2, 1], ["2 rokII", 2, 2]];
const MIN_ENTRIES = 5;
const MAX_KANDYDATOW = 30;
export const WYDZIAL = { kod: "WEFiZ", pl: "Wydział Ekonomii, Finansów i Zarządzania", en: "Faculty of Economics, Finance and Management" };
// Ten sam kod co skrot-bm/scripts/kierunki-wefiz.mjs (nauka_kierunki.kod): jednoliterowe skróty uczelni rozszerzone do 2–6 liter.
const ROZSZERZ = { L: "LOG", M: "MKT", Z: "ZARZ" };
export const kodZ = (s) => { const k = String(s).replace(/[^A-Za-z]/g, "").toUpperCase(); return ROZSZERZ[k] || k; };
export const nabor = (rok, teraz = new Date()) => (teraz.getMonth() >= 9 ? teraz.getFullYear() : teraz.getFullYear() - 1) - rok + 1;
// prefiks = kod strony planu (?k=…) i id treści w Skrócie: zarz26, fir26; II stopień z „m” (ekm26); ten sam wzór co dotąd
export const prefiks = (kod, stopien, nab) => kod.toLowerCase() + (stopien === 2 ? "m" : stopien === 0 ? "j" : "") + String(nab).slice(2);
export const idRocznika = (kod, stopien, nab, tryb = "st") => `wefiz-${kod.toLowerCase()}-${stopien}-${tryb}-${nab}`;

// ---------- czytanie stron uczelni (bez sieci: same funkcje na tekście HTML) ----------
export function kierunkiZFormularza(html) {
  const a = html.indexOf('name="Kieruek"');
  if (a < 0) return [];
  const sel = html.slice(a, html.indexOf("</select>", a));
  return [...sel.matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map((m) => m[1].trim()).filter(Boolean).map((pelna) => {
    const m = /^(.*?)\s*\(([^)]+)\)$/.exec(pelna);
    return { pelna, nazwa: m ? m[1].trim() : pelna, skrot: m ? m[2].trim() : "" };
  });
}
export function grupyZFormularza(html) {
  const a = html.search(/name="numerGrupy"/);
  if (a < 0) return [];
  const sel = html.slice(a, html.indexOf("</select>", a));
  return [...new Set([...sel.matchAll(/<option[^>]*?(?:value="([^"]*)")?[^>]*>([^<]*)<\/option>/g)].map((m) => (m[1] || m[2]).trim()).filter((g) => /^[A-Za-z0-9]{2,12}$/.test(g)))];
}
// Rodzaj zajęć w nawiasie: BM „(W)”, „(ĆW)”, „(LB)”, inne kierunki „(w)”, „(ćw)”, „(lab gr. B)” (jak kierunki-wefiz.mjs).
export const liczbaZajec = (html) => (String(html || "").match(/\((w|ćw|lb|lab[^)]{0,20}|k|s|lek|proj|sem|wyk)\)/gi) || []).length;
// Nazwy grup w planie kierunku: odnośniki do planu grupy albo napisy w rodzaju C151, M120, G1201. Sale („s.N019”, „s. 104”) pomijamy.
export function kandydaciGrup(html) {
  const s = String(html || "");
  const out = new Set();
  for (const m of s.matchAll(/numerGrupy=([A-Za-z0-9]{2,12})/g)) out.add(m[1]);
  for (const m of s.matchAll(/(^|[^A-Za-z0-9.])([A-Z]{1,3}\d{3,4}[a-z]?)(?![A-Za-z0-9])/g)) {
    const przed = s.slice(Math.max(0, m.index - 6), m.index + m[1].length);
    if (/s\.\s?$|sala\s?$|Cuk\.?\s?$|Mic\.?\s?$/i.test(przed)) continue;
    out.add(m[2]);
  }
  return [...out].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).slice(0, MAX_KANDYDATOW);
}
// przedmioty (nazwy PL) z planu grupy albo z planu kierunku: do dopasowania roku, gdy strona kierunku nie podaje grup
export function przedmiotyStrony(html) {
  const s = String(html || "").replace(/<[^>]+>/g, "\n");
  const out = new Set();
  for (const m of s.matchAll(/([A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż][^\n()]{2,80}?)\s*\((?:w|ćw|lb|lab[^)]{0,20}|k|s|lek|proj|sem|wyk)[^)]*\)/gi)) {
    const n = m[1].replace(/\s+/g, " ").trim().toLowerCase().replace(/\s*\([^)]*\)\s*$/, "");
    if (n.length >= 3) out.add(n);
  }
  return out;
}
export function podobienstwo(a, b) {
  if (!a.size || !b.size) return 0;
  let w = 0;
  for (const x of a) if (b.has(x)) w++;
  return w / a.size;   // jaka część przedmiotów grupy jest w planie tego roku
}

// ---------- konfiguracja kierunku (format skrot-bm/scripts/kierunek.mjs → konfiguracjaPlanu) ----------
export function konfiguracja({ nazwa, skrot, pelna }, stopien, rok, grupy, { teraz = new Date(), tryb = "st", en = null } = {}) {
  const kod = kodZ(skrot || nazwa), nab = nabor(rok, teraz);
  const id = idRocznika(kod, stopien, nab, tryb), k = prefiks(kod, stopien, nab);
  const rokForm = LATA.find(([, s, r]) => s === stopien && r === rok)[0];
  return {
    opis: "Wygenerowane w plan-bm: node scripts/wefiz-wszystkie.mjs (plan bez Skrótu). Gdy kierunek dostanie Skrót, plik nadpisze skrot-bm/scripts/kierunek.mjs.",
    id, kod: k,
    wydzial: { ...WYDZIAL },
    kierunek: { kod, pl: nazwa, en: en || nazwa },
    stopien, tryb, nabor: nab, rok,
    system: { nazwa: pelna, rok: rokForm },
    grupy: grupy.slice(),
    plik: `plan/${id}.json`,
    odwolania: ["dos"],
  };
}
// plik z skrot-bm (Skrót dla tego rocznika) zawsze wygrywa; ten skrypt nadpisuje tylko swoje pliki i tylko z --odswiez
export const zSkrotu = (c) => /skrot-bm/.test(c?.opis || "") && !/wefiz-wszystkie/.test(c?.opis || "");

// ---------- przebieg (get = funkcja pobierająca stronę uczelni; w testach atrapa) ----------
export const numeryDoSkanu = ({ litery = ["C", "M"], od = 100, do: doN = 499 } = {}) => litery.flatMap((l) => Array.from({ length: doN - od + 1 }, (_, i) => l + (od + i)));

// pamiec: { aktualizacja, grupy: { X: { kierunek, n, przedmioty: [...] } } } z poprzedniego przebiegu (docs/wefiz-grupy.json)
export async function znajdz(get, { lata = null, stopnie = null, tylko = null, log = () => {}, skan = {}, pamiec = null } = {}) {
  const start = await get("plan");
  const kierunki = kierunkiZFormularza(start || "").filter((k) => !tylko || tylko.includes(k.nazwa));
  if (!kierunki.length) throw new Error("Nie znalazłem listy kierunków na stronie planów.");
  const aktualizacja = parseUpdated(start || "");
  const zFormularza = grupyZFormularza(start || "");
  const strony = new Map();    // planGrup?numerGrupy=X → { kierunek, przedmioty, n }
  // ta sama „Aktualizacja planu” co w poprzednim przebiegu: strony grup z pamięci, bez pytania uczelni
  if (pamiec && aktualizacja && pamiec.aktualizacja === aktualizacja) {
    for (const [g, s] of Object.entries(pamiec.grupy || {})) strony.set(g, { kierunek: s.kierunek, n: s.n, przedmioty: new Set(s.przedmioty || []), podgrupy: s.podgrupy || [] });
    for (const g of pamiec.puste || []) strony.set(g, { kierunek: null, n: 0, przedmioty: new Set() });
  }
  const wszystkieGrupy = zFormularza.length ? zFormularza : null;   // null = lista dopiero z przeglądu numerów (3), gdy będzie potrzebna
  const grupa = async (g) => {
    if (!strony.has(g)) {
      const html = await get(`planGrup?numerGrupy=${encodeURIComponent(g)}`);
      const p = html ? parseGroupPage(html) : { empty: true };
      const pg = p.empty ? [] : [...new Set([...p.odd, ...p.even].map((e) => e.g).filter(Boolean))].sort();
      strony.set(g, { kierunek: p.kierunek || null, n: p.empty ? 0 : p.odd.length + p.even.length, przedmioty: przedmiotyStrony(html || ""), podgrupy: pg });
    }
    return strony.get(g);
  };
  const wyniki = [], bezPlanu = [];
  for (const k of kierunki) {
    const lataK = [];
    for (const [rokForm, stopien, rok] of LATA) {
      if ((lata && !lata.includes(rok)) || (stopnie && !stopnie.includes(stopien))) continue;
      const html = await get("planKierunek?" + new URLSearchParams({ Kieruek: k.pelna, rok: rokForm }));
      if (liczbaZajec(html) < 3) { bezPlanu.push({ ...k, stopien, rok, zajec: liczbaZajec(html) }); continue; }
      lataK.push({ rokForm, stopien, rok, html, przedmioty: przedmiotyStrony(html) });
    }
    for (const L of lataK) {
      const grupy = [];
      for (const g of kandydaciGrup(L.html)) {
        const s = await grupa(g);
        if (s.kierunek === k.nazwa && s.n >= MIN_ENTRIES) grupy.push(g);
      }
      L.grupy = grupy; L.zrodlo = grupy.length ? "plan kierunku" : null;
    }
    // (2) brak grup w planie kierunku: grupy z formularza o tym kierunku, rok po przedmiotach; (3) bez listy w formularzu: przegląd numerów
    const bez = lataK.filter((L) => !L.grupy.length);
    const lista = wszystkieGrupy || (bez.length ? numeryDoSkanu(skan) : []);
    const zrodlo2 = wszystkieGrupy ? "rok dopasowany po przedmiotach" : "przegląd numerów, rok po przedmiotach";
    if (bez.length && lista.length) {
      const zajete = new Set(lataK.flatMap((L) => L.grupy));
      for (const g of lista) {
        if (zajete.has(g)) continue;
        const s = await grupa(g);
        if (s.kierunek !== k.nazwa || s.n < MIN_ENTRIES) continue;
        const best = lataK.map((L) => [podobienstwo(s.przedmioty, L.przedmioty), L]).sort((a, b) => b[0] - a[0])[0];
        if (best && best[0] >= 0.5 && bez.includes(best[1])) { best[1].grupy.push(g); best[1].zrodlo = zrodlo2; }
      }
    }
    for (const L of lataK) {
      L.grupy.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      wyniki.push({ ...k, stopien: L.stopien, rok: L.rok, grupy: L.grupy, zrodlo: L.zrodlo,
        podgrupy: Object.fromEntries(L.grupy.map((g) => [g, strony.get(g).podgrupy || []])), zajecKierunku: liczbaZajec(L.html) });
      log(`${k.pelna} · ${L.rokForm}: ${L.grupy.join(", ") || "brak grup"}${L.zrodlo ? " (" + L.zrodlo + ")" : ""}`);
    }
  }
  // pamięć do następnego przebiegu: grupy z planem (kierunek, przedmioty) i numery bez planu („Brak planu!”)
  const istn = [...strony].filter(([, s]) => s.kierunek && s.n);
  const nowaPamiec = { aktualizacja, grupy: Object.fromEntries(istn.map(([g, s]) => [g, { kierunek: s.kierunek, n: s.n, przedmioty: [...s.przedmioty], podgrupy: s.podgrupy || [] }])),
    puste: [...strony].filter(([, s]) => !(s.kierunek && s.n)).map(([g]) => g).sort() };
  Object.defineProperty(wyniki, "pamiec", { value: nowaPamiec, enumerable: false });
  Object.defineProperty(wyniki, "bezPlanu", { value: bezPlanu, enumerable: false });
  return wyniki;
}

// Nazwa angielska ze słownika config/nazwy-en.json (nazwa PL z systemu → EN), bez rozróżniania wielkości liter.
export function enNazwa(nazwa, plik = "config/nazwy-en.json") {
  if (!fs.existsSync(plik)) return null;
  const slownik = JSON.parse(fs.readFileSync(plik, "utf8"));
  const n = String(nazwa).toLowerCase();
  return Object.entries(slownik).find(([k]) => k.toLowerCase() === n)?.[1] || null;
}
export function zapiszKonfiguracje(wyniki, { dir = "kierunki", odswiez = false, naSucho = false, teraz = new Date() } = {}) {
  const raport = { nowe: [], pominiete: [], bezGrup: [] };
  for (const w of wyniki) {
    if (!w.grupy.length) { raport.bezGrup.push(w); continue; }
    const c = konfiguracja(w, w.stopien, w.rok, w.grupy, { teraz, en: enNazwa(w.nazwa) });
    const p = `${dir}/${c.id}.json`;
    const stary = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
    // BM 1. roku ma plan.json (osobna konfiguracja w update-plan.mjs)
    if (c.id === "wefiz-bm-1-st-2026" || (stary && (zSkrotu(stary) || !odswiez))) { raport.pominiete.push({ ...w, id: c.id, powod: c.id === "wefiz-bm-1-st-2026" ? "BM (plan.json)" : zSkrotu(stary) ? "plik ze Skrótu (skrot-bm)" : "już jest" }); continue; }
    if (!naSucho) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n"); }
    raport.nowe.push({ ...w, id: c.id, kod: c.kod });
  }
  return raport;
}

export function raportMd(r, teraz = new Date()) {
  const wiersz = (w) => `| ${w.nazwa}${w.skrot ? " (" + w.skrot + ")" : ""} | ${w.stopien === 2 ? "II" : "I"} st., ${w.rok}. rok | ${w.grupy.join(", ") || "—"} | ${w.id ? "`" + w.id + "`" : "—"} | ${w.powod || w.zrodlo || "nie znaleziono grup"} |`;
  return `# Plany wszystkich kierunków WEFiZ (${teraz.toISOString().slice(0, 10)})

Wygenerowane: \`node scripts/wefiz-wszystkie.mjs\`. Nowe pliki konfiguracji: **${r.nowe.length}**, pominięte: ${r.pominiete.length}, bez grup: ${r.bezGrup.length}.
Plan każdego nowego pliku pobierze codzienny automat (\`update-plan.mjs --wszystkie\`), stronę wyboru odświeży \`kierunki.mjs\`.

| Kierunek | Rok | Grupy | Rocznik | Uwagi |
|---|---|---|---|---|
${[...r.nowe, ...r.pominiete, ...r.bezGrup].map(wiersz).join("\n")}

„rok dopasowany po przedmiotach” = strona kierunku nie podaje grup; rok wybrany po wspólnych przedmiotach. Sprawdź te wiersze na stronie uczelni.
`;
}

// ---------- uruchomienie ----------
async function main(argv) {
  const naSucho = argv.includes("--na-sucho");
  const li = argv.indexOf("--lata"), ti = argv.indexOf("--tylko"), sl = argv.indexOf("--skan-litery"), sz = argv.indexOf("--skan-zakres");
  const skan = { ...(sl >= 0 ? { litery: argv[sl + 1].split(",") } : {}), ...(sz >= 0 ? { od: +argv[sz + 1].split("-")[0], do: +argv[sz + 1].split("-")[1] } : {}) };
  const PAM = "docs/wefiz-grupy.json";
  const pamiec = fs.existsSync(PAM) ? JSON.parse(fs.readFileSync(PAM, "utf8")) : null;
  const lata = li >= 0 ? argv[li + 1].split(",").map(Number) : null;
  const tylko = ti >= 0 ? argv[ti + 1].split(",").map((s) => s.trim()) : null;
  const pauza = () => new Promise((r) => setTimeout(r, 1100));
  const get = async (path) => {
    await pauza();
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(BASE + path, { headers: { "User-Agent": UA }, redirect: "manual" });
        if (r.status >= 300 && r.status < 500) return null;   // przekierowanie albo brak strony
        if (r.ok) return await r.text();
      } catch { /* ponów */ }
      await new Promise((r) => setTimeout(r, 15000));
    }
    throw new Error("brak odpowiedzi: " + path);
  };
  const wyniki = await znajdz(get, { lata, tylko, skan, pamiec, log: (s) => console.log(s) });
  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync(PAM, JSON.stringify(wyniki.pamiec, null, 1) + "\n");   // też przy --na-sucho: drugi przebieg nie pyta uczelni drugi raz
  const r = zapiszKonfiguracje(wyniki, { odswiez: argv.includes("--odswiez"), naSucho });
  const md = raportMd(r);
  if (!naSucho) { fs.mkdirSync("docs", { recursive: true }); fs.writeFileSync("docs/wefiz-wszystkie.md", md); }
  console.log("\n" + md);
  console.log(naSucho ? "Na sucho: nic nie zapisane." : `Zapisano ${r.nowe.length} plików w kierunki/ i raport docs/wefiz-wszystkie.md. Dalej: node scripts/update-plan.mjs --wszystkie && node scripts/kierunki.mjs`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main(process.argv.slice(2)).catch((e) => { console.error("BŁĄD:", e.message); process.exit(1); });
}
