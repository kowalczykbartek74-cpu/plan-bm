// Pobieranie stron planyzajec-efz.usz.edu.pl: najwyżej 1 zapytanie na sekundę i cache w .cache/efz/.
// Cache jest ważny, dopóki strona startowa uczelni pokazuje tę samą „Aktualizacja planu”; po zmianie znika w całości.
// Strona startowa („plan”) jest pobierana zawsze (to jedno zapytanie mówi, czy cokolwiek się zmieniło).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseUpdated } from "./parse.mjs";

export const BASE = process.env.PLAN_BASE_URL || "https://planyzajec-efz.usz.edu.pl/";
const UA = "plan-bm (projekt studencki, plany kierunkow WEFiZ, 1 zapytanie/s; skrotbm@outlook.com)";

const klucz = (p) => p.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 80) + "-" + crypto.createHash("sha1").update(p).digest("hex").slice(0, 10);

// fetchFn i pauzaMs do testów; zwraca get(path) → tekst HTML albo null (brak strony / przekierowanie) i statystyki
export function uczelnia({ dir = ".cache/efz", fetchFn = fetch, pauzaMs = 1100, base = BASE, log = () => {} } = {}) {
  const stat = { siec: 0, cache: 0 };
  let ostatnie = 0, gotowy = null;
  const zSieci = async (p) => {
    for (let i = 0; i < 3; i++) {
      const czekaj = ostatnie + pauzaMs - Date.now();
      if (czekaj > 0) await new Promise((r) => setTimeout(r, czekaj));
      ostatnie = Date.now(); stat.siec++;
      try {
        const r = await fetchFn(base + p, { headers: { "User-Agent": UA }, redirect: "manual" });
        if (r.status >= 300 && r.status < 500) return null;
        if (r.ok) return await r.text();
      } catch { /* ponów */ }
      if (pauzaMs) await new Promise((r) => setTimeout(r, 15000));
    }
    throw new Error("brak odpowiedzi uczelni: " + p);
  };
  const przygotuj = async () => {
    const start = await zSieci("plan");
    const akt = parseUpdated(start || "") || "?";
    const meta = path.join(dir, "_aktualizacja.txt");
    const stara = fs.existsSync(meta) ? fs.readFileSync(meta, "utf8") : null;
    if (stara !== akt) { fs.rmSync(dir, { recursive: true, force: true }); log(`cache: nowa „Aktualizacja planu” (${akt}), pobieram od nowa`); }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(meta, akt);
    return { start, akt };
  };
  const get = async (p) => {
    gotowy ||= przygotuj();
    const { start } = await gotowy;
    if (p === "plan") return start;
    const f = path.join(dir, klucz(p) + ".html");
    if (fs.existsSync(f)) { stat.cache++; const t = fs.readFileSync(f, "utf8"); return t === "\u0000brak" ? null : t; }
    const t = await zSieci(p);
    fs.writeFileSync(f, t === null ? "\u0000brak" : t);
    return t;
  };
  get.stat = stat;
  get.aktualizacja = async () => (await (gotowy ||= przygotuj())).akt;
  return get;
}
