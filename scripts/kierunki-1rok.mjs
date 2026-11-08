// Etap 1 planu dla wszystkich kierunków: lista kierunków 1. roku I stopnia (stacjonarne) z systemu planów WEFiZ.
// Kierunki i grupy bierzemy tylko z systemu uczelni (scripts/wefiz-wszystkie.mjs → znajdz); w kodzie nie ma żadnej listy kierunków.
// Nazwy angielskie: config/nazwy-en.json (słownik nazwa PL → EN, do uzupełniania; brak = null i ostrzeżenie).
//
//   node scripts/kierunki-1rok.mjs           zapisuje config/kierunki-1rok.json i wypisuje tabelę
//   node scripts/kierunki-1rok.mjs --tylko "Zarządzanie,Logistyka"
// Odpowiedzi uczelni: .cache/efz/ (scripts/uczelnia.mjs), ≤ 1 zapytanie/s.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { znajdz, kodZ, nabor, idRocznika, prefiks } from "./wefiz-wszystkie.mjs";
import { uczelnia } from "./uczelnia.mjs";

export function zbuduj(wyniki, bezPlanu, { en = {}, teraz = new Date(), aktualizacja = null } = {}) {
  const wpis = (w, maPlan) => {
    const kod = kodZ(w.skrot || w.nazwa), nab = nabor(1, teraz);
    return {
      id: idRocznika(kod, 1, nab, "st"),
      kod: prefiks(kod, 1, nab),
      kierunek: kod,
      system: { nazwa: w.pelna, rok: "1 rokI" },
      pl: w.nazwa,
      en: en[w.nazwa] || null,
      stopien: 1, rok: 1, tryb: "st", nabor: nab,
      maPlan,
      grupy: (w.grupy || []).map((g) => ({ nazwa: g, podgrupy: (w.podgrupy || {})[g] || [] })),
      ...(w.zrodlo && w.zrodlo !== "plan kierunku" ? { uwaga: w.zrodlo } : {}),
    };
  };
  const kierunki = [...wyniki.map((w) => wpis(w, true)), ...bezPlanu.map((w) => wpis(w, false))]
    .sort((a, b) => a.pl.localeCompare(b.pl, "pl"));
  return { opis: "Wygenerowane: node scripts/kierunki-1rok.mjs (z systemu planów WEFiZ). Nie edytuj ręcznie, nazwy EN w config/nazwy-en.json.",
    zrodlo: "https://planyzajec-efz.usz.edu.pl/plan", aktualizacja, wygenerowano: teraz.toISOString().slice(0, 10), kierunki };
}

export function tabela(cfg) {
  const w = cfg.kierunki.map((k) => `| ${k.pl} (${k.system.nazwa.match(/\(([^)]+)\)$/)?.[1] || "–"}) | \`${k.id}\` | ${k.grupy.map((g) => g.nazwa + (g.podgrupy.length ? " " + g.podgrupy.join("/") : "")).join(", ") || "—"} | ${k.maPlan ? (k.grupy.length ? "tak" : "tak, bez grup") : "nie"}${k.uwaga ? " (" + k.uwaga + ")" : ""} |`);
  return ["| Kierunek | id | Grupy (podgrupy) | Plan w systemie |", "|---|---|---|---|", ...w].join("\n");
}

async function main(argv) {
  const ti = argv.indexOf("--tylko");
  const tylko = ti >= 0 ? argv[ti + 1].split(",").map((s) => s.trim()) : null;
  const get = uczelnia({ log: (s) => console.error(s) });
  const wyniki = await znajdz(get, { lata: [1], stopnie: [1], tylko });
  const en = fs.existsSync("config/nazwy-en.json") ? JSON.parse(fs.readFileSync("config/nazwy-en.json", "utf8")) : {};
  const cfg = zbuduj(wyniki, wyniki.bezPlanu, { en, aktualizacja: await get.aktualizacja() });
  fs.mkdirSync("config", { recursive: true });
  fs.writeFileSync("config/kierunki-1rok.json", JSON.stringify(cfg, null, 2) + "\n");
  console.log(tabela(cfg));
  const bezEn = cfg.kierunki.filter((k) => !k.en).map((k) => k.pl);
  console.log(`\n${cfg.kierunki.length} kierunków, z planem ${cfg.kierunki.filter((k) => k.maPlan).length}. Zapytania: sieć ${get.stat.siec}, cache ${get.stat.cache}.`);
  if (bezEn.length) console.log("Brak nazwy EN (config/nazwy-en.json): " + bezEn.join(", "));
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main(process.argv.slice(2)).catch((e) => { console.error("BŁĄD:", e.message); process.exit(1); });
}
