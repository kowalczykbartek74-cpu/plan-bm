// Sprawdzenie planów roczników skryptem (zamiast oglądania): BM, WEFiZ (kierunki/ + config/kierunki-1rok.json) i cały US
// (config/kierunki-us.json, Etap 8). Format planu, grupy, rodzaje, sale, daty zjazdów, DOS, kalendarz.
//   node scripts/sprawdz-plany.mjs [id ...]     tabela; kod 1, gdy któryś plan ma błąd
//   node scripts/sprawdz-plany.mjs --json       to samo jako JSON (scripts/stan-planow.mjs)
// Status: OK / uwaga (do obejrzenia, nie blokuje) / błąd / czeka na zatwierdzenie (plan z PDF w kolejce Importy) / brak planu.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { roczniki } from "./roczniki.mjs";
import { waliduj } from "./us/wspolne.mjs";
import { semestrZKalendarza } from "./us/wh-xlsx.mjs";

const czytaj = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const SKROT = { wefiz: "WEFiZ", wkfiz: "WKFiZ", wh: "WH", wns: "WNS", wnsip: "WNŚiP", wpia: "WPiA", wt: "WT" };

// lista roczników: BM, potem roczniki() (WEFiZ ze Skrótu i konfiguracji), potem US z inwentarza (bez powtórzeń)
export function wszystkieRoczniki({ us = czytaj("config/kierunki-us.json", { wydzialy: {} }), wydzialy = czytaj("config/wydzialy-us.json", { wydzialy: [] }) } = {}) {
  const out = [{ id: "wefiz-bm-1-st-2026", bm: true, plik: "plan.json", grupy: ["C111", "C112", "C113"], wydzial: "WEFiZ", kierunek: "Business Management", stopien: 1, rok: 1, tryb: "st", stary: true }];
  for (const c of roczniki()) out.push({ id: c.id, plik: c.plik, grupy: c.grupy || [], wydzial: c.wydzial?.kod || "WEFiZ", kierunek: c.kierunek?.pl, stopien: c.stopien, rok: c.rok, tryb: c.tryb, stary: true });
  const jest = new Set(out.map((x) => x.id));
  for (const [kod, w] of Object.entries(us.wydzialy || {})) {
    const pdf = ["wns-pdf.mjs", "wnsip-pdf.mjs", "wpia-pdf.mjs", "wt-pdf.mjs"].includes(wydzialy.wydzialy?.find((x) => x.kod === kod)?.importer);
    for (const k of w.kierunki || []) for (const r of k.roczniki || []) {
      if (jest.has(r.id)) continue;
      jest.add(r.id);
      out.push({ id: r.id, plik: `plan/${r.id}.json`, grupy: [], wydzial: SKROT[kod] || kod, kierunek: k.pl, stopien: r.stopien, rok: r.rok, tryb: r.tryb, zrodlo: r.zrodlo, pdf });
    }
  }
  return out;
}

// jeden rocznik → wiersz raportu
export function sprawdzRocznik(c, { sem = semestrZKalendarza(), importStan = {}, szkice = ".cache/us/szkice" } = {}) {
  const p = czytaj(c.plik);
  const st = importStan[c.id];
  const baza = { id: c.id, wydzial: c.wydzial, kierunek: c.kierunek, stopien: c.stopien, rok: c.rok, tryb: c.tryb, plik: c.plik };
  if (!p) {
    const czeka = st?.status === "czeka na zatwierdzenie" || (c.pdf && fs.existsSync(`${szkice}/${c.id}.json`));
    if (czeka || c.pdf) return { ...baza, status: czeka ? "czeka na zatwierdzenie" : "brak planu", zrodlo: st?.zrodlo || c.zrodlo || null, uwagi: czeka ? [] : [st?.blad || "plan z PDF – jeszcze bez szkicu w kolejce"] };
    return { ...baza, status: c.stary ? "błąd" : "brak planu", zrodlo: st?.zrodlo || c.zrodlo || null, uwagi: [st?.blad || "brak pliku planu"] };
  }
  const bledy = [], uwagi = [];
  const g = Object.entries(p.groups || {});
  const n = g.map(([, v]) => (v.odd?.length || 0) + (v.even?.length || 0));
  // zajęcia z datami są w obu listach (odd i even) – liczymy raz
  const wpisy = g.flatMap(([, v]) => [...(v.odd || []), ...(v.even || []).filter((e) => !e.dates)]);
  bledy.push(...waliduj(p).slice(0, 3));
  for (const x of c.grupy || []) if (!p.groups?.[x]) bledy.push("brak " + x);
  if (!c.bm && p.id && p.id !== c.id) bledy.push("id ≠ " + c.id);
  if (c.stary) {   // dotychczasowe wymagania BM i WEFiZ: własny kalendarz roku i sekcja DOS
    if (!p.kalendarz?.tygodnie?.length) bledy.push("bez kalendarza");
    if (!p.dziekanat?.source) bledy.push("bez DOS");
  }
  if (n.some((x) => x < (c.stary ? 5 : 2))) (c.stary ? bledy : uwagi).push("grupa z bardzo małą liczbą zajęć");
  if (c.tryb === "nst") {
    const bez = wpisy.filter((e) => !e.dates?.length).length;
    if (bez) bledy.push(`${bez} zajęć zjazdowych bez dat`);
  }
  const daty = [...new Set(wpisy.flatMap((e) => e.dates || []))].sort();
  const poza = daty.filter((d) => d < sem.od || d > sem.do);
  if (poza.length) (poza.length > daty.length / 2 ? bledy : uwagi).push(`${poza.length} dat poza semestrem (${poza[0]})`);
  const bezK = wpisy.filter((e) => e.k === "X").length, bezS = wpisy.filter((e) => !e.r).length;
  if (wpisy.length && bezS > wpisy.length / 2) uwagi.push("ponad połowa zajęć bez sali");
  const dos = (p.dziekanat?.source || "").replace(/^https:\/\/dos\.usz\.edu\.pl\/([^/]+).*$/, "$1");
  return { ...baza, status: bledy.length ? "błąd" : uwagi.length ? "uwaga" : "OK", zrodlo: p.source || st?.zrodlo || null, wersja: p.wersja || null,
    zmiana: p.changedAt || null, sprawdzono: p.checkedAt || null, grupy: g.length, zajec: wpisy.length, minNaGrupe: n.length ? Math.min(...n) : 0, maxNaGrupe: n.length ? Math.max(...n) : 0,
    bezRodzaju: bezK, bezSali: bezS, dni: daty.length, dos: dos || null, bledy, uwagi };
}

export function sprawdzWszystkie({ ids = [], ...opcje } = {}) {
  const st = czytaj("plan/_import.json", { roczniki: [] });
  const importStan = Object.fromEntries((st.roczniki || []).map((r) => [r.id, r]));
  return wszystkieRoczniki().filter((c) => !ids.length || ids.some((i) => c.id.startsWith(i))).map((c) => sprawdzRocznik(c, { importStan, ...opcje }));
}

function main(argv) {
  const json = argv.includes("--json"), ids = argv.filter((a) => !a.startsWith("--"));
  const w = sprawdzWszystkie({ ids });
  if (json) { console.log(JSON.stringify(w, null, 1)); return w.some((x) => x.status === "błąd") ? 1 : 0; }
  console.log("| Rocznik | Grupy | Zajęcia (min–max na grupę) | bez rodzaju | bez sali | DOS | Status |\n|---|---|---|---|---|---|---|");
  for (const x of w) {
    if (x.grupy == null) { console.log(`| ${x.id} | – | – | – | – | – | ${x.status.toUpperCase()}${x.uwagi.length ? ": " + x.uwagi.join(", ") : ""} |`); continue; }
    const s = x.status === "OK" ? "OK" : `${x.status}: ${[...x.bledy, ...x.uwagi].join(", ")}`;
    console.log(`| ${x.id} | ${x.grupy} | ${x.zajec} (${x.minNaGrupe}–${x.maxNaGrupe}) | ${x.bezRodzaju} | ${x.bezSali} | ${x.dos || "–"} | ${s} |`);
  }
  const ile = (s) => w.filter((x) => x.status === s).length;
  console.error(`Roczników: ${w.length}; OK ${ile("OK")}, uwaga ${ile("uwaga")}, czeka na zatwierdzenie ${ile("czeka na zatwierdzenie")}, brak planu ${ile("brak planu")}, błąd ${ile("błąd")}.`);
  return ile("błąd") ? 1 : 0;
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(main(process.argv.slice(2)));
