// Etap 8: stan planów wszystkich roczników – docs/stan-planow.md (dla Bartka, w repozytorium) i stan.html (na stronie, noindex).
// Każdy rocznik: źródło, ostatni udany import (checkedAt planu), ostatnia zmiana planu (changedAt), liczba zajęć, status
// ze scripts/sprawdz-plany.mjs i ostatniego przebiegu importu (plan/_import.json).
//   node scripts/stan-planow.mjs            zapisuje oba pliki (workflow: po imporcie, przed publikacją)
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { sprawdzWszystkie } from "./sprawdz-plany.mjs";

const czytaj = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const STOP = { 0: "jednolite", 1: "I st.", 2: "II st." };
const KOLEJNOSC = ["WEFiZ", "WKFiZ", "WH", "WPiA", "WNŚiP", "WNS", "WT"];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const data = (iso) => (iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "–");
const rocznik = (x) => `${STOP[x.stopien] ?? ""} ${x.rok}. rok${x.tryb === "nst" ? " nst" : ""}`.trim();
const krotko = (u) => { try { const a = new URL(u); return a.hostname.replace(/^www\./, "") + (a.pathname.length > 1 ? "/…/" + decodeURIComponent(a.pathname.split("/").filter(Boolean).pop()).slice(0, 40) : ""); } catch { return u || "–"; } };
const opisStatusu = (x) => x.status === "OK" ? "OK" : x.status === "uwaga" ? `uwaga: ${x.uwagi.join(", ")}` : x.status === "błąd" ? `błąd: ${[...x.bledy, ...x.uwagi].join(", ")}`
  : x.status === "czeka na zatwierdzenie" ? "czeka na zatwierdzenie (Importy)" : `brak planu${x.uwagi?.length ? ": " + x.uwagi.join(", ") : ""}`;

export function zbierz({ wiersze = sprawdzWszystkie(), importStan = czytaj("plan/_import.json", { roczniki: [] }) } = {}) {
  const st = Object.fromEntries((importStan.roczniki || []).map((r) => [r.id, r]));
  return wiersze.map((x) => ({ ...x, ostatniPrzebieg: st[x.id] ? { status: st[x.id].status, blad: st[x.id].blad || null } : null }))
    .sort((a, b) => (KOLEJNOSC.indexOf(a.wydzial) - KOLEJNOSC.indexOf(b.wydzial)) || String(a.kierunek).localeCompare(String(b.kierunek), "pl") || a.stopien - b.stopien || a.tryb.localeCompare(b.tryb) || a.rok - b.rok);
}

export function podsumowanie(w) {
  const ile = (f) => w.filter(f).length;
  return KOLEJNOSC.filter((wd) => w.some((x) => x.wydzial === wd)).map((wd) => {
    const r = w.filter((x) => x.wydzial === wd);
    return { wydzial: wd, razem: r.length, naStronie: r.filter((x) => x.grupy != null).length, ok: ile((x) => x.wydzial === wd && x.status === "OK"), uwaga: ile((x) => x.wydzial === wd && x.status === "uwaga"),
      czeka: ile((x) => x.wydzial === wd && x.status === "czeka na zatwierdzenie"), brak: ile((x) => x.wydzial === wd && x.status === "brak planu"), blad: ile((x) => x.wydzial === wd && x.status === "błąd") };
  });
}

export function markdown(w, { teraz = new Date().toISOString(), ostatniImport = null } = {}) {
  const p = podsumowanie(w);
  let s = `# Stan planów zajęć – cały US\n\nWygenerowano ${data(teraz)} (\`node scripts/stan-planow.mjs\`). Ostatni przebieg importu: ${data(ostatniImport)}.\n` +
    `Statusy: **OK**; **uwaga** – do obejrzenia, plan jest na stronie; **błąd** – plan na stronie jest wątpliwy (patrz opis); **czeka na zatwierdzenie** – plan z PDF w kolejce Importy (zdawalni.pl), na stronie go nie ma; **brak planu** – nie ma pliku planu.\n\n` +
    `| Wydział | Roczników | Na stronie | OK | uwaga | czeka | brak | błąd |\n|---|---|---|---|---|---|---|---|\n` +
    p.map((x) => `| ${x.wydzial} | ${x.razem} | ${x.naStronie} | ${x.ok} | ${x.uwaga} | ${x.czeka} | ${x.brak} | ${x.blad} |`).join("\n") +
    `\n| **Razem** | ${w.length} | ${w.filter((x) => x.grupy != null).length} | ${p.reduce((a, x) => a + x.ok, 0)} | ${p.reduce((a, x) => a + x.uwaga, 0)} | ${p.reduce((a, x) => a + x.czeka, 0)} | ${p.reduce((a, x) => a + x.brak, 0)} | ${p.reduce((a, x) => a + x.blad, 0)} |\n`;
  for (const wd of p.map((x) => x.wydzial)) {
    s += `\n## ${wd}\n\n| Kierunek | Rocznik | Id | Źródło | Ostatni udany import | Zmiana planu | Zajęć | Status |\n|---|---|---|---|---|---|---|---|\n`;
    for (const x of w.filter((q) => q.wydzial === wd))
      s += `| ${x.kierunek} | ${rocznik(x)} | \`${x.id}\` | ${x.zrodlo ? `[${krotko(x.zrodlo)}](${x.zrodlo})` : "–"} | ${data(x.sprawdzono)} | ${data(x.zmiana)} | ${x.zajec ?? "–"} | ${opisStatusu(x).replace(/\|/g, "/")} |\n`;
  }
  return s;
}

export function html(w, { teraz = new Date().toISOString(), ostatniImport = null } = {}) {
  const p = podsumowanie(w);
  const kolor = { OK: "ok", uwaga: "uw", "błąd": "bl", "czeka na zatwierdzenie": "cz", "brak planu": "br" };
  const tab = p.map((x) => `<tr><td>${esc(x.wydzial)}</td><td>${x.razem}</td><td>${x.naStronie}</td><td>${x.ok}</td><td>${x.uwaga}</td><td>${x.czeka}</td><td>${x.brak}</td><td>${x.blad}</td></tr>`).join("");
  const sekcje = p.map(({ wydzial }) => `<h2>${esc(wydzial)}</h2><div class="t"><table><thead><tr><th>Kierunek</th><th>Rocznik</th><th>Źródło</th><th>Ostatni import</th><th>Zmiana planu</th><th>Zajęć</th><th>Status</th></tr></thead><tbody>` +
    w.filter((x) => x.wydzial === wydzial).map((x) => `<tr><td>${esc(x.kierunek)}</td><td>${esc(rocznik(x))}</td><td>${x.zrodlo ? `<a href="${esc(x.zrodlo)}" rel="nofollow">${esc(krotko(x.zrodlo))}</a>` : "–"}</td><td>${esc(data(x.sprawdzono))}</td><td>${esc(data(x.zmiana))}</td><td>${x.zajec ?? "–"}</td><td><span class="s ${kolor[x.status] || ""}">${esc(opisStatusu(x))}</span></td></tr>`).join("") +
    `</tbody></table></div>`).join("");
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Stan planów zajęć · Zdawalni</title>
<style>
:root{--bg:#F5F8F6;--surface:#fff;--ink:#16231B;--muted:#5A6B61;--line:#E1E9E4;--ok:#1F7A4A;--uw:#9A6400;--bl:#B3261E;--cz:#2F5FA8;--br:#5A6B61}
@media (prefers-color-scheme:dark){:root{--bg:#101712;--surface:#18221B;--ink:#E7EFEA;--muted:#9DB0A5;--line:#2A3830;--ok:#6FD39B;--uw:#E9B85C;--bl:#FF8A80;--cz:#8DB4F0;--br:#9DB0A5}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;padding:20px 16px 40px}
main{max-width:1180px;margin:0 auto}h1{font-size:24px;margin:0 0 6px}h2{font-size:18px;margin:28px 0 8px}p{color:var(--muted);margin:4px 0}
.t{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--surface)}table{border-collapse:collapse;width:100%;font-size:13.5px}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600;white-space:nowrap}tr:last-child td{border-bottom:0}
a{color:var(--cz)}.s{font-weight:600}.s.ok{color:var(--ok)}.s.uw{color:var(--uw)}.s.bl{color:var(--bl)}.s.cz{color:var(--cz)}.s.br{color:var(--br);font-weight:500}
</style></head><body><main>
<h1>Stan planów zajęć</h1>
<p>Niezależny projekt, plany z oficjalnych stron wydziałów. Wygenerowano ${esc(data(teraz))}; ostatni przebieg importu: ${esc(data(ostatniImport))}. <a href="./">← Plan zajęć</a></p>
<p>„Czeka na zatwierdzenie” = plan z PDF przeczytany automatycznie, na stronę trafi po sprawdzeniu.</p>
<h2>Podsumowanie</h2><div class="t"><table><thead><tr><th>Wydział</th><th>Roczników</th><th>Na stronie</th><th>OK</th><th>Uwaga</th><th>Czeka</th><th>Brak</th><th>Błąd</th></tr></thead><tbody>${tab}</tbody></table></div>
${sekcje}
</main></body></html>
`;
}

function main() {
  const w = zbierz(), imp = czytaj("plan/_import.json", {});
  const opcje = { ostatniImport: imp.at || null };
  fs.writeFileSync("docs/stan-planow.md", markdown(w, opcje));
  fs.writeFileSync("stan.html", html(w, opcje));
  const p = podsumowanie(w);
  console.log(`Zapisano docs/stan-planow.md i stan.html: ${w.length} roczników, na stronie ${w.filter((x) => x.grupy != null).length}, błędów ${p.reduce((a, x) => a + x.blad, 0)}.`);
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
