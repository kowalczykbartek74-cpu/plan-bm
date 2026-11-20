// Kalendarz roku 2026/27 (semestr zimowy) zgodny z harmonogramem WEFiZ „Terminy zajęć odbywających się co dwa tygodnie
// na studiach stacjonarnych” (zdjęcie od Bartka, 20.11.2026). Styczeń był wcześniej odwrócony (parzysty ↔ nieparzysty).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const kal = JSON.parse(fs.readFileSync("kalendarz.json", "utf8"));
const zimowy = kal.tygodnie.filter(([od]) => od >= "2026-10-01" && od <= "2027-02-01");

test("kalendarz.json: tygodnie nieparzyste i parzyste jak w harmonogramie WEFiZ", () => {
  assert.deepEqual(zimowy, [
    ["2026-10-02", "2026-10-02", "even"],
    ["2026-10-05", "2026-10-09", "odd"],
    ["2026-10-12", "2026-10-16", "even"],
    ["2026-10-19", "2026-10-23", "odd"],
    ["2026-10-26", "2026-10-30", "even"],
    ["2026-11-03", "2026-11-06", "odd"],
    ["2026-11-09", "2026-11-13", "even"],
    ["2026-11-16", "2026-11-20", "odd"],
    ["2026-11-23", "2026-11-27", "even"],
    ["2026-11-30", "2026-12-04", "odd"],
    ["2026-12-07", "2026-12-11", "even"],
    ["2026-12-14", "2026-12-18", "odd"],
    ["2026-12-21", "2026-12-23", "even"],
    ["2027-01-07", "2027-01-08", "odd"],
    ["2027-01-11", "2027-01-15", "even"],
    ["2027-01-18", "2027-01-22", "odd"],
    ["2027-01-25", "2027-01-29", "even"],
    ["2027-02-01", "2027-02-01", "odd"],
  ]);
});

test("kalendarz.json: 29.01.2027 (piątek) zajęcia jak w środę tygodnia nieparzystego", () => {
  const z = kal.zamiany["2027-01-29"];
  assert.equal(z.p, "odd");
  assert.equal(z.asDay, 2); // 0 = poniedziałek, 2 = środa
});

test("kalendarz.json: dni rektorskie i sesja", () => {
  assert.ok(kal.wolne["2026-10-01"] && kal.wolne["2026-11-02"]);
  assert.ok(kal.okresy.some((o) => o.od === "2027-02-02" && o.do === "2027-02-15" && /egzaminacyjna/i.test(o.opis)));
  assert.ok(kal.okresy.some((o) => o.od === "2027-02-22" && o.do === "2027-02-28" && /poprawkowa/i.test(o.opis)));
});
