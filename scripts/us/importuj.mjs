// Etap 2 planu całego US: uruchamianie importerów planów wydziałów spoza systemu WEFiZ (XLSX, PDF, aplikacja WKFiZ).
//
//   node scripts/us/importuj.mjs --wydzial wkfiz                  import jednego wydziału, zapis plan/<id>.json
//   node scripts/us/importuj.mjs --wydzial wh --tylko <id,id>     tylko te roczniki
//   node scripts/us/importuj.mjs --wydzial wh --na-sucho          nic nie zapisuje, wypisuje wynik
//   node scripts/us/importuj.mjs --wszystkie                       wszystkie wydziały z importerem (to samo woła update-plan.mjs --wszystkie)
//
// Importer wydziału: plik scripts/us/<importer> z config/wydzialy-us.json (pole „importer”, np. "wkfiz.mjs").
// Wydział bez importera jest pomijany (Etapy 3–5 dokładają je po kolei). Importer eksportuje:
//   export async function importuj({ wydzial, zrodla, kierunki, pobieracz, log, naSucho })
//     → [{ id, kod, kierunek: {pl, en}, stopien, tryb, rok, groups, source, wersja, sha256?, rokAkademicki?, semestr?, zatwierdzenie? }]
//   zatwierdzenie: true = plan z PDF/AI → nie trafia na stronę, status „czeka na zatwierdzenie” (kolejka Importy w zdawalni.pl).
// Błąd jednego wydziału albo rocznika nie blokuje reszty; przy błędzie zostaje poprzedni plan (scripts/us/wspolne.mjs → zapiszPlan).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { pobieracz as nowyPobieracz, zapiszPlan } from "./wspolne.mjs";

const TU = path.dirname(fileURLToPath(import.meta.url));
const czytaj = (f, d = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d);

// Statusy w plan/_import.json: ok / bez zmian / czeka na zatwierdzenie / błąd (szczegóły w „szczegoly”)
export const statusOgolny = (s) => (s === "błąd" ? "błąd" : s === "czeka na zatwierdzenie" ? "czeka na zatwierdzenie" : /^bez zmian/.test(s) ? "bez zmian" : "ok");

export async function importujWydzial(kod, { tylko = null, naSucho = false, log = console.log, pobieracz = null, katalogImporterow = TU, planDir = "plan",
  wydzialy = czytaj("config/wydzialy-us.json", { wydzialy: [] }), zrodla = czytaj("config/zrodla-us.json", { wydzialy: {} }),
  kierunki = czytaj("config/kierunki-us.json", { wydzialy: {} }), teraz = new Date().toISOString() } = {}) {
  const w = wydzialy.wydzialy.find((x) => x.kod === kod);
  if (!w) throw new Error(`nieznany wydział: ${kod} (config/wydzialy-us.json)`);
  if (!w.importer) return { wydzial: kod, pominiety: "brak importera", stan: [] };
  const plik = path.join(katalogImporterow, w.importer);
  if (!fs.existsSync(plik)) return { wydzial: kod, pominiety: `brak pliku ${w.importer}`, stan: [] };
  const mod = await import(pathToFileURL(plik).href);
  const stan = [];
  let wyniki;
  try {
    wyniki = await mod.importuj({ wydzial: w, zrodla: zrodla.wydzialy[kod]?.zrodla || [], kierunki: kierunki.wydzialy[kod]?.kierunki || [],
      pobieracz: pobieracz || nowyPobieracz({ log }), log, naSucho });
  } catch (e) {
    return { wydzial: kod, blad: e.message, stan: [{ id: `${kod}-*`, wydzial: kod, status: "błąd", szczegoly: "importer", blad: e.message }] };
  }
  for (const r of wyniki || []) {
    if (tylko && !tylko.includes(r.id)) continue;
    const wpis = { id: r.id, wydzial: kod, zrodlo: r.source || null, wersja: r.wersja || null };
    try {
      if (r.blad) throw new Error(r.blad);
      const meta = { source: r.source, wersja: r.wersja, sha256: r.sha256, kierunek: r.kierunek.pl, kierunekEn: r.kierunek.en || r.kierunek.pl,
        id: r.id, kod: r.kod, wydzial: w.skrot, rok: r.rok, stopien: r.stopien, tryb: r.tryb,
        ...(r.rokAkademicki ? { rokAkademicki: r.rokAkademicki } : {}), ...(r.semestr ? { semestr: r.semestr } : {}) };
      const z = zapiszPlan(path.join(planDir, `${r.id}.json`), r.groups, meta, { teraz, naSucho, czekaNaZatwierdzenie: !!r.zatwierdzenie });
      stan.push({ ...wpis, status: statusOgolny(z.status), szczegoly: z.status, grupy: z.grupy, zajec: z.zajec, ...(z.blad ? { blad: z.blad } : {}),
        ...(r.kolejka ? { kolejka: r.kolejka } : {}) });
    } catch (e) { stan.push({ ...wpis, status: "błąd", blad: e.message }); }
  }
  return { wydzial: kod, stan };
}

// Wszystkie wydziały z config/zrodla-us.json (poza WEFiZ, który ma własny import w update-plan.mjs)
export async function importujWszystkie(opcje = {}) {
  const zrodla = opcje.zrodla || czytaj("config/zrodla-us.json", { wydzialy: {} });
  const stan = [], log = opcje.log || console.log;
  for (const kod of Object.keys(zrodla.wydzialy).filter((k) => k !== "wefiz")) {
    const r = await importujWydzial(kod, { ...opcje, zrodla });
    if (r.pominiety) { log(`${kod}: pominięty (${r.pominiety})`); continue; }
    stan.push(...r.stan);
  }
  return stan;
}

async function main(argv) {
  const wi = argv.indexOf("--wydzial"), ti = argv.indexOf("--tylko");
  const tylko = ti >= 0 ? argv[ti + 1].split(",") : null, naSucho = argv.includes("--na-sucho");
  const stan = argv.includes("--wszystkie") ? await importujWszystkie({ tylko, naSucho })
    : wi >= 0 ? (await importujWydzial(argv[wi + 1], { tylko, naSucho })).stan : null;
  if (!stan) { console.error("Użycie: node scripts/us/importuj.mjs --wydzial <kod> [--tylko id,id] [--na-sucho] | --wszystkie"); process.exit(2); }
  for (const s of stan) console.log(`${s.id}: ${s.status}${s.szczegoly && s.szczegoly !== s.status ? ` (${s.szczegoly})` : ""}${s.grupy != null ? `, grup ${s.grupy}, zajęć ${s.zajec}` : ""}${s.kolejka ? `, do decyzji ${s.kolejka.doDecyzji}/${s.kolejka.pozycji}${s.kolejka.wyslany ? ", wysłany do kolejki" : s.kolejka.blad ? ", kolejka: " + s.kolejka.blad : ", szkic lokalnie (bez PLAN_IMPORT_TOKEN)"}` : ""}${s.blad ? " — " + s.blad : ""}`);
  if (naSucho) console.log("Na sucho: nic nie zapisane.");
  if (stan.some((s) => s.status === "błąd")) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main(process.argv.slice(2)).catch((e) => { console.error("BŁĄD:", e.message); process.exit(1); });
