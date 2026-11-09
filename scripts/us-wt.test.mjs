// Etap 5 (cały US): Wydział Teologiczny – skany PDF (bez tekstu) → odczyt AI w odczyty/wt/ → plan przez kolejkę zatwierdzeń.
//   fixtures/wt/siatka-TEO.json = wynik scripts/us/skan_siatka.py dla Plan-TEO-2026-27a.pdf (9.11.2026)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { terminyWT, rodzajWT, salaWT, odczytNaPlany, wczytajOdczyt, prostokatWT, importuj, tygodnie } from "./us/wt-pdf.mjs";
import { waliduj } from "./us/wspolne.mjs";

const sem = { od: "2026-10-01", do: "2027-01-31" };
const TEO = wczytajOdczyt("Plan-TEO-2026-27a.pdf"), NOR = wczytajOdczyt("Plan-NOR-2026-27a.pdf");
const siatka = JSON.parse(fs.readFileSync(new URL("./fixtures/wt/siatka-TEO.json", import.meta.url), "utf8"));
const wpisy = (plany, klucz) => Object.values(plany[klucz].groups)[0].odd;

test("terminy: „od 16 XI”, listy, połowy semestru, „oprócz”", () => {
  assert.equal(terminyWT(null, 0, sem), null);
  assert.deepEqual(terminyWT("12 X 19 X 26 X 9 XI", 0, sem), ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-09"]);
  assert.equal(terminyWT("od 16 XI", 0, sem)[0], "2026-11-16");
  const wt = tygodnie(1, sem), p1 = terminyWT("pierwsza połowa", 1, sem), p2 = terminyWT("druga połowa", 1, sem);
  assert.deepEqual([...p1, ...p2], wt); assert.ok(p1.length - p2.length <= 1);
  const psy = terminyWT("oprócz 8 X 5 XI 12 XI 3 XII", 3, sem);
  assert.ok(!psy.includes("2026-10-08") && !psy.includes("2026-12-03") && psy.includes("2026-10-01"));
  assert.throws(() => terminyWT("wkrótce", 0, sem), /nieczytelne/);
});

test("rodzaj z dopisku, sala z numeru", () => {
  assert.deepEqual(["Psychologia ogólna [wykład]", "Historia Kościoła [ćw.]", "Język łaciński", "Metody diagnozowania [laboratorium]", "Wykład ogólnouczelniany", "Logika"].map(rodzajWT),
    ["W", "CW", "CW", "LAB", "W", "X"]);
  assert.deepEqual([salaWT("202"), salaWT("201a"), salaWT("s. 107 ACKJ, ul. Wawrzyniaka 15"), salaWT("")], ["s. 202", "s. 201a", "s. 107 ACKJ, ul. Wawrzyniaka 15", ""]);
});

test("Teologia (jm, 5 lat): odczyt → plany, format planu przechodzi sprawdzenie", () => {
  const plany = odczytNaPlany(TEO, { kod: "TEO", sem });
  assert.deepEqual(Object.keys(plany).sort(), ["0-1", "0-2", "0-3", "0-4", "0-5"]);
  for (const p of Object.values(plany)) assert.deepEqual(waliduj({ groups: p.groups }), []);
  assert.deepEqual(Object.values(plany).map((p) => p.zajec), [10, 14, 13, 13, 11]);
  const r3 = wpisy(plany, "0-3");
  const ped = r3.find((e) => e.pl === "Pedagogika ogólna" && e.d === 0);
  assert.deepEqual([ped.k, ped.time, ped.dates.length, ped.r], ["CW", ["10:00", "13:15"], 4, "s. 303"]);
  const niem = r3.find((e) => e.pl === "Język niemiecki");
  assert.deepEqual([niem.d, niem.r], [4, "s. 6 ACKJ, ul. Wawrzyniaka 15"], "piątek wpisany w wierszu czwartku");
  assert.ok(wpisy(plany, "0-2").some((e) => e.pl === "Psychologia ogólna" && e.k === "CW" && e.time[0] === "09:45" && e.dates.length === tygodnie(3, sem).length - 4));
});

test("Nauki o rodzinie: I st. 1–3 i II st. 1–2, „krótkie” zajęcia w notce, pominięte bez terminów", () => {
  const plany = odczytNaPlany(NOR, { kod: "NOR", sem });
  assert.deepEqual(Object.keys(plany).sort(), ["1-1", "1-2", "1-3", "2-1", "2-2"]);
  for (const p of Object.values(plany)) assert.deepEqual(waliduj({ groups: p.groups }), []);
  const bio = wpisy(plany, "1-1").find((e) => /Biomedyczne/.test(e.pl));
  assert.deepEqual([bio.time, bio.r, bio.dates[0]], [["15:15", "19:00"], "s. 26 al. Piastów 40B, blok 6 (WKFiZ)", "2026-10-06"]);
  assert.match(wpisy(plany, "2-2").find((e) => e.pl === "Proces coachingu" && e.time[0] === "08:15").n, /8, 14 lub 15 godzin/);
  assert.ok(!Object.values(plany).some((p) => Object.values(p.groups)[0].odd.some((e) => /paliatywno/.test(e.pl))), "[4] terminy nieustalone → pominięte");
});

test("prostokąt wycinka z siatki skanu", () => {
  const z = TEO.zajecia.find((q) => q.pl === "Emisja głosu");
  const [x0, y0, x1, y1] = prostokatWT(z, siatka);
  assert.deepEqual([x0, x1], [siatka.pionowe[1], siatka.pionowe[2]]);
  assert.deepEqual([y0, y1], [siatka.dni[1][1], siatka.dni[1][3]], "wtorek, wiersze 10:00 i 11:45");
});

test("nowa wersja skanu bez odczytu: nic nie zgadujemy, rocznik dostaje błąd (zostaje poprzedni plan)", async () => {
  const url = "https://teo.usz.edu.pl/wp-content/uploads/Plan-TEO-2026-27b.pdf";
  const zrodla = [{ url, plik: "Plan-TEO-2026-27b.pdf", format: "pdf", tryb: "st", typ: "plan", kierunki: [{ kod: "TEO", nazwa: "TEOLOGIA" }] }];
  const kierunki = [{ kod: "TEO", pl: "Teologia", roczniki: [{ id: "wt-teo-0-st-2026", stopien: 0, tryb: "st", rok: 1, nabor: 2026, zrodlo: url }] }];
  const katalog = fs.mkdtempSync("/tmp/odczyty-");
  fs.writeFileSync(`${katalog}/Plan-TEO-2026-27b.json`, JSON.stringify({ ...TEO, plik: "Plan-TEO-2026-27b.pdf" }));   // stary odczyt, inny plik
  const w = await importuj({ wydzial: {}, zrodla, kierunki, katalog, pobieracz: { plik: async () => ({ buf: Buffer.from("x"), sha256: "b".repeat(64) }) } });
  assert.equal(w.length, 1); assert.match(w[0].blad, /skan bez odczytu: odczyt dotyczy innej wersji pliku/);
  const bez = await importuj({ wydzial: {}, zrodla, kierunki, katalog: fs.mkdtempSync("/tmp/odczyty-"), pobieracz: { plik: async () => ({ buf: Buffer.from("x"), sha256: "b".repeat(64) }) } });
  assert.match(bez[0].blad, /brak odczytu.*Importy \(profil WT\)/);
});
