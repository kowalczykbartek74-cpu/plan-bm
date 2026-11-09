// Etap 7 (cały US): studia niestacjonarne WNS (PDF na zjazd). Tekst PDF z pozycjami zapisany 9.11.2026 (scripts/us/pdf_tekst.py):
//   fixtures/wns-nst/BN-1-zjazd.json    – Bezpieczeństwo narodowe, zjazd 1 (układ A: tytuł z datami, pasy dni z nazwą dnia z lewej)
//   fixtures/wns-nst/PPiW-1-zjazd.json  – Pedagogika przedszkolna i wczesnoszkolna, zjazd 1 (układ B: wiersze dat w kolumnach)
//   fixtures/wns-nst/RESO-2-zjazd.json  – Pedagogika resocjalizacyjna, zjazd 2 (niedziela na drugiej stronie, I i II st.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { etykietaRocznika, plikNst, zlozNst, rocznikiPlikuNst } from "./us/wns-nst.mjs";
import { dodaj, waliduj } from "./us/wspolne.mjs";

const sem = { od: "2026-10-01", do: "2027-01-31" };
const wczytaj = (f) => plikNst(JSON.parse(fs.readFileSync(new URL(`./fixtures/wns-nst/${f}`, import.meta.url), "utf8")), { sem });
const dzien = (d) => (new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7;

test("etykiety kolumn → rocznik", () => {
  assert.deepEqual(["BN I° 2 rok", "BW II° 1 rok", "ppiw4", "reso 1 II st", "pedspec jm 3", "pespec jm 1", "ps 3", "Ped 2"].map(etykietaRocznika), [
    { skrot: "BN", stopien: 1, rok: 2 }, { skrot: "BW", stopien: 2, rok: 1 }, { skrot: "ppiw", stopien: 0, rok: 4 }, { skrot: "reso", stopien: 2, rok: 1 },
    { skrot: "pedspec", stopien: 0, rok: 3 }, { skrot: "pedspec", stopien: 0, rok: 1 }, { skrot: "ps", stopien: 1, rok: 3 }, { skrot: "ped", stopien: 1, rok: 2 }]);
  assert.equal(etykietaRocznika("Godziny"), null);
});

test("BN zjazd 1 (układ A): daty z tytułu, trzy roczniki, komórka przez godziny, e-zajęcia z kodem Teams", () => {
  const { wpisy, ostrzezenia } = wczytaj("BN-1-zjazd.json");
  assert.deepEqual(ostrzezenia, []);
  assert.deepEqual(rocznikiPlikuNst(wpisy).map((r) => `${r.skrot}${r.stopien}-${r.rok}`).sort(), ["BN1-1", "BN1-2", "BN1-3"]);
  const p = zlozNst(wpisy);
  const log = p["BN|1|2"].find(({ e, daty }) => e.pl === "Logistyka w sytuacjach kryzysowych" && daty[0] === "2026-10-09");
  assert.deepEqual([log.e.k, log.e.time, log.e.p, log.e.r, log.e.n], ["W", ["16:15", "18:30"], "prof. E. Kochanek", "online (MS Teams)", "kod MS Teams: 249s31u"]);
  const nd = p["BN|1|3"].filter(({ daty }) => daty.includes("2026-10-11")).map(({ e }) => e.pl);
  assert.ok(nd.includes("Operacje i siły specjalne"), "niedziela z drugiej strony");
  assert.ok(p["BN|1|3"].some(({ e }) => e.pl === "Konflikty na Bliskim Wschodzie (przedmiot do wyboru)" && e.k === "K"));
  assert.ok(Object.values(p).flat().every(({ e, daty }) => daty.every((d) => dzien(d) === e.d && d >= "2026-10-09" && d <= "2026-10-11")));
});

test("PPiW zjazd 1 (układ B): pięć roczników jm, data z wiersza dat w kolumnie, sala z budynkiem, rodzaj z „(w: 5/15)”", () => {
  const { wpisy, ostrzezenia } = wczytaj("PPiW-1-zjazd.json");
  assert.deepEqual(ostrzezenia, []);
  assert.deepEqual(rocznikiPlikuNst(wpisy).map((r) => r.rok).sort(), [1, 2, 3, 4, 5]);
  const p = zlozNst(wpisy);
  const [bio] = p["ppiw|0|1"].filter(({ e }) => e.pl === "Biomedyczne podstawy rozwoju małego dziecka");
  assert.deepEqual([bio.e.k, bio.e.time, bio.e.r, bio.daty], ["W", ["10:00", "14:15"], "s. 152 ul. Krakowska 71-79", ["2026-10-10"]]);
  const owi = p["ppiw|0|1"].find(({ e }) => e.pl === "Ochrona własności intelektualnej");
  assert.deepEqual([owi.e.r, owi.e.n, owi.daty], ["online (MS Teams)", "kod MS Teams: rowj2eu", ["2026-10-11"]], "niedziela bez nazwy dnia – tylko wiersz dat");
  assert.ok(p["ppiw|0|1"].some(({ e }) => e.pl === "Spotkanie organizacyjne"));
});

test("RESO zjazd 2: niedziela na drugiej stronie (nazwa dnia obejmuje wiersz dat), II st. osobno", () => {
  const { wpisy, ostrzezenia } = wczytaj("RESO-2-zjazd.json");
  assert.deepEqual(ostrzezenia, []);
  const p = zlozNst(wpisy);
  assert.ok(p["reso|2|1"].some(({ e, daty }) => e.pl === "Metody badań społecznych" && daty.includes("2026-10-25")));
  assert.ok(p["reso|1|1"].some(({ e, daty }) => e.pl === "Historia myśli pedagogicznej" && daty[0] === "2026-10-25" && e.k === "W"));
});

test("plan z wpisów: format przechodzi sprawdzenie", () => {
  for (const f of ["BN-1-zjazd.json", "PPiW-1-zjazd.json", "RESO-2-zjazd.json"]) for (const [k, l] of Object.entries(zlozNst(wczytaj(f).wpisy))) {
    const groups = {};
    for (const { e, daty } of l) dodaj(groups, "G", e, { daty });
    assert.deepEqual(waliduj({ groups }), [], `${f} ${k}`);
  }
});
