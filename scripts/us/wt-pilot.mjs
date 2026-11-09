// Etap 5, pilot WT: 10 losowych zajęć z odczytu skanu porównanych z PDF-em (docs/wt-pilot.md + docs/wt-pilot/NN.png).
//   node scripts/us/wt-pilot.mjs [--plik Plan-TEO-2026-27a.pdf] [--ziarno 5] [--ile 10]
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { pobieracz } from "./wspolne.mjs";
import { semestrZKalendarza } from "./wh-xlsx.mjs";
import { wczytajOdczyt, odczytNaPlany, prostokatWT } from "./wt-pdf.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const plik = arg("--plik", "Plan-TEO-2026-27a.pdf"), ile = +arg("--ile", 10);
let x = +arg("--ziarno", 5); const los = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
const DNI = ["pon.", "wt.", "śr.", "czw.", "pt."];
const z = JSON.parse(fs.readFileSync("config/zrodla-us.json", "utf8")).wydzialy.wt.zrodla.find((q) => q.plik === plik);
const f = await pobieracz({ offline: true }).plik(z.url);
const o = wczytajOdczyt(plik);
if (o.sha256 !== f.sha256) throw new Error("odczyt dotyczy innej wersji pliku");
fs.mkdirSync(".cache/us/pdf", { recursive: true }); fs.writeFileSync(".cache/us/pdf/pilot.pdf", f.buf);
const siatka = JSON.parse(execFileSync("python3", ["-I", "scripts/us/skan_siatka.py", ".cache/us/pdf/pilot.pdf"]).toString("utf8"));
const sem = semestrZKalendarza();
const pula = [...o.zajecia], wyb = [];
while (wyb.length < ile && pula.length) wyb.push(pula.splice(Math.floor(los() * pula.length), 1)[0]);
const wpisy = wyb.map((q) => { const p = Object.values(odczytNaPlany({ ...o, zajecia: [q] }, { kod: "X", sem }))[0]; return Object.values(p.groups)[0].odd[0]; });
fs.mkdirSync("docs/wt-pilot", { recursive: true });
const kom = JSON.stringify(wyb.map((q, i) => [i + 1, ...prostokatWT(q, siatka)]));
execFileSync("python3", ["-I", "-c", `
import json, pymupdf
d = pymupdf.open(".cache/us/pdf/pilot.pdf")
for n, x0, y0, x1, y1 in json.loads('${kom}'):
    d[0].get_pixmap(dpi=220, clip=pymupdf.Rect(x0 - 30, y0 - 3, x1 + 3, y1 + 3)).save("docs/wt-pilot/%02d.png" % n)
`]);
const kol = (q) => { const c = o.kolumny[q.kol]; return `${c.s === 0 ? "" : c.s === 2 ? "II st. " : "I st. "}${c.rok}. rok`; };
const L = [`# Pilot WT (Etap 5): ${ile} losowych zajęć z ${plik}`, "",
  `Wygenerowane ${new Date().toISOString().slice(0, 10)}: \`node scripts/us/wt-pilot.mjs --plik ${plik}\`. Plik to skan (obraz, bez tekstu) – plan pochodzi z odczytu AI \`odczyty/wt/${plik.replace(/\.pdf$/, ".json")}\` (${o.zajecia.length} zajęć), zamienionego na plan przez \`scripts/us/wt-pdf.mjs\`.`,
  "Przy każdym: wycinek PDF-u (kolumna roku × wiersze godzin, z kolumną godzin po lewej) i to, co trafi do planu. Ten plan NIE jest na stronie – czeka w kolejce zatwierdzeń.", ""];
wyb.forEach((q, i) => {
  const w = wpisy[i];
  L.push(`## ${i + 1}. ${kol(q)}, ${DNI[w.d]} ${w.time.join("–")} · ${w.pl}`, "", `![komórka](wt-pilot/${String(i + 1).padStart(2, "0")}.png)`, "",
    "| rok | dzień | godziny | przedmiot | rodzaj | prowadzący | sala | terminy | notka |", "|---|---|---|---|---|---|---|---|---|",
    `| ${kol(q)} | ${DNI[w.d]} | ${w.time.join("–")} | ${w.pl} | ${w.k} | ${w.p || "—"} | ${w.r || "—"} | ${w.dates ? w.dates.map((d) => d.slice(5).split("-").reverse().join(".")).join(", ") : "co tydzień"} | ${w.n || ""} |`, "");
});
fs.writeFileSync("docs/wt-pilot.md", L.join("\n"));
console.log(wyb.map((q, i) => `${kol(q)} ${DNI[wpisy[i].d]} ${wpisy[i].time.join("-")} ${wpisy[i].pl}`).join("\n"));
