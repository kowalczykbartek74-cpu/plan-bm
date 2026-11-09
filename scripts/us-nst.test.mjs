// Etap 7 (cały US): studia niestacjonarne. Zajęcia zjazdowe zawsze z „dates”, tryb „nst” w id rocznika.
//   fixtures/wkfiz/nst-WF-1-I.html – plan HTML z aplikacji WKFiZ (api/get_html_plans.php, „WF 1 rok I stopień”, 9.11.2026)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { zHtmlNst, komorkaNst } from "./us/wkfiz.mjs";
import { dodaj, waliduj } from "./us/wspolne.mjs";

const fx = (f) => fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");

test("WKFiZ nst: komórka „przedmiot 10h ćs 1gr” → nazwa, rodzaj, podgrupa jak w stacjonarnych", () => {
  const k = (t) => { const x = komorkaNst(t); return [x.pl, x.k, x.pg || null, x.time?.join("-") || null]; };
  assert.deepEqual(k("teoria i metodyka lekkiej atletyki 10h ćs 1gr"), ["teoria i metodyka lekkiej atletyki", "CW", "ćs1", null]);
  assert.deepEqual(k("anatomia 13h lb 2gr"), ["anatomia", "LAB", "lb2", null]);
  assert.deepEqual(k("teoria i metodyka sportów indywidualnych: pływanie ćs 8h GR 1"), ["teoria i metodyka sportów indywidualnych: pływanie", "CW", "ćs1", null]);
  assert.deepEqual(k("9:00 - 9: 45 język angielski lektorat 15h"), ["język angielski", "CW", null, "09:00-09:45"]);
  assert.deepEqual(k("rekreacja ruchowa ćwiczenia specjalistyczne 13h"), ["rekreacja ruchowa", "CW", null, null]);
  assert.deepEqual(k("seminarium magisterskie 2gr 15h"), ["seminarium magisterskie", "S", "sem2", null]);
  assert.deepEqual(k("metodologia badań naukowych 8h k"), ["metodologia badań naukowych", "K", null, null]);
  assert.equal(komorkaNst("wykład ogólnouczelniany 10h kod do zajęć zgodnie z wybranym wykładem").pl, "Wykład ogólnouczelniany");
});

test("WKFiZ nst: tabela zjazdów → zajęcia z datami (pt/sob/nd), sklejone bloki, dwie podgrupy w jednej komórce", () => {
  const l = zHtmlNst(fx("wkfiz/nst-WF-1-I.html"));
  assert.equal(l.length, 92);
  assert.ok(l.every((x) => x.daty.length && x.daty.every((d) => /^2026-1[0-2]-\d\d$|^2027-0[12]-\d\d$/.test(d))));
  assert.deepEqual([...new Set(l.map((x) => x.wpis.d))].sort(), [4, 5, 6], "piątek, sobota, niedziela");
  const owi = l.find((x) => x.wpis.pl === "ochrona własności intelektualnej");
  assert.deepEqual([owi.wpis.time, owi.wpis.k, owi.daty], [["11:45", "15:00"], "W", ["2026-10-10"]], "dwa bloki z rzędu = jedne zajęcia");
  const sob = l.filter((x) => x.daty.includes("2026-11-28") && x.wpis.time[0] === "15:15").map((x) => [x.wpis.pl, x.wpis.pg, x.wpis.r]);
  assert.deepEqual(sob.sort(), [["muzyka, rytm, taniec", "ćs2", "salka 13, hala WKFiZ"], ["teoria i metodyka piłki nożnej", "ćs1", "hala WKFiZ al.Piastów 40b, bud.7"]]);
  const dni = l.find((x) => x.wpis.pl === "DNI ADAPTACYJNE");
  assert.deepEqual([dni.wpis.time, dni.wpis.p, dni.wpis.r], [["09:00", "11:00"], "", "s. 223"]);
  const groups = {};
  for (const { wpis, daty } of l) dodaj(groups, "WF1", wpis, { daty });
  assert.deepEqual(waliduj({ groups }), []);
  assert.ok(groups.WF1.odd.every((e) => e.dates?.length), "zjazdy zawsze z dates");
});
