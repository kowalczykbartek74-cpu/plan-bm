// Etap 8: sitemap.xml i robots.txt dla plan.skrotbm.pl – adres każdego rocznika na stronie (?k=<kod>; fragment #/… Google pomija).
// lastmod = ostatnia zmiana planu (changedAt). Uruchamiane w workflow po scripts/kierunki.mjs.
//   node scripts/sitemap.mjs [--sprawdz]
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { wszystkie } from "./kierunki.mjs";

export const ADRES = "https://plan.skrotbm.pl/";
const czytaj = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const dzien = (iso) => (iso ? String(iso).slice(0, 10) : null);

export function adresy({ roczniki = wszystkie(), bm = czytaj("plan.json") } = {}) {
  const out = [{ loc: ADRES, lastmod: dzien(bm?.changedAt) }];
  for (const r of roczniki) {
    if (!r.kod || !fs.existsSync(r.plik || `plan/${r.id}.json`)) continue;
    const p = czytaj(r.plik || `plan/${r.id}.json`);
    out.push({ loc: `${ADRES}?k=${encodeURIComponent(r.kod)}`, lastmod: dzien(p?.changedAt) });
  }
  return [...new Map(out.map((u) => [u.loc, u])).values()];
}

export const sitemap = (u) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  u.map((x) => `  <url><loc>${x.loc.replace(/&/g, "&amp;")}</loc>${x.lastmod ? `<lastmod>${x.lastmod}</lastmod>` : ""}</url>`).join("\n") + `\n</urlset>\n`;
// stan.html nie jest blokowany w robots.txt – ma <meta name="robots" content="noindex">, którą Google musi móc przeczytać
export const robots = () => `User-agent: *\nAllow: /\n\nSitemap: ${ADRES}sitemap.xml\n`;

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const u = adresy(), xml = sitemap(u), rob = robots();
  if (process.argv.includes("--sprawdz")) {
    const ok = fs.existsSync("sitemap.xml") && fs.readFileSync("sitemap.xml", "utf8") === xml;
    console.log(ok ? "sitemap.xml aktualny." : "sitemap.xml nieaktualny (node scripts/sitemap.mjs)"); process.exit(ok ? 0 : 1);
  }
  fs.writeFileSync("sitemap.xml", xml); fs.writeFileSync("robots.txt", rob);
  console.log(`Zapisano sitemap.xml (${u.length} adresów) i robots.txt.`);
}
