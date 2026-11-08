// Etap 5, pilot WPiA: 10 losowych zajęć z jednego PDF-u porównanych z odczytem parsera (docs/wpia-pilot.md),
// przy każdym wycinek PDF-u z tą komórką (docs/wpia-pilot/NN.png, PyMuPDF).
//   node scripts/us/wpia-pilot.mjs [--wydzial wpia|wnsip] [--plik I-SSP-26.pdf] [--ziarno 5] [--ile 10]
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { pobieracz } from "./wspolne.mjs";
import { pdfNaTekst } from "./wpia-pdf.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const wydz = arg("--wydzial", "wpia"), plik = arg("--plik", "I-SSP-26.pdf"), ile = +arg("--ile", 10);
const { stronaNaZajecia } = await import(`./${wydz}-pdf.mjs`);
const NAZWA = { wpia: "WPiA", wnsip: "WNŚiP", wns: "WNS", wt: "WT" }[wydz] || wydz;
let x = +arg("--ziarno", 5); const los = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
const DNI = ["pon.", "wt.", "śr.", "czw.", "pt."];
const z = JSON.parse(fs.readFileSync("config/zrodla-us.json", "utf8")).wydzialy[wydz].zrodla.find((q) => q.plik === plik);
const f = await pobieracz({ offline: true }).plik(z.url);
const t = pdfNaTekst(f.buf);
const { wpisy } = stronaNaZajecia(t.strony[0]);
const pula = [...wpisy], wyb = [];
while (wyb.length < ile && pula.length) wyb.push(pula.splice(Math.floor(los() * pula.length), 1)[0]);
fs.mkdirSync(`docs/${wydz}-pilot`, { recursive: true });
fs.mkdirSync(".cache/us/pdf", { recursive: true });
fs.writeFileSync(".cache/us/pdf/pilot.pdf", f.buf);
// wycinki komórek: pełny prostokąt komórki z parsera (+ margines)
const kom = JSON.stringify(wyb.map((w, i) => [i + 1, ...w.prostokat]));
execFileSync("python3", ["-I", "-c", `
import json, pymupdf
p = pymupdf.open(".cache/us/pdf/pilot.pdf")[0]
for n, x0, y0, x1, y1 in json.loads('${kom}'):
    p.get_pixmap(dpi=220, clip=pymupdf.Rect(x0 - 3, y0 - 3, x1 + 3, y1 + 3)).save("docs/${wydz}-pilot/%02d.png" % n)
`]);
const L = [`# Pilot ${NAZWA} (Etap 5): ${ile} losowych zajęć z ${plik}`, "",
  `Wygenerowane ${new Date().toISOString().slice(0, 10)}: \`node scripts/us/wpia-pilot.mjs --wydzial ${wydz} --plik ${plik}\`. Parser: \`scripts/us/${wydz}-pdf.mjs\`. Wszystkich zajęć w pliku: ${wpisy.length}.`,
  "Przy każdym: wycinek PDF-u z tą komórką i to, co odczytał parser. Ten plan NIE jest na stronie – czeka w kolejce zatwierdzeń.", ""];
wyb.forEach((w, i) => {
  L.push(`## ${i + 1}. ${DNI[w.d]} ${w.time.join("–")} · ${w.pl}`, "", `![komórka](${wydz}-pilot/${String(i + 1).padStart(2, "0")}.png)`, "",
    "| dzień | godziny | przedmiot | rodzaj | podgrupa | prowadzący | sala | terminy | notka |", "|---|---|---|---|---|---|---|---|---|",
    `| ${DNI[w.d]} | ${w.time.join("–")} | ${w.pl} | ${w.k} | ${w.pg || "cały rok"} | ${w.p || "—"} | ${w.r || "—"} | ${w.daty ? w.daty.map((d) => d.slice(5).split("-").reverse().join(".")).join(", ") : "co tydzień"} | ${w.n || ""} |`, "",
    `Tekst komórki: ${w.tekst}`, "");
});
fs.writeFileSync(`docs/${wydz}-pilot.md`, L.join("\n"));
console.log(wyb.map((w) => `${DNI[w.d]} ${w.time.join("-")} ${w.pl} ${w.pg || ""}`).join("\n"));
