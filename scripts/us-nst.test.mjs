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

// ---------- WEFiZ: system planynst (plan wykładowcy) ----------
import { przedmiot, grupa, planWykladowcy, zloz, wykladowcy } from "./us/wefiz-nst.mjs";
import { rocznikiNstWEFiZ } from "./us/inwentarz.mjs";

test("WEFiZ nst: nazwa przedmiotu z dopiskami → nazwa, rodzaj, podgrupa, notka", () => {
  const p = (t) => { const x = przedmiot(t); return [x.pl, x.k, x.pg || null, x.n || null]; };
  assert.deepEqual(p("matematyka (8h)(w )"), ["matematyka", "W", null, null]);
  assert.deepEqual(p("metody wyceny przedsiębiorstw (lab gr. B)(9h)"), ["metody wyceny przedsiębiorstw", "LAB", "lab:B", null]);
  assert.deepEqual(p("Podstawy finansów (lb) gr.A"), ["Podstawy finansów", "LAB", "lab:A", null]);
  assert.deepEqual(p("język angielski (lk)(15)(zo) gr.1"), ["język angielski", "CW", "gr:1", null]);
  assert.deepEqual(p("finanse sektora MSP (9h)(ćw)(sp. FPiP)"), ["finanse sektora MSP", "CW", "spec:FPiP", null]);
  assert.deepEqual(p("seminarium magisterskie (s) e-zajęcia"), ["seminarium magisterskie", "S", null, "e-zajęcia"]);
  assert.deepEqual(p("Customer and user experience (doświadczenie klienta i użytkownika) (ćw)"), ["Customer and user experience (doświadczenie klienta i użytkownika)", "CW", null, null]);
  assert.deepEqual(p("integracja gospodarcza (w US-EM)"), ["integracja gospodarcza", "W", null, "US-EM"]);
  assert.deepEqual(grupa("A20: Finanse i Rachunkowość, stopień 1, rok 1"), { g: "A20", kierunek: "Finanse i Rachunkowość", stopien: 1, rok: 1 });
});

test("WEFiZ nst: plany wykładowców → plan rocznika po grupach, wspólne zajęcia raz, zawsze z dates", () => {
  const k = planWykladowcy(fx("wefiz-nst/kuczynski.html")), h = planWykladowcy(fx("wefiz-nst/hendryk.html"));
  assert.deepEqual(k[0], { data: "2026-10-10", time: ["14:35", "17:05"], pl: "matematyka", k: "W", r: "s. N020 Mic.64",
    grupy: [{ g: "A20", kierunek: "Finanse i Rachunkowość", stopien: 1, rok: 1 }, { g: "A21", kierunek: "Finanse i Rachunkowość", stopien: 1, rok: 1 }] });
  const z = zloz([{ p: "dr Michał Kuczyński", zajecia: k }, { p: "dr Michał Kuczyński", zajecia: k }, { p: "dr Michał Hendryk", zajecia: h }]);
  const fir = z["finanse i rachunkowość|1|1"];
  assert.deepEqual(Object.keys(fir.groups), ["A20", "A21"]);
  const mat = fir.groups.A20.odd.filter((e) => e.pl === "matematyka");
  assert.ok(mat.length && mat.every((e) => e.dates?.length && e.p === "dr Michał Kuczyński" && e.d >= 4), "ten sam plan dwa razy = bez dubli");
  for (const r of Object.values(z)) assert.deepEqual(waliduj({ groups: r.groups }), []);
  assert.ok(wykladowcy(`<a href='/wp-content/include-me/plany_mick/pracow_zajecia_xml.php?nazw=dr Michał&nazw1=Kuczyński' target='_blank'>dr Michał Kuczyński</a>`)[0].url.includes("pracow_zajecia_xml.php"));
});

test("WEFiZ nst: roczniki z kodów grup e-proDziekan w PDF-ie „Wykaz grup … NZ” (Cukrowa)", () => {
  const mapa = { L: "Logistyka", Li: "Logistyka inż.", Z: "Zarządzanie", MAR: "Marketing" };
  const r = rocznikiNstWEFiZ(JSON.parse(fx("wefiz-nst/wykaz-cukrowa.json")), mapa);
  assert.deepEqual(r.nieznane, []);
  assert.deepEqual(r.roczniki.map((x) => `${x.skrot}${x.stopien === 2 ? "-II" : ""}:${x.rok}`).sort(),
    ["L-II:1", "L-II:2", "L:1", "L:2", "L:3", "Li:1", "Li:2", "Li:3", "Li:4", "MAR-II:1", "MAR-II:2", "Z-II:1", "Z-II:2", "Z:1", "Z:2", "Z:3"]);
});
