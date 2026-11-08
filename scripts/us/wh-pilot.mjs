// Etap 4, pilot WH: 10 losowych zajęć z plików pilota porównanych z planem (docs/wh-pilot.md) i podgląd arkuszy jako HTML
// (.cache/wh-pilot/<arkusz>.html) do zrzutu „plik obok strony”.
//   node scripts/us/wh-pilot.mjs [--ziarno 42] [--ile 10]
//   node scripts/us/wh-pilot.mjs --bez-pilota --ile 20 --wynik docs/wh-kontrola.md   kontrola pozostałych plików WH
import fs from "node:fs";
import path from "node:path";
import { plikNaRoczniki, semestrZKalendarza } from "./wh-xlsx.mjs";
import { xlsxArkuszeDane, nazwaKomorki, pobieracz } from "./wspolne.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const ziarno = +arg("--ziarno", 42), ile = +arg("--ile", 10), wynik = arg("--wynik", "docs/wh-pilot.md"), bezPilota = process.argv.includes("--bez-pilota");
const PILOT = ["HIST", "FA"];
let x = ziarno; const los = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
const DNI = ["pon.", "wt.", "śr.", "czw.", "pt.", "sob.", "niedz."];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const cfg = JSON.parse(fs.readFileSync("config/wydzialy-us.json", "utf8")).wydzialy.find((w) => w.kod === "wh");
const zr = JSON.parse(fs.readFileSync("config/zrodla-us.json", "utf8")).wydzialy.wh.zrodla;
const ku = JSON.parse(fs.readFileSync("config/kierunki-us.json", "utf8")).wydzialy.wh.kierunki;
const p = pobieracz({ log: () => {} });
const sem = semestrZKalendarza();
const wszystkie = [];
fs.mkdirSync(".cache/wh-pilot", { recursive: true });
for (const z of zr.filter((q) => q.typ === "plan" && q.format === "xlsx" && q.tryb === "st" && !q.pominiety && (bezPilota ? !q.kierunki.some((k) => PILOT.includes(k.kod)) : q.kierunki.some((k) => PILOT.includes(k.kod))))) {
  const f = await p.plik(z.url);
  const { roczniki } = plikNaRoczniki(f.buf, z, ku, { sem });
  for (const r of roczniki) for (const w of r.wpisy) wszystkie.push({ plik: z.plik, url: z.url, arkusz: r.arkusz, id: r.r.id, ...w });
  // podgląd arkuszy: tabela ze scaleniami
  for (const a of xlsxArkuszeDane(f.buf)) {
    const zajete = new Set(), rows = [];
    for (let rr = 0; rr < a.wiersze; rr++) {
      const cells = [];
      for (let c = 0; c < a.kolumny; c++) {
        if (zajete.has(`${c},${rr}`)) continue;
        const m = a.scalenia.find((q) => q[0] === c && q[1] === rr);
        if (m) for (let i = m[0]; i <= m[2]; i++) for (let j = m[1]; j <= m[3]; j++) zajete.add(`${i},${j}`);
        const ref = nazwaKomorki(c, rr), v = a.komorki[ref] || "";
        cells.push(`<td${m ? ` colspan="${m[2] - m[0] + 1}" rowspan="${m[3] - m[1] + 1}"` : ""} data-ref="${ref}"${a.kolory[ref] ? ` style="background:#${a.kolory[ref].slice(2)}"` : ""}>${esc(v)}${v ? `<i>${ref}</i>` : ""}</td>`);
      }
      rows.push(`<tr>${cells.join("")}</tr>`);
    }
    fs.writeFileSync(`.cache/wh-pilot/${a.nazwa.replace(/[^\w.-]+/g, "_")}.html`, `<!doctype html><meta charset="utf-8"><title>${esc(a.nazwa)}</title><style>body{font:11px/1.25 system-ui;margin:8px}table{border-collapse:collapse}td{border:1px solid #bbb;vertical-align:top;padding:2px 3px;min-width:60px;max-width:220px}td i{display:block;color:#888;font-size:9px}td.los{outline:3px solid #e33}</style><h3>${esc(z.plik)} – arkusz ${esc(a.nazwa)}</h3><table>${rows.join("")}</table>`);
  }
}
const wybrane = [];
const pula = [...wszystkie];
while (wybrane.length < ile && pula.length) wybrane.push(pula.splice(Math.floor(los() * pula.length), 1)[0]);
const L = [bezPilota ? `# Kontrola WH (Etap 4): ${ile} losowych zajęć z pozostałych plików` : `# Pilot WH (Etap 4): ${ile} losowych zajęć z pliku i z planu`, "",
  `Wygenerowane ${new Date().toISOString().slice(0, 10)}: \`node scripts/us/wh-pilot.mjs --ziarno ${ziarno}${bezPilota ? ` --bez-pilota --ile ${ile} --wynik ${wynik}` : ""}\`. ${bezPilota ? "Pliki poza pilotem (HIST, FA)" : "Kierunki pilota: " + PILOT.join(", ")}. Wszystkich zajęć: ${wszystkie.length}.`,
  "Kolumna „plik” = tekst komórki dokładnie jak w XLSX (arkusz, komórka); „plan” = to, co trafiło do plan/<id>.json i na stronę.", "",
  ...(bezPilota ? [] : ["## Plik obok strony", "",
  "Lewa strona: arkusz XLSX narysowany jako tabela ze scaleniami (czerwona ramka = komórki z porównania), prawa: plan na stronie w tygodniu 9–13.11 (11.11 – święto).", "",
  "![FA 1. rok I st.](wh-pilot/fa.jpg)", "", "![Historia 1. rok II st.](wh-pilot/hist.jpg)", ""]),
  bezPilota ? "## Jakość odczytu pozostałych plików" : "## Jakość odczytu całego pilota", "",
  `| zajęcia | z notką (dopisek albo terminy nie do odczytania) | rodzaj nieznany (X) | bez prowadzącego | bez sali |`, "|---|---|---|---|---|",
  `| ${wszystkie.length} | ${wszystkie.filter((w) => w.n).length} | ${wszystkie.filter((w) => w.k === "X").length} | ${wszystkie.filter((w) => !w.p).length} | ${wszystkie.filter((w) => !w.r).length} |`, "",
  "Rodzaj „X” = plik nie podaje rodzaju (np. „Technologie informacyjne (15h)”); bez prowadzącego/sali = komórka ich nie ma (np. wykład ogólnouczelniany „zgodnie z wyborem”).", "",
  "## Losowe zajęcia", ""];
wybrane.forEach((w, i) => {
  L.push(`## ${i + 1}. ${w.id} · arkusz „${w.arkusz}” · komórka ${w.komorka}`, "",
    `**Plik:** ${w.tekst}`, "",
    `| dzień | godziny | przedmiot | rodzaj | prowadzący | sala | podgrupa | terminy | notka |`, "|---|---|---|---|---|---|---|---|---|",
    `| ${DNI[w.d]} | ${w.time.join("–")} | ${w.pl} | ${w.k} | ${w.p || "—"} | ${w.r || "—"} | ${w.pg || "cały rok"} | ${w.daty ? `${w.daty.length} dat: ${w.daty.slice(0, 3).join(", ")}${w.daty.length > 3 ? " … " + w.daty.at(-1) : ""}` : "co tydzień"} | ${w.n || ""} |`, "");
});
fs.writeFileSync(wynik, L.join("\n"));
fs.writeFileSync(".cache/wh-pilot/wybrane.json", JSON.stringify(wybrane.map((w) => ({ id: w.id, arkusz: w.arkusz, komorka: w.komorka, d: w.d })), null, 1));
console.log(wybrane.map((w) => `${w.id} ${w.arkusz} ${w.komorka}`).join("\n"));
