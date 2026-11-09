// Etap 7 (cały US): studia niestacjonarne WH. Prawdziwe pliki ze strony hum.usz.edu.pl (pobrane 9.11.2026):
//   fixtures/wh-nst/FA-nst.xlsx      – Filologia angielska I i II st. (arkusz = zjazd, 9 zjazdów, 5 roczników)
//   fixtures/wh-nst/FG-nst.xlsx      – Filologia germańska 2 rok I st. (arkusz = rocznik, zjazdy w pasach kolumn)
//   fixtures/wh-nst/FH-nst.xlsx      – Filologia hiszpańska I–III rok (pasy z podgrupami A/B; III rok = pusty zeszłoroczny wzór)
//   fixtures/wh-nst/harmonogram.txt  – tekst PDF „Harmonogram zjazdów … r.a. 26_27”
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { harmonogramZjazdow, dataKomorki, plikNst, zlozNst, zajeciaZTekstu, rocznikiPlikuNst } from "./us/wh-nst.mjs";
import { dodaj, waliduj } from "./us/wspolne.mjs";

const plik = (f) => fs.readFileSync(new URL(`./fixtures/wh-nst/${f}`, import.meta.url));
const { zima } = harmonogramZjazdow(plik("harmonogram.txt").toString("utf8"));
const wczytaj = (f) => plikNst(plik(f), { zjazdy: zima });
const znajdz = (lista, pl, d, pg) => lista.filter(({ e }) => e.pl === pl && (d == null || e.d === d) && (pg === undefined || (e.pg || null) === pg));

test("harmonogram zjazdów: 9 zjazdów zimowych, e-zajęcia i zjazd dodatkowy; data z komórki", () => {
  assert.equal(zima.length, 9);
  assert.deepEqual(zima[0].dni, ["2026-10-09", "2026-10-10", "2026-10-11"]);
  assert.deepEqual(zima.filter((z) => z.e).map((z) => z.nr), [4, 8]);
  assert.deepEqual(zima.filter((z) => z.dodatkowy).map((z) => z.od), ["2026-11-27"]);
  assert.equal(zima[8].od, "2027-01-29");
  assert.deepEqual([dataKomorki("46305"), dataKomorki("I zjazd 9-11.10.2026"), dataKomorki("21.11.2026 zajęcia zdalne")], ["2026-10-10", "2026-10-09", "2026-11-21"]);
});

test("tekst komórki: godziny z tekstu, kod Teams, wspólne zajęcia kierunków, specjalność", () => {
  const o = { d: 5, time: ["13:30", "15:00"], stopien: 1 };
  const a = zajeciaZTekstu("zajęcia do 14.15 [1h] Praktyczna nauka języka niemieckiego - gramatyka praktyczna 2 lab [ 1h] mgr Barbara Witek s.221, bud. 6", o);
  assert.deepEqual([a.time, a.k, a.p, a.pl], [["13:30", "14:15"], "LAB", "mgr Barbara Witek", "Praktyczna nauka języka niemieckiego – gramatyka praktyczna 2"]);
  const b = zajeciaZTekstu("gramatyka opisowa języka niemieckiego ćw-2h dr hab. Krzysztof Nerlicki, prof. US kod teams mh88kdd", o);
  assert.deepEqual([b.k, b.r, b.n], ["CW", "e-zajęcia", "kod Teams: mh88kdd"]);
  const c = zajeciaZTekstu("teoria przekładu [4h] W- dr hab. Tomasz Szutkowski, prof. US specjaność kształcenie translatorskie (FG+FA) s. 310 a", o);
  assert.deepEqual([c.pg, c.k, c.pl, c.r, c.n], ["spec:translatoryczna", "W", "teoria przekładu", "s. 310a", "razem z FG+FA"]);
  const d = zajeciaZTekstu("II/2 (lab) (15) PNJA-gramatyka praktyczna mgr Małgorzata Dula / zastępstwo mgr A. Heppner miotdkv", { ...o, stopien: 1 });
  assert.deepEqual([d.pg, d.pl, d.n], ["lab:2", "PNJA-gramatyka praktyczna", "kod Teams: miotdkv; zastępstwo"]);
  assert.equal(zajeciaZTekstu("nie planować", o), null);
});

test("FA (arkusz = zjazd): 5 roczników z nagłówków kolumn, grupy z początku tekstu, daty z harmonogramu", () => {
  const { wpisy, ostrzezenia } = wczytaj("FA-nst.xlsx");
  assert.deepEqual(ostrzezenia, []);
  assert.deepEqual(rocznikiPlikuNst(wpisy).map((r) => `${r.stopien}-${r.rok}`).sort(), ["1-1", "1-2", "1-3", "2-1", "2-2"]);
  const p = zlozNst(wpisy);
  assert.deepEqual([...new Set(p["1-1"].map(({ e }) => e.pg).filter((x) => x?.startsWith("lab:")))].sort(), ["lab:1", "lab:2", "lab:3", "lab:4"]);
  const [ti] = znajdz(p["1-1"], "Technologie informacyjne", 4, "ćw:1a");
  assert.deepEqual([ti.e.time, ti.e.p, ti.e.r, ti.daty], [["15:15", "17:45"], "dr hab. M. Makiewicz, prof. US", "ul. Wielkopolska 15, s. 208", ["2026-10-23"]]);
  // zjazd IX: tytuł arkusza z literówką („29.31-01.2027”) – data z harmonogramu
  assert.ok(p["1-1"].some(({ daty }) => daty.includes("2027-01-30")));
  assert.ok(p["2-2"].some(({ e }) => e.pg === "spec:translatoryczna"), "MA II/2 rok specj. transl.");
  assert.ok(Object.values(p).flat().every(({ e }) => !/^(?:I{1,3}|MA|\(|sala|kod)\b/.test(e.pl)), "bez przedrostków w nazwie");
});

test("FG (arkusz = rocznik): zjazdy w pasach kolumn, seria bloków = jedne zajęcia, lektoraty z jednej komórki", () => {
  const { wpisy, ostrzezenia } = wczytaj("FG-nst.xlsx");
  assert.deepEqual(ostrzezenia, []);
  const p = zlozNst(wpisy)["1-2"];
  assert.deepEqual(znajdz(p, "Wykład ogólnouczelniany", 4).map(({ e, daty }) => `${e.time.join("-")} ${daty.join(",")}`).sort(),
    ["17:00-19:30 2026-11-06,2026-12-11", "17:00-20:15 2026-10-23"]);
  const [kurs] = znajdz(p, "Praktyczna nauka języka niemieckiego – kurs podstawowy 2", 5).filter(({ e }) => e.time[0] === "11:45");
  assert.deepEqual([kurs.e.time, kurs.daty], [["11:45", "15:00"], ["2026-10-10", "2026-10-24"]]);
  const lekt = p.filter(({ e, daty }) => e.d === 6 && daty.includes("2026-11-08") && /^język/.test(e.pl)).map(({ e }) => e.pl).sort();
  assert.deepEqual(lekt, ["język angielski", "język hiszpański", "język włoski"]);
  const [e1] = znajdz(p, "Praktyczna nauka języka niemieckiego – kurs podstawowy 2", 4);
  assert.deepEqual([e1.e.r, e1.e.n, e1.daty], ["e-zajęcia", "kod Teams: fxgg23g", ["2027-01-15"]], "zjazd VIII w formie e-zajęć");
});

test("FH: podgrupy A/B spod piątku obowiązują w sobotę; pusty arkusz z datami 2025 nie daje rocznika", () => {
  const { wpisy, ostrzezenia } = wczytaj("FH-nst.xlsx");
  assert.deepEqual(rocznikiPlikuNst(wpisy).map((r) => `${r.stopien}-${r.rok}`).sort(), ["1-1", "1-2"]);
  assert.match(ostrzezenia.join("\n"), /III rok: 24 dni spoza harmonogramu/);
  const p = zlozNst(wpisy)["1-1"];
  const kon = znajdz(p, "ćwiczenia konwersacyjne", 5, "gr:A").find(({ e }) => e.time[0] === "10:00");
  assert.deepEqual([kon.e.time, kon.e.p, kon.daty], [["10:00", "13:15"], "mgr J. Majewska-Paul", ["2026-10-10", "2026-10-24"]]);
  assert.ok(p.some(({ e }) => e.pg === "gr:B" && e.d === 5));
});

test("plan z wpisów: format przechodzi sprawdzenie, wszystkie zajęcia z datami w dniach zjazdów", () => {
  for (const f of ["FA-nst.xlsx", "FG-nst.xlsx", "FH-nst.xlsx"]) {
    for (const [k, lista] of Object.entries(zlozNst(wczytaj(f).wpisy))) {
      const groups = {};
      for (const { e, daty } of lista) dodaj(groups, "G" + k, e, { daty });
      assert.deepEqual(waliduj({ groups }), [], `${f} ${k}`);
      for (const { e, daty } of lista) {
        assert.ok(daty.length && e.d >= 4 && e.d <= 6, `${f} ${k} ${e.pl}`);
        if (!(f === "FH-nst.xlsx" && k === "1-3")) assert.ok(daty.every((d) => zima.some((z) => z.dni.includes(d))), `${f} ${k} ${e.pl} ${daty}`);
      }
    }
  }
});
