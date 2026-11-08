// Lista roczników innych niż BM na stronie planu (wybór kierunek → rok → grupa): z plików kierunki/*.json
// (robi je skrot-bm/scripts/kierunek.mjs) do bloku /*KIERUNKI_START*/…/*KIERUNKI_END*/ w index.html.
//   node scripts/kierunki.mjs            zapisuje (drugi raz bez zmian w kierunki/ nic nie zmienia)
//   node scripts/kierunki.mjs --sprawdz  kod 1, gdy index.html jest nieaktualny
import fs from "node:fs";
import { pathToFileURL } from "node:url";

export function lista(dir = "kierunki") {
  const pliki = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort() : [];
  return pliki.map(f => {
    const c = JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
    if (!c.id || !c.kod || !c.kierunek?.pl || !c.rok || c.plik !== `plan/${c.id}.json`) throw new Error(`${dir}/${f}: brak id, kod, kierunek.pl, rok albo plik ≠ plan/<id>.json`);
    // stopien: ten sam kierunek I i II stopnia (np. Ekonomia) to dwie pozycje na liście kierunków
    return { id: c.id, kod: c.kod, pl: c.kierunek.pl, en: c.kierunek.en || c.kierunek.pl, rok: c.rok, stopien: c.stopien ?? 1, wydzial: c.wydzial?.kod || "", plik: c.plik };
  });
}

export function wstaw(html, l) {
  const a = "/*KIERUNKI_START*/", b = "/*KIERUNKI_END*/";
  if (html.split(a).length !== 2 || html.split(b).length !== 2) throw new Error("index.html: znaczniki KIERUNKI_START/END muszą być dokładnie raz");
  const i = html.indexOf(a) + a.length, j = html.indexOf(b);
  return html.slice(0, i) + JSON.stringify(l) + html.slice(j);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const html = fs.readFileSync("index.html", "utf8");
  const nowy = wstaw(html, lista());
  if (process.argv.includes("--sprawdz")) {
    if (nowy !== html) { console.error("index.html: lista roczników nieaktualna (node scripts/kierunki.mjs)"); process.exit(1); }
    console.log("Lista roczników w index.html jest aktualna.");
  } else if (nowy !== html) { fs.writeFileSync("index.html", nowy); console.log("Zapisano listę roczników w index.html."); }
  else console.log("Lista roczników bez zmian.");
}
