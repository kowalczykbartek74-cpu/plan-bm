// Zatwierdzony plan zajęć z kolejki importów Skrótu (skrotbm.pl → Narzędzia starosty → Importy, etap 14 „Systemy z Zdawalni
// w Skrócie”): administrator wgrywa PDF z planem, AI robi szkic, a do bazy trafia dopiero plan zatwierdzony pozycja po pozycji.
// Czyta go publiczna funkcja bazy Skrótu nauka_import_plan_publiczny(rocznik) (skrot-bm/supabase/skrot-v40-importy.sql),
// tak samo jak dziekanat.mjs czyta odwołania z Teams (nauka_odwolania_publiczne).
//
// Plan ze strony uczelni ma pierwszeństwo: z importu bierzemy tylko grupy, których strona uczelni nie podaje
// (np. nowa grupa albo kierunek, którego planu nie ma na planyzajec-efz.usz.edu.pl). Bez zatwierdzonego importu,
// bez sieci albo przed uruchomieniem v40 wszystko działa jak dotąd.
// Test bez internetu: node scripts/update-plan.mjs … --import-file odpowiedz.json  (odpowiedź funkcji bazy)
import fs from "node:fs";
import https from "node:https";

// Adres i klucz publishable bazy Skrótu są publiczne z założenia (te same są w skrot-bm/skrot-supabase.js i w dziekanat.mjs).
const SKROT_DB = { url: "https://zkyxujkdrovfzpasocmv.supabase.co", key: "sb_publishable_lVORMiTz9DlQaekBlfKf3Q_qPbKDHxb" };
export const ROCZNIK = process.env.PLAN_ROCZNIK || "wefiz-bm-1-st-2026";

function postJson(url, body, headers) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(url, { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), ...headers }, timeout: 30000 }, res => {
      let out = ""; res.setEncoding("utf8"); res.on("data", c => out += c);
      res.on("end", () => (res.statusCode === 200 ? resolve(JSON.parse(out || "null")) : reject(new Error(`HTTP ${res.statusCode}: ${out.slice(0, 200)}`))));
    });
    req.on("timeout", () => req.destroy(new Error("brak odpowiedzi przez 30 s")));
    req.on("error", reject); req.end(data);
  });
}

// { ok, id, zatwierdzony_at, source, groups } albo null (brak zatwierdzonego planu, brak sieci, brak v40).
export async function fetchImportPlan({ file = null, offline = false, rocznik = ROCZNIK } = {}) {
  try {
    const r = file ? JSON.parse(fs.readFileSync(file, "utf8"))
      : offline ? null
      : await postJson(`${SKROT_DB.url}/rest/v1/rpc/nauka_import_plan_publiczny`, { p_rocznik: rocznik }, { apikey: SKROT_DB.key, Authorization: `Bearer ${SKROT_DB.key}` });
    return r && r.ok && r.groups && typeof r.groups === "object" ? r : null;
  } catch (e) {
    console.log(`Plan z importu (Skrót): baza nie odpowiada (${e.message}). Plan tylko ze strony uczelni.`);
    return null;
  }
}

// Jedna pozycja planu w formacie plan.json (te same pola i kolejność co parse.mjs). Zła pozycja → null.
const KEYS = ["d", "s", "time", "pl", "en", "k", "g", "p", "r", "tag", "dates", "n", "x"];
function entry(e) {
  if (!e || !Number.isInteger(e.d) || e.d < 0 || e.d > 6 || !Number.isInteger(e.s) || e.s < -1 || e.s > 12 || typeof e.pl !== "string" || !e.pl.trim()) return null;
  if (e.s === -1 && !(Array.isArray(e.time) && e.time.length === 2 && e.time.every(t => /^\d{1,2}:\d{2}$/.test(t)))) return null;
  const o = {};
  for (const k of KEYS) if (e[k] !== undefined && e[k] !== "") o[k] = typeof e[k] === "string" ? e[k].slice(0, 300) : e[k];
  return o;
}

// Dokłada do groups (plan ze strony uczelni) grupy z zatwierdzonego importu, których tam nie ma. Zwraca nazwy dodanych grup.
export function mergeImportPlan(groups, imp) {
  const dodane = [];
  if (!imp?.groups) return dodane;
  for (const [g, w] of Object.entries(imp.groups)) {
    if (!/^[A-Z0-9-]{2,20}$/.test(g) || groups[g] || !w) continue;
    const odd = (Array.isArray(w.odd) ? w.odd : []).map(entry).filter(Boolean);
    const even = (Array.isArray(w.even) ? w.even : []).map(entry).filter(Boolean);
    if (!odd.length && !even.length) continue;
    groups[g] = { odd, even };
    dodane.push(g);
  }
  return dodane;
}
