// Etap 5: plany z PDF przez kolejkę zatwierdzeń Skrótu (zdawalni.pl → Narzędzia starosty → Importy).
// Zasada (spec, pkt 1.5): na stronę idzie tylko plan zatwierdzony przez Bartka. Pierwsza wersja każdego rocznika i każda zmiana
// pliku = szkic w kolejce; przy kolejnej wersji pozycje bez zmian względem zatwierdzonego planu mają od razu decyzję „tak”,
// więc do sprawdzenia zostają tylko różnice.
//
// Baza Skrótu (skrot-bm/supabase/skrot-v50-importy-automat.sql):
//   nauka_import_szkic_automat(p_token, p_wydzial, p_rocznik, p_opis, p_sha, p_nazwa, p_source, p_pozycje) – nowy szkic
//     (token z sekretu PLAN_IMPORT_TOKEN w GitHub Actions; bez tokenu szkic zostaje tylko w .cache/us/szkice/)
//   nauka_import_plan_publiczny(p_rocznik) – zatwierdzony plan {ok, id, sha, source, groups} (z v40, w v50 także sha)
// Pozycja szkicu = format panelu (importy.js → doPlanu): {grupa, tydzien, d, od, do, pl, en, k, p, r, g, n} + daty, pg (v50).
import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const SKROT_DB = { url: "https://zkyxujkdrovfzpasocmv.supabase.co", key: "sb_publishable_lVORMiTz9DlQaekBlfKf3Q_qPbKDHxb" };

function rpc(nazwa, body, { fetchFn = null } = {}) {
  if (fetchFn) return fetchFn(nazwa, body);
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(`${SKROT_DB.url}/rest/v1/rpc/${nazwa}`, { method: "POST", timeout: 30000,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), apikey: SKROT_DB.key, Authorization: `Bearer ${SKROT_DB.key}` } }, (res) => {
      let out = ""; res.setEncoding("utf8"); res.on("data", (c) => (out += c));
      res.on("end", () => (res.statusCode === 200 ? resolve(JSON.parse(out || "null")) : reject(new Error(`HTTP ${res.statusCode}: ${out.slice(0, 200)}`))));
    });
    req.on("timeout", () => req.destroy(new Error("brak odpowiedzi przez 30 s")));
    req.on("error", reject); req.end(data);
  });
}

// plan (groups → odd/even) → pozycje panelu; wpis tygodniowy (w odd i even) = jedna pozycja „oba”
export function naPozycje(groups) {
  const out = [];
  for (const [g, w] of Object.entries(groups)) {
    const klucz = (e) => JSON.stringify(e);
    const odd = new Map(w.odd.map((e) => [klucz(e), e])), even = new Map(w.even.map((e) => [klucz(e), e]));
    const dodaj = (e, tydzien) => out.push({ grupa: g, tydzien, d: e.d, od: (e.time || [])[0] || "", do: (e.time || [])[1] || "", pl: e.pl || "", en: e.en || "",
      k: e.k || "X", p: e.p || "", r: e.r || "", g: e.g || "", n: e.n || "", ...(e.dates ? { daty: e.dates } : {}), ...(e.pg ? { pg: e.pg } : {}) });
    for (const [k, e] of odd) dodaj(e, even.has(k) ? "oba" : "odd");
    for (const [k, e] of even) if (!odd.has(k)) dodaj(e, "even");
  }
  return out;
}
const kluczPoz = (p) => JSON.stringify([p.grupa, p.tydzien, p.d, p.od, p.do, p.pl, p.k, p.p, p.r, p.g, p.n, p.daty || null, p.pg || null]);
// pozycje nowego szkicu z decyzją „tak” dla tych, które są już w zatwierdzonym planie
export function zDecyzjami(pozycje, zatwierdzone) {
  const jest = new Set((zatwierdzone || []).map(kluczPoz));
  return pozycje.map((p) => (jest.has(kluczPoz(p)) ? { ...p, decyzja: "tak" } : p));
}
// zatwierdzony plan z bazy → groups w formacie plan-bm (dates i pg z v50; time zawsze, jak plany z plików)
export function zZatwierdzonego(groups) {
  const out = {};
  for (const [g, w] of Object.entries(groups || {})) {
    out[g] = { odd: [], even: [] };
    for (const l of ["odd", "even"]) for (const e of w[l] || []) {
      const x = { ...e };
      if (x.s != null && x.s < 0) delete x.s;
      if (Array.isArray(x.time)) x.time = x.time.map((t) => String(t).replace(".", ":").padStart(5, "0"));
      out[g][l].push(x);
    }
  }
  return out;
}

// Decyzja dla jednego rocznika z PDF: { status, groups? (gdy wolno zapisać), szkic? }
//   zatwierdzony plan tej samej wersji pliku → zapis (ok / bez zmian)
//   brak zatwierdzonego albo inna wersja → szkic do kolejki, na stronie zostaje poprzedni zatwierdzony plan (o ile był)
export async function przezKolejke(r, { wydzial, token = process.env.PLAN_IMPORT_TOKEN || "", naSucho = false, katalog = ".cache/us/szkice", fetchFn = null, log = () => {} } = {}) {
  let zatw = null;
  try { zatw = await rpc("nauka_import_plan_publiczny", { p_rocznik: r.id }, { fetchFn }); } catch (e) { log(`kolejka: baza nie odpowiada (${e.message})`); }
  if (zatw?.ok && zatw.sha && zatw.sha === r.sha256) return { status: "zatwierdzony", groups: zZatwierdzonego(zatw.groups), zatwierdzony: zatw.zatwierdzony_at };
  const pozycje = zDecyzjami(naPozycje(r.groups), zatw?.ok ? naPozycje(zZatwierdzonego(zatw.groups)) : []);
  const szkic = { wydzial, rocznik: r.id, opis: `${r.kierunek.pl}, ${r.stopien === 0 ? "jm" : r.stopien === 2 ? "II st." : "I st."} ${r.rok}. rok – parser plan-bm`, sha: r.sha256,
    nazwa: path.basename(new URL(r.source).pathname), source: r.source, pozycje };
  const zmian = pozycje.filter((p) => p.decyzja !== "tak").length;
  if (!naSucho) {
    fs.mkdirSync(katalog, { recursive: true });
    fs.writeFileSync(path.join(katalog, `${r.id}.json`), JSON.stringify(szkic, null, 1));
  }
  let wyslany = false, blad = null;
  // sekret wklejony ze spacją, nową linią albo w cudzysłowie → sam token (64 znaki hex z SQL v50)
  token = String(token || "").trim().replace(/^["']|["']$/g, "").trim();
  if (token && !naSucho) {
    try {
      const w = await rpc("nauka_import_szkic_automat", { p_token: token, p_wydzial: wydzial, p_rocznik: r.id, p_opis: szkic.opis, p_sha: r.sha256, p_nazwa: szkic.nazwa, p_source: r.source, p_pozycje: pozycje }, { fetchFn });
      wyslany = !!w?.ok; if (!w?.ok) blad = w?.code || "odmowa bazy";
    } catch (e) { blad = e.message; }
  }
  return { status: "czeka na zatwierdzenie", pozycji: pozycje.length, doDecyzji: zmian, wyslany, blad, poprzedni: zatw?.ok ? zZatwierdzonego(zatw.groups) : null };
}
