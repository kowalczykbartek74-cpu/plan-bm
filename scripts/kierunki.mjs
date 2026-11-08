// Lista roczników innych niż BM na stronie planu (wybór kierunek → rok → grupa): z plików kierunki/*.json
// (robi je skrot-bm/scripts/kierunek.mjs) do bloku /*KIERUNKI_START*/…/*KIERUNKI_END*/ w index.html.
//   node scripts/kierunki.mjs            zapisuje (drugi raz bez zmian w kierunki/ nic nie zmienia)
//   node scripts/kierunki.mjs --sprawdz  kod 1, gdy index.html jest nieaktualny
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { roczniki } from "./roczniki.mjs";

export function lista(dir = "kierunki") {
  // kierunki/*.json i (dla katalogu kierunki/) config/kierunki-1rok.json, patrz scripts/roczniki.mjs
  // na stronę tylko roczniki z planem (pierwszy import nieudany = nie ma pustej pozycji); pliki z kierunki/ zawsze, jak dotąd
  return roczniki({ dir }).filter(c => c._plik.startsWith(dir + "/") || fs.existsSync(c.plik)).map(c => {
    const f = c._plik;
    if (!c.id || !c.kod || !c.kierunek?.pl || !c.rok || c.plik !== `plan/${c.id}.json`) throw new Error(`${f}: brak id, kod, kierunek.pl, rok albo plik ≠ plan/<id>.json`);
    // stopien: ten sam kierunek I i II stopnia (np. Ekonomia) to dwie pozycje na liście kierunków
    return { id: c.id, kod: c.kod, pl: c.kierunek.pl, en: c.kierunek.en || c.kierunek.pl, rok: c.rok, stopien: c.stopien ?? 1, wydzial: c.wydzial?.kod || "", plik: c.plik };
  });
}

// Kod strony rocznika spoza WEFiZ (część adresu #/<wydział>/<kod>/<rok>): kod kierunku + m (II st.) / j (jednolite) + n (niestacjonarne)
// + dwie cyfry naboru, np. psychj26, ban25 – ten sam wzór co prefiks() WEFiZ (zarz26, ekm26).
export const kodStrony = (kod, stopien, tryb, nabor) => String(kod).toLowerCase() + (stopien === 2 ? "m" : stopien === 0 ? "j" : "") + (tryb === "nst" ? "n" : "") + String(nabor).slice(2);

// Roczniki pozostałych wydziałów US: config/kierunki-us.json (inwentarz), na stronę tylko te z plikiem plan/<id>.json.
// Kierunek z „wlasciciel” (np. Ekonomiczno-prawny: plan z WPiA, kierunek WEFiZ) = jeden rocznik, widoczny pod oboma wydziałami (takze).
export function listaUS({ plik = "config/kierunki-us.json", wydzialyPlik = "config/wydzialy-us.json", jest = (f) => fs.existsSync(f) } = {}) {
  if (!fs.existsSync(plik)) return [];
  const ku = JSON.parse(fs.readFileSync(plik, "utf8")).wydzialy;
  const skr = Object.fromEntries((fs.existsSync(wydzialyPlik) ? JSON.parse(fs.readFileSync(wydzialyPlik, "utf8")).wydzialy : []).map((w) => [w.kod, w.skrot]));
  const out = new Map();
  for (const [kod, w] of Object.entries(ku)) {
    if (kod === "wefiz") continue;   // WEFiZ: kierunki/ i config/kierunki-1rok.json (lista())
    for (const k of w.kierunki) for (const r of k.roczniki || []) {
      if (!r.id || !k.kod || !jest(`plan/${r.id}.json`)) continue;
      const wl = k.wlasciciel || kod;
      const e = out.get(r.id) || { id: r.id, kod: kodStrony(k.kod, r.stopien, r.tryb, r.nabor), pl: k.pl, en: k.en || k.pl, rok: r.rok, stopien: r.stopien,
        ...(r.tryb === "nst" ? { tryb: "nst" } : {}), wydzial: skr[wl] || wl, plik: `plan/${r.id}.json` };
      if (wl !== kod) e.takze = [...new Set([...(e.takze || []), skr[kod] || kod])];
      out.set(r.id, e);
    }
  }
  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// Wydziały i kierunki bez planu (krok „Wydział” i wpis „Plan jeszcze niedostępny” na stronie): blok /*US_START*/…/*US_END*/.
export function daneUS(roczniki, { plik = "config/kierunki-us.json", wydzialyPlik = "config/wydzialy-us.json" } = {}) {
  const cfg = fs.existsSync(wydzialyPlik) ? JSON.parse(fs.readFileSync(wydzialyPlik, "utf8")).wydzialy : [];
  const ku = fs.existsSync(plik) ? JSON.parse(fs.readFileSync(plik, "utf8")).wydzialy : {};
  const wydzialy = cfg.map((w) => ({ w: w.skrot, pl: w.pl, en: w.en, url: (w.strony || [])[0]?.url?.replace(/api\/get_schedule\.php$/, "index.html") || null, dos: (w.dos || [])[0] || null }));
  // kierunek ma plan: ta sama nazwa i stopień albo ten sam kod strony (nazwa z systemu WEFiZ bywa inna niż w ofercie:
  // „Gospodarka Przestrzenna inż.” = „Gospodarka przestrzenna”, kod gpi)
  const baza = (kod) => String(kod).toLowerCase().replace(/\d+$/, "");
  const maPlan = new Set(roczniki.flatMap((r) => [r.wydzial, ...(r.takze || [])].flatMap((w) => [`${w}|${r.pl.toLowerCase()}|${r.stopien ?? 1}`, `${w}|#${baza(r.kod)}`])));
  const bezPlanu = [];
  for (const w of cfg) for (const k of ku[w.kod]?.kierunki || []) {
    const wl = cfg.find((x) => x.kod === (k.wlasciciel || w.kod))?.skrot || w.skrot;
    for (const st of k.stopnie || []) {
      const kb = k.kod ? String(k.kod).toLowerCase() + (st === 2 ? "m" : st === 0 ? "j" : "") : null;
      const klucze = [wl, w.skrot].flatMap((x) => [`${x}|${k.pl.toLowerCase()}|${st}`, ...(kb ? [`${x}|#${kb}`, `${x}|#${kb}n`] : [])]);
      if (klucze.some((x) => maPlan.has(x))) continue;
      if (!bezPlanu.some((b) => b.w === w.skrot && b.pl === k.pl && b.stopien === st)) bezPlanu.push({ w: w.skrot, pl: k.pl, en: k.en || k.pl, stopien: st });
    }
  }
  return { wydzialy, bezPlanu };
}

export function wstawUS(html, d) {
  const a = "/*US_START*/", b = "/*US_END*/";
  if (html.split(a).length !== 2 || html.split(b).length !== 2) throw new Error("index.html: znaczniki US_START/END muszą być dokładnie raz");
  return html.slice(0, html.indexOf(a) + a.length) + JSON.stringify(d) + html.slice(html.indexOf(b));
}

export function wstaw(html, l) {
  const a = "/*KIERUNKI_START*/", b = "/*KIERUNKI_END*/";
  if (html.split(a).length !== 2 || html.split(b).length !== 2) throw new Error("index.html: znaczniki KIERUNKI_START/END muszą być dokładnie raz");
  const i = html.indexOf(a) + a.length, j = html.indexOf(b);
  return html.slice(0, i) + JSON.stringify(l) + html.slice(j);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const html = fs.readFileSync("index.html", "utf8");
  const l = [...lista(), ...listaUS()];
  const nowy = wstawUS(wstaw(html, l), daneUS(l));
  if (process.argv.includes("--sprawdz")) {
    if (nowy !== html) { console.error("index.html: lista roczników nieaktualna (node scripts/kierunki.mjs)"); process.exit(1); }
    console.log("Lista roczników w index.html jest aktualna.");
  } else if (nowy !== html) { fs.writeFileSync("index.html", nowy); console.log("Zapisano listę roczników w index.html."); }
  else console.log("Lista roczników bez zmian.");
}
