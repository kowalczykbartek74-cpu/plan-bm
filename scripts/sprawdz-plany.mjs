// Sprawdzenie planów roczników skryptem (zamiast oglądania): grupy, zajęcia na grupę, typy, sale, DOS, kalendarz.
//   node scripts/sprawdz-plany.mjs [id ...]     kod 1, gdy któryś plan ma błąd
import fs from "node:fs";
import { roczniki } from "./roczniki.mjs";

const wszystkie = [{ id: "wefiz-bm-1-st-2026 (BM)", plik: "plan.json", grupy: ["C111", "C112", "C113"] }, ...roczniki()];
const ids = process.argv.slice(2);
let zle = 0;
console.log("| Rocznik | Grupy | Zajęcia (min–max na grupę) | bez rodzaju | bez sali | DOS | Status |\n|---|---|---|---|---|---|---|");
for (const c of wszystkie.filter((c) => !ids.length || ids.some((i) => c.id.startsWith(i)))) {
  const bledy = [];
  const p = fs.existsSync(c.plik) ? JSON.parse(fs.readFileSync(c.plik, "utf8")) : null;
  if (!p) { console.log(`| ${c.id} | – | – | – | – | – | BRAK PLIKU |`); zle++; continue; }
  const g = Object.entries(p.groups || {});
  const n = g.map(([, v]) => v.odd.length + v.even.length);
  const wpisy = g.flatMap(([, v]) => [...v.odd, ...v.even]);
  for (const x of c.grupy) if (!p.groups?.[x]) bledy.push("brak " + x);
  if (n.some((x) => x < 5)) bledy.push("grupa < 5 zajęć");
  if (!p.kalendarz?.tygodnie?.length) bledy.push("bez kalendarza");
  if (!p.dziekanat?.source) bledy.push("bez DOS");
  if (c.id.includes("(BM)") ? false : p.id !== c.id) bledy.push("id ≠ " + c.id);
  const bezK = wpisy.filter((e) => e.k === "X").length, bezS = wpisy.filter((e) => !e.r).length;
  const dos = (p.dziekanat?.source || "").replace(/^https:\/\/dos\.usz\.edu\.pl\/([^/]+).*$/, "$1");
  if (bledy.length) zle++;
  console.log(`| ${c.id} | ${g.length} | ${n.reduce((a, b) => a + b, 0)} (${Math.min(...n)}–${Math.max(...n)}) | ${bezK} | ${bezS} | ${dos || "–"} | ${bledy.join(", ") || "OK"} |`);
}
if (zle) process.exit(1);
