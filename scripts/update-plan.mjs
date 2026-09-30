// Pobiera aktualny plan z planyzajec-efz.usz.edu.pl, zapisuje plan.json,
// wstawia dane do index.html i przygotowuje listę zmian (zmiany.md).
// Uruchamiane codziennie przez GitHub Actions. Node 20+, bez zależności.
import fs from "node:fs";
import { parseGroupPage, parseUpdated, SLOTS } from "./parse.mjs";

const BASE = process.env.PLAN_BASE_URL || "https://planyzajec-efz.usz.edu.pl/";
const KIERUNEK = "Business Management";
// Grupy 1. roku BM; skrypt sprawdza też kolejne numery, gdyby uczelnia dodała grupę.
const CANDIDATES = ["C111", "C112", "C113", "C114", "C115", "C116"];
const MIN_ENTRIES = 5;   // mniej zajęć w grupie = podejrzana odpowiedź, nie nadpisujemy planu

const DAYS = ["Pon", "Wt", "Śr", "Czw", "Pt"];
const WEEK = { odd: "nieparzysty", even: "parzysty" };

async function get(path) {
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(BASE + path, { headers: { "User-Agent": "plan-bm (projekt studencki, raz dziennie)" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} dla ${path}`);
      return await res.text();
    } catch (e) { lastErr = e; console.log(`Próba ${i + 1} nieudana: ${e.message}${e.cause ? " (" + (e.cause.code || e.cause.message) + ")" : ""}`); await new Promise(r => setTimeout(r, 5000 * (i + 1))); }
  }
  throw lastErr;
}

function describe(e) {
  const t = e.time ? `${e.time[0]}–${e.time[1]}` : SLOTS[e.s].replace(".", ":").replace("-", "–").replace(".", ":");
  const kind = { W: "wykład", CW: "ćwiczenia", LAB: "laboratorium", K: "konwersatorium", S: "seminarium", X: "" }[e.k] || "";
  return [`${DAYS[e.d]} ${t}`, e.pl + (kind ? ` (${kind})` : "") + (e.g ? `, grupa ${e.g}` : ""), e.p, e.r, e.n].filter(Boolean).join(" · ");
}

function diffGroups(oldG, newG) {
  const lines = [];
  const groups = [...new Set([...Object.keys(oldG || {}), ...Object.keys(newG)])].sort();
  for (const g of groups) {
    if (!newG[g]) { lines.push(`### ${g}\n- grupa zniknęła z planu uczelni`); continue; }
    if (!oldG || !oldG[g]) { lines.push(`### ${g}\n- nowa grupa w planie`); continue; }
    const part = [];
    for (const w of ["odd", "even"]) {
      const o = new Map(oldG[g][w].map(e => [JSON.stringify(e), e]));
      const n = new Map(newG[g][w].map(e => [JSON.stringify(e), e]));
      for (const [k, e] of o) if (!n.has(k)) part.push(`- ➖ **usunięte** (${WEEK[w]}): ${describe(e)}`);
      for (const [k, e] of n) if (!o.has(k)) part.push(`- ➕ **dodane** (${WEEK[w]}): ${describe(e)}`);
    }
    if (part.length) lines.push(`### ${g}\n${part.join("\n")}`);
  }
  return lines.join("\n\n");
}

async function main() {
  const planHtml = await get("plan");
  const updated = parseUpdated(planHtml);

  const groups = {};
  let meta = {};
  for (const g of CANDIDATES) {
    const page = parseGroupPage(await get(`planGrup?numerGrupy=${g}`));
    if (page.empty || page.kierunek !== KIERUNEK) continue;
    const count = page.odd.length + page.even.length;
    if (count === 0) continue;
    if (count < MIN_ENTRIES) throw new Error(`Grupa ${g} ma tylko ${count} zajęć. Nie nadpisuję planu, sprawdź stronę uczelni.`);
    groups[g] = { odd: page.odd, even: page.even };
    meta = { rokAkademicki: page.rokAkademicki, semestr: page.semestr };
  }
  for (const g of ["C111", "C112", "C113"]) {
    if (!groups[g]) throw new Error(`Brak grupy ${g} w odpowiedzi uczelni. Nie nadpisuję planu.`);
  }

  const old = fs.existsSync("plan.json") ? JSON.parse(fs.readFileSync("plan.json", "utf8")) : null;
  const changed = !old || JSON.stringify(old.groups) !== JSON.stringify(groups);
  const now = new Date().toISOString();

  const data = {
    source: BASE,
    kierunek: KIERUNEK,
    rokAkademicki: meta.rokAkademicki,
    semestr: meta.semestr,
    updated,                                   // znacznik z planu uczelni
    changedAt: changed ? now : old.changedAt,  // kiedy skrypt ostatnio wykrył zmianę
    checkedAt: now,                            // ostatnie sprawdzenie
    groups
  };
  fs.writeFileSync("plan.json", JSON.stringify(data, null, 1) + "\n");

  // Kopia danych w index.html, żeby strona działała nawet bez plan.json
  const html = fs.readFileSync("index.html", "utf8");
  const start = "/*PLAN_DATA_START*/", end = "/*PLAN_DATA_END*/";
  const i = html.indexOf(start), j = html.indexOf(end);
  if (i < 0 || j < 0) throw new Error("Brak znaczników danych w index.html");
  fs.writeFileSync("index.html", html.slice(0, i + start.length) + JSON.stringify(data) + html.slice(j));

  let summary = "";
  if (changed && old) {
    summary = `Skrypt wykrył zmiany w planie zajęć 1. roku Business Management.\n\n` +
      `Aktualizacja na stronie uczelni: **${updated || "brak informacji"}**\n\n` +
      diffGroups(old.groups, groups) +
      `\n\nStrona z planem została już zaktualizowana automatycznie. Sprawdź ją i w razie potrzeby daj znać grupie.`;
    fs.writeFileSync("zmiany.md", summary + "\n");
  }
  console.log(changed ? (old ? "ZMIANA w planie:\n" + summary : "Pierwszy zapis planu.") : "Bez zmian w planie.");
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed && !!old}\n`);
}

main().catch(err => {
  const cause = err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : "";
  console.error("BŁĄD:", err.message + cause);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Nie udało się pobrać planu::${err.message}${cause}`);
  process.exit(1);
});
