// Wszystkie roczniki poza BM w jednym miejscu (importer, lista na stronie, komunikaty dziekanatu):
//   1) kierunki/<id>.json (ze Skrótu albo z wefiz-wszystkie.mjs) mają pierwszeństwo,
//   2) config/kierunki-1rok.json (scripts/kierunki-1rok.mjs): każdy kierunek 1. roku z planem i grupami, którego nie ma w kierunki/.
// BM (wefiz-bm-1-st-2026) zostaje osobno: plan.json i własna konfiguracja w update-plan.mjs.
import fs from "node:fs";

export const BM_ID = "wefiz-bm-1-st-2026";
// Sekcja DOS (odwołane zajęcia) po budynku z sal w planie: Mickiewicza 64 to sale „S01”, „N104”, „S0203” (albo dopisek „Mic.64”),
// Cukrowa 8 to „607”, „SIL 315”, „Cuk.8”. Większość sal z Mickiewicza → DOS Mickiewicza, inaczej adres wydziału (Cukrowa).
export const DOS = { mic: "https://dos.usz.edu.pl/mickiewicza/zajecia-mickiewicza/" };

export function zConfigu(k, cfg) {
  return {
    opis: "Z config/kierunki-1rok.json (scripts/roczniki.mjs).",
    id: k.id, kod: k.kod,
    wydzial: { ...(cfg.wydzial || { kod: "WEFiZ" }) },
    kierunek: { kod: k.kierunek, pl: k.pl, en: k.en || k.pl },
    stopien: k.stopien, tryb: k.tryb, nabor: k.nabor, rok: k.rok,
    system: { ...k.system },
    grupy: k.grupy.map((g) => g.nazwa),
    plik: `plan/${k.id}.json`,
    odwolania: ["dos"],
  };
}

export function budynek(plan) {
  const sale = Object.values(plan?.groups || {}).flatMap((g) => [...(g.odd || []), ...(g.even || [])]).map((e) => e.r || "");
  const czyMic = (r) => /Mic/i.test(r) || (!/Cuk/i.test(r) && /^s\.\s*[SN]\d/.test(r));
  const mic = sale.filter(czyMic).length;
  const cuk = sale.filter((r) => !czyMic(r) && (/Cuk/i.test(r) || /^s\.\s*(SIL\s*)?\d/.test(r))).length;
  return mic > cuk ? "mic" : null;
}

export function roczniki({ dir = "kierunki", config = dir === "kierunki" ? "config/kierunki-1rok.json" : null } = {}) {
  const czytaj = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  // Sekcja DOS: pole „dos” z pliku; bez niego grupy „M…” (Kampus Mickiewicza wg „Zestawienia nazw grup” WEFiZ) → DOS Mickiewicza,
  // a gdy grupy nie przesądzają – budynek z sal w planie. Cukrowa = adres wydziału (bez pola).
  const zDos = (c) => {
    if (c.dos) return c;
    const g = c.grupy || [];
    if (g.length && g.every((x) => /^M\d/i.test(x))) return { ...c, dos: DOS.mic };
    if (g.length && g.every((x) => /^C\d/i.test(x))) return c;
    const b = budynek(fs.existsSync(c.plik || "") ? czytaj(c.plik) : null);
    return b ? { ...c, dos: DOS[b] } : c;
  };
  const zPlikow = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => zDos({ ...czytaj(`${dir}/${f}`), _plik: `${dir}/${f}` })) : [];
  const ids = new Set(zPlikow.map((c) => c.id));
  const cfg = config && fs.existsSync(config) ? czytaj(config) : { kierunki: [] };
  const zCfg = cfg.kierunki.filter((k) => k.maPlan && k.grupy.length && k.id !== BM_ID && !ids.has(k.id)).map((k) => {
    return zDos({ ...zConfigu(k, cfg), _plik: config });
  });
  return [...zPlikow, ...zCfg].sort((a, b) => a.id.localeCompare(b.id));
}
