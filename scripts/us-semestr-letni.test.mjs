// Etap 8: próba generalna semestru letniego na atrapie (docs/semestr-letni.md). Strona wydziału WH z „nowymi” nazwami plików
// (semestr letni) obok zimowych, kalendarz.json z tygodniami lata, import bez sieci: pliki letnie wygrywają z zimowymi, plan
// stacjonarny dostaje „semestr: letni”, a plik niestacjonarny z datami zimowymi pod letnią nazwą jest odrzucany (zostaje stary plan).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { zrodlaWH, obowiazujace, semestrPliku } from "./us/zrodla.mjs";
import { semestrZKalendarza } from "./us/wh-xlsx.mjs";

const FIX = new URL("./fixtures/", import.meta.url);
const plik = (f) => fs.readFileSync(new URL(f, FIX));
const BAZA = "https://hum.usz.edu.pl/wp-content/uploads/";
const ZIMA_HIST = "HIST-I-i-II-st.-plan-zajec-semestr-zimowy-2026_2027-zm.-09-X-2026.xlsx";
const LATO_HIST = "HIST-I-i-II-st.-plan-zajec-semestr-letni-2026_2027.xlsx";   // bez daty zmiany w nazwie – i tak wygrywa
const LATO_FA_NST = "FA-I-i-II-st.-niestacjonarne-plan-zajec-semestr-letni-2026_2027.xlsx";
const strona = (pliki) => `<html><body><h2>Plany zajęć</h2>${pliki.map((p) => `<p><a href="${BAZA}${p}">${p}</a></p>`).join("")}</body></html>`;

// kalendarz z tygodniami obu semestrów (lato: 1.03–25.06.2027)
function kalendarz(dir) {
  const k = JSON.parse(fs.readFileSync("kalendarz.json", "utf8"));
  const lato = [];
  for (let d = new Date("2027-03-01T12:00:00Z"), i = 0; d <= new Date("2027-06-21T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 7), i++) {
    const pt = new Date(d); pt.setUTCDate(pt.getUTCDate() + 4);
    lato.push([d.toISOString().slice(0, 10), pt.toISOString().slice(0, 10), i % 2 ? "even" : "odd"]);
  }
  fs.writeFileSync(path.join(dir, "kalendarz.json"), JSON.stringify({ ...k, tygodnie: [...k.tygodnie, ...lato] }));
}

test("semestr z kalendarza i z nazwy pliku", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lato-"));
  kalendarz(dir);
  const f = path.join(dir, "kalendarz.json");
  assert.equal(semestrZKalendarza(f, { teraz: new Date("2026-11-09") }).nazwa, "zimowy");
  assert.equal(semestrZKalendarza(f, { teraz: new Date("2027-02-10") }).nazwa, "zimowy", "sesja zimowa – jeszcze zima");
  assert.deepEqual(semestrZKalendarza(f, { teraz: new Date("2027-02-26") }), { od: "2027-03-01", do: "2027-06-25", nazwa: "letni" });
  assert.deepEqual([semestrPliku(LATO_HIST), semestrPliku(ZIMA_HIST), semestrPliku("HIST-I-st.-plan.xlsx")], ["letni", "zimowy", null]);
});

test("strona wydziału z plikami obu semestrów: obowiązują letnie, zimowe pominięte", () => {
  const odNowa = (l) => l.map(({ pominiety, powod, ...x }) => x);   // zrodlaWH wybiera już wg kalendarza repozytorium (teraz zima)
  const z = odNowa(zrodlaWH(strona([ZIMA_HIST, LATO_HIST, LATO_FA_NST]), "st", BAZA));
  obowiazujace(z, { semestr: "letni" });
  const hist = z.filter((x) => x.kierunki.some((k) => k.skrot === "HIST"));
  assert.deepEqual(hist.map((x) => [x.plik, !!x.pominiety]), [[ZIMA_HIST, true], [LATO_HIST, false]]);
  // zimą ten sam zestaw → obowiązuje zimowy
  const z2 = odNowa(zrodlaWH(strona([ZIMA_HIST, LATO_HIST]), "st", BAZA)); obowiazujace(z2, { semestr: "zimowy" });
  assert.equal(z2.find((x) => !x.pominiety).plik, ZIMA_HIST);
});

test("import na atrapie: plan stacjonarny „letni”, niestacjonarny z datami zimowymi odrzucony", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lato-"));
  kalendarz(dir);
  const pliki = { [BAZA + LATO_HIST]: plik("wh/HIST-I-i-II-st.xlsx"), [BAZA + LATO_FA_NST]: plik("wh-nst/FA-nst.xlsx") };
  const pobieracz = { plik: async (u) => (pliki[u] ? { buf: pliki[u], sha256: crypto.createHash("sha256").update(pliki[u]).digest("hex") } : { brak: true }), strona: async () => null };
  const zrodla = [...zrodlaWH(strona([LATO_HIST]), "st", BAZA), ...zrodlaWH(strona([LATO_FA_NST]), "nst", BAZA)].map(({ pominiety, powod, ...x }) => x);
  for (const z of zrodla) z.kierunki = z.kierunki.map((k) => ({ ...k, kod: k.skrot.toUpperCase() }));
  // kierunki jak po inwentarzu: roczniki wskazują nowe pliki
  const cfg = JSON.parse(fs.readFileSync("config/kierunki-us.json", "utf8")).wydzialy.wh.kierunki;
  const kierunki = cfg.filter((k) => ["HIST", "FA"].includes(k.kod)).map((k) => ({ ...k, roczniki: k.roczniki.map((r) => ({ ...r, zrodlo: r.tryb === "nst" ? BAZA + LATO_FA_NST : BAZA + LATO_HIST })) }));
  const { importuj } = await import("./us/wh-xlsx.mjs");
  const cwd = process.cwd();
  const log = [];
  let wyniki;
  process.env.PLAN_TERAZ = "2027-03-01";
  try { process.chdir(dir); wyniki = await importuj({ wydzial: { kod: "wh" }, zrodla, kierunki, pobieracz, log: (x) => log.push(x) }); }
  finally { process.chdir(cwd); delete process.env.PLAN_TERAZ; }
  if (process.env.DEBUG) console.log(JSON.stringify(wyniki.map((w) => [w.id, w.semestr, w.blad])), log.slice(0, 5));
  const hist = wyniki.filter((w) => w.id.startsWith("wh-hist-") && !w.blad);
  assert.ok(hist.length >= 3, "roczniki HIST z letniego pliku");
  assert.ok(hist.every((w) => w.semestr === "letni" && w.rokAkademicki === "2026/2027" && Object.keys(w.groups).length));
  const fa = wyniki.filter((w) => w.id.startsWith("wh-fa-") && w.id.includes("-nst-"));
  assert.equal(fa.length, 5);
  assert.ok(fa.every((w) => /poza semestrem letni/.test(w.blad || "")), "zimowe daty pod letnią nazwą → błąd, plan na stronie bez zmian");
});
