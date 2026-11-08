// Etap 2 (cały US): fundament dla planów z plików – normalizacja, zapis plan/<id>.json, importer wydziału, lista na stronie.
// Atrapa: dwa wydziały (WNS z planem z „time”, WH z importerem, który się wywraca), kierunek bez planu, kierunek dwóch wydziałów.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dzienZ, godzinyZ, rodzajZ, salaZ, grupaZ, tydzienZ, datyZ, dodaj, waliduj, zapiszPlan } from "./us/wspolne.mjs";
import { importujWydzial, importujWszystkie, statusOgolny } from "./us/importuj.mjs";
import { listaUS, daneUS, kodStrony, wstawUS } from "./kierunki.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "us-fund-"));

test("normalizacja: dzień, godziny, rodzaj, sala z budynkiem, grupa, tygodnie, daty", () => {
  assert.deepEqual(["Poniedziałek", "WT.", "środa", "Czw", "piątek", "sobota", "Monday", "x"].map(dzienZ), [0, 1, 2, 3, 4, 5, 0, null]);
  assert.deepEqual(godzinyZ("08:15 - 09:00 09:00 - 9:45"), ["08:15", "09:45"]);
  assert.deepEqual(godzinyZ("8.15–9.45"), ["08:15", "09:45"]);
  assert.deepEqual(godzinyZ("10-11.30"), ["10:00", "11:30"]);
  assert.equal(godzinyZ("sala 104"), null);
  assert.deepEqual(["W", "wykład", "ćw.", "Ćwiczenia", "lab", "Laboratorium", "konw.", "Konwersatorium", "sem", "Seminarium", "PDW", ""].map(rodzajZ),
    ["W", "W", "CW", "CW", "LAB", "LAB", "K", "K", "S", "S", "X", "X"]);
  assert.equal(salaZ("105", "K", { K: "ul. Krakowska 71-79" }), "s. 105 (K)");
  assert.equal(salaZ("s. 12"), "s. 12");
  assert.equal(salaZ("stadion lekkoatletyczny ul.Litewska 20"), "stadion lekkoatletyczny ul.Litewska 20");
  assert.deepEqual(grupaZ("gr. 1a"), { g: "1", sub: "A" });
  assert.deepEqual(grupaZ("C111 lab B"), { g: "C111", sub: "B" });
  assert.deepEqual(["co tydzień", "tydzień nieparzysty", "parzysty", "(N)"].map(tydzienZ), ["both", "odd", "even", "odd"]);
  assert.deepEqual(datyZ("9.10, 23.10 i 6.11.2026; 15.01"), ["2026-10-09", "2026-10-23", "2026-11-06", "2027-01-15"]);
});

test("dodaj: co tydzień → odd i even, jeden tydzień → jedna lista, daty → dates; walidacja", () => {
  const g = {};
  dodaj(g, "1", { d: 0, time: ["08:15", "09:45"], pl: "Socjologia", k: "W", p: "dr X", r: "s. 1 (K)" });
  dodaj(g, "1", { d: 1, time: ["10:00", "11:30"], pl: "Statystyka", k: "CW", p: "", r: "s. 2 (K)", g: "A" }, { tydzien: "odd" });
  dodaj(g, "1", { d: 4, time: ["12:00", "13:30"], pl: "Projekt", k: "X", p: "dr Y", r: "" }, { daty: ["2026-10-09", "2026-11-06"] });
  assert.equal(g["1"].odd.length, 3); assert.equal(g["1"].even.length, 2);
  assert.deepEqual(g["1"].even[1].dates, ["2026-10-09", "2026-11-06"]);
  assert.ok(!("p" in g["1"].odd[1]), "puste pola nie trafiają do planu");
  assert.deepEqual(waliduj({ groups: g }), []);
  assert.ok(waliduj({ groups: { "1": { odd: [{ d: 9, pl: "A", k: "W", time: ["10:00", "09:00"] }], even: [] } } }).length >= 2);
  assert.deepEqual(waliduj({ groups: {} }), ["brak grup"]);
});

const plan20 = (n = 20) => { const g = {}; for (let i = 0; i < n; i++) dodaj(g, "1", { d: i % 5, time: [`${String(8 + (i % 6)).padStart(2, "0")}:00`, `${String(9 + (i % 6)).padStart(2, "0")}:30`], pl: "Przedmiot " + i, k: "W" }, { tydzien: "odd" }); return g; };

test("zapiszPlan: nowy, bez zmian, spadek > 30% i zły plan zostawiają starą wersję, kolejka zatwierdzeń nic nie zapisuje", () => {
  const d = tmp(), f = path.join(d, "plan/wns-soc-1-st-2026.json");
  const meta = { source: "https://nsp.usz.edu.pl/wp-content/uploads/SOC-1-25.pdf", wersja: "SOC-1-25", kierunek: "Socjologia", id: "wns-soc-1-st-2026", kod: "soc26", wydzial: "WNS", rok: 1 };
  assert.equal(zapiszPlan(f, plan20(), meta, { teraz: "2026-11-08T10:00:00Z" }).status, "nowy");
  const p1 = JSON.parse(fs.readFileSync(f, "utf8"));
  assert.equal(p1.source, meta.source); assert.equal(p1.wersja, "SOC-1-25"); assert.equal(p1.groups["1"].odd.length, 20);
  fs.writeFileSync(f, JSON.stringify({ ...p1, kalendarz: { start: "2026-09-28" }, dziekanat: { posts: [] } }));
  assert.equal(zapiszPlan(f, plan20(), meta, { teraz: "2026-11-09T10:00:00Z" }).status, "bez zmian");
  const zly = zapiszPlan(f, plan20(10), meta);
  assert.equal(zly.status, "błąd"); assert.match(zly.blad, /spadła z 20 do 10/);
  assert.equal(zapiszPlan(f, { "1": { odd: [{ d: 0, pl: "", k: "W" }], even: [] } }, meta).status, "błąd");
  assert.equal(JSON.parse(fs.readFileSync(f, "utf8")).groups["1"].odd.length, 20, "zostaje ostatnia dobra wersja");
  const nowy = plan20(); dodaj(nowy, "2", { d: 0, time: ["08:00", "09:30"], pl: "Nowy", k: "S" });
  assert.equal(zapiszPlan(f, nowy, { ...meta, wersja: "SOC-1-26" }).status, "zmiana");
  const p2 = JSON.parse(fs.readFileSync(f, "utf8"));
  assert.deepEqual(p2.kalendarz, { start: "2026-09-28" }); assert.ok(p2.dziekanat, "kalendarz i odwołania z poprzedniej wersji zostają");
  const f2 = path.join(d, "plan/wns-pdf-1-st-2026.json");
  assert.equal(zapiszPlan(f2, plan20(), meta, { czekaNaZatwierdzenie: true }).status, "czeka na zatwierdzenie");
  assert.ok(!fs.existsSync(f2));
  assert.deepEqual(["nowy", "zmiana", "bez zmian", "bez zmian uczelni", "czeka na zatwierdzenie", "błąd"].map(statusOgolny), ["ok", "ok", "bez zmian", "bez zmian", "czeka na zatwierdzenie", "błąd"]);
});

// atrapa dwóch wydziałów z importerami
function atrapa() {
  const d = tmp();
  fs.mkdirSync(path.join(d, "imp"));
  fs.writeFileSync(path.join(d, "imp/wns.mjs"), `
    export async function importuj({ wydzial, zrodla }) {
      const g = {}; for (let i = 0; i < 12; i++) (g["1"] ||= { odd: [], even: [] }).odd.push({ d: i % 5, time: ["08:15", "09:45"], pl: "P" + i, k: "W" });
      return [
        { id: "wns-soc-1-st-2026", kod: "soc26", kierunek: { pl: "Socjologia", en: "Sociology" }, stopien: 1, tryb: "st", rok: 1, groups: g, source: zrodla[0].url, wersja: "2026-11-05" },
        { id: "wns-bn-1-nst-2026", kod: "bnn26", kierunek: { pl: "Bezpieczeństwo narodowe" }, stopien: 1, tryb: "nst", rok: 1, groups: g, source: "u", wersja: "z1", zatwierdzenie: true },
        { id: "wns-zly-1-st-2026", kod: "zly26", kierunek: { pl: "Zły" }, stopien: 1, tryb: "st", rok: 1, groups: {}, source: "u", wersja: "x" },
      ];
    }`);
  fs.writeFileSync(path.join(d, "imp/wh.mjs"), `export async function importuj() { throw new Error("plik XLSX nie do odczytu"); }`);
  const wydzialy = { wydzialy: [
    { kod: "wefiz", skrot: "WEFiZ", pl: "Wydział Ekonomii", en: "Faculty of Economics", strony: [{ url: "https://planyzajec-efz.usz.edu.pl/plan" }], dos: ["https://dos.usz.edu.pl/cukrowa/zajecia-cukrowa/"] },
    { kod: "wns", skrot: "WNS", pl: "Wydział Nauk Społecznych", en: "Faculty of Social Sciences", importer: "wns.mjs", strony: [{ url: "https://nsp.usz.edu.pl/plany/" }], dos: ["https://dos.usz.edu.pl/krakowska/zajecia-krakowska/"] },
    { kod: "wh", skrot: "WH", pl: "Wydział Humanistyczny", en: "Faculty of Humanities", importer: "wh.mjs", strony: [{ url: "https://hum.usz.edu.pl/plany/" }] },
    { kod: "wt", skrot: "WT", pl: "Wydział Teologiczny", en: "Faculty of Theology" },
  ] };
  const zrodla = { wydzialy: { wefiz: { zrodla: [] }, wns: { zrodla: [{ url: "https://nsp.usz.edu.pl/wp-content/uploads/SOC-1-25.pdf" }] }, wh: { zrodla: [] }, wt: { zrodla: [] } } };
  const kierunki = { wydzialy: {
    wefiz: { kierunki: [{ kod: "EP", pl: "Ekonomiczno-prawny", en: "Economics and Law", stopnie: [1], roczniki: [] }, { kod: "GE", pl: "Green Economy", stopnie: [], roczniki: [] }] },
    wns: { kierunki: [
      { kod: "SOC", pl: "Socjologia", en: "Sociology", stopnie: [1], roczniki: [{ id: "wns-soc-1-st-2026", stopien: 1, tryb: "st", rok: 1, nabor: 2026 }] },
      { kod: "BN", pl: "Bezpieczeństwo narodowe", en: "National Security", stopnie: [1], roczniki: [{ id: "wns-bn-1-nst-2026", stopien: 1, tryb: "nst", rok: 1, nabor: 2026 }] },
      { kod: "PSYCH", pl: "Psychologia", en: "Psychology", stopnie: [0], roczniki: [{ id: "wns-psych-0-st-2025", stopien: 0, tryb: "st", rok: 2, nabor: 2025 }] },
    ] },
    wpia: { kierunki: [{ kod: "EP", pl: "Ekonomiczno-prawny", en: "Economics and Law", wlasciciel: "wefiz", stopnie: [1], roczniki: [{ id: "wefiz-ep-1-st-2026", stopien: 1, tryb: "st", rok: 1, nabor: 2026 }] }] },
  } };
  return { d, wydzialy, zrodla, kierunki };
}

test("importer wydziału: plan z time i adresem pliku, kolejka zatwierdzeń, zły plan, błąd jednego wydziału nie blokuje reszty", async () => {
  const { d, wydzialy, zrodla, kierunki } = atrapa();
  const opcje = { katalogImporterow: path.join(d, "imp"), planDir: path.join(d, "plan"), wydzialy, zrodla, kierunki, log: () => {}, pobieracz: {}, teraz: "2026-11-08T10:00:00Z" };
  const r = await importujWydzial("wns", opcje);
  assert.deepEqual(r.stan.map((s) => [s.id, s.status]), [["wns-soc-1-st-2026", "ok"], ["wns-bn-1-nst-2026", "czeka na zatwierdzenie"], ["wns-zly-1-st-2026", "błąd"]]);
  assert.ok(r.stan.every((s) => s.wydzial === "wns" && "zrodlo" in s && "wersja" in s));
  const p = JSON.parse(fs.readFileSync(path.join(d, "plan/wns-soc-1-st-2026.json"), "utf8"));
  assert.deepEqual(p.groups["1"].odd[0].time, ["08:15", "09:45"]);
  assert.equal(p.source, "https://nsp.usz.edu.pl/wp-content/uploads/SOC-1-25.pdf"); assert.equal(p.wydzial, "WNS"); assert.equal(p.kierunekEn, "Sociology");
  assert.ok(!fs.existsSync(path.join(d, "plan/wns-bn-1-nst-2026.json")), "plan do zatwierdzenia nie trafia na stronę");
  assert.equal((await importujWydzial("wt", opcje)).pominiety, "brak importera");
  const wszystkie = await importujWszystkie(opcje);
  assert.ok(wszystkie.some((s) => s.wydzial === "wh" && s.status === "błąd" && /XLSX/.test(s.blad)));
  assert.ok(wszystkie.some((s) => s.id === "wns-soc-1-st-2026" && s.status === "bez zmian"), "WNS po błędzie WH dalej się importuje");
});

test("strona: roczniki innych wydziałów, kod z trybem, kierunek dwóch wydziałów, kierunki bez planu", () => {
  const { d, wydzialy, kierunki } = atrapa();
  const fk = path.join(d, "ku.json"), fw = path.join(d, "wu.json");
  fs.writeFileSync(fk, JSON.stringify(kierunki)); fs.writeFileSync(fw, JSON.stringify(wydzialy));
  const jest = (f) => ["plan/wns-soc-1-st-2026.json", "plan/wns-bn-1-nst-2026.json", "plan/wefiz-ep-1-st-2026.json"].includes(f);
  const l = listaUS({ plik: fk, wydzialyPlik: fw, jest });
  assert.deepEqual(l.map((r) => [r.id, r.kod, r.wydzial, r.tryb || "st", (r.takze || []).join()]), [
    ["wefiz-ep-1-st-2026", "ep26", "WEFiZ", "st", "wpia"],   // atrapa nie ma WPiA w wydziałach → kod zamiast skrótu
    ["wns-bn-1-nst-2026", "bnn26", "WNS", "nst", ""],
    ["wns-soc-1-st-2026", "soc26", "WNS", "st", ""],
  ]);
  assert.equal(kodStrony("PSYCH", 0, "st", 2025), "psychj25");
  assert.equal(kodStrony("BN", 2, "nst", 2026), "bnmn26");
  const bm = { id: "wefiz-bm-1-st-2026", pl: "Business Management", rok: 1, stopien: 1, wydzial: "WEFiZ" };
  const u = daneUS([bm, ...l], { plik: fk, wydzialyPlik: fw });
  assert.deepEqual(u.wydzialy.map((w) => w.w), ["WEFiZ", "WNS", "WH", "WT"]);
  assert.equal(u.wydzialy[1].dos, "https://dos.usz.edu.pl/krakowska/zajecia-krakowska/");
  assert.deepEqual(u.bezPlanu.map((b) => `${b.w}:${b.pl}:${b.stopien}`), ["WNS:Psychologia:0"], "EP ma plan (pod WPiA), Green Economy bez stopnia, Psychologia bez pliku planu");
  assert.throws(() => wstawUS("bez znaczników", u), /US_START/);
});

test("index.html: adres wydziału bez znaków diakrytycznych, krok Wydział tylko przy > 1 wydziale z planem", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const kod = html.slice(html.indexOf("const wkod"), html.indexOf("const ROUTE"));
  const rr = [{ id: "wnsip-mat-1-st-2026", kod: "mat26", rok: 1, wydzial: "WNŚiP" }, { id: "wpia-prawo-0-st-2026", kod: "prawoj26", rok: 1, wydzial: "WPiA" }];
  const kodBase = (r) => String(r.kod).replace(/\d+$/, "");
  const f = new Function("ROCZNIKI", "kodBase", kod + "; return { trasa, czytajTrase };")(rr, kodBase);
  assert.equal(f.trasa(rr[0], "1"), "#/wnsip/mat/1/1");
  assert.equal(f.czytajTrase("#/wnsip/mat/1/1").r.id, "wnsip-mat-1-st-2026");
  assert.equal(f.czytajTrase("#/wpia/prawoj/1").r.id, "wpia-prawo-0-st-2026");
  assert.match(html, /document\.getElementById\("wydzRow"\)\.hidden = wyd\.length < 2;/);
  assert.match(html, /<div class="ctl" id="wydzRow" hidden>/);
  assert.match(html, /lWydz:"Faculty"/);
});

test("kierunki bez planu: kierunek z planem pod inną nazwą w systemie (ten sam kod) nie jest „niedostępny”", () => {
  const d = tmp(), fk = path.join(d, "ku.json"), fw = path.join(d, "wu.json");
  fs.writeFileSync(fw, JSON.stringify({ wydzialy: [{ kod: "wefiz", skrot: "WEFiZ", pl: "W", en: "W" }] }));
  fs.writeFileSync(fk, JSON.stringify({ wydzialy: { wefiz: { kierunki: [{ kod: "GPI", pl: "Gospodarka przestrzenna", stopnie: [1] }, { kod: "EK", pl: "Ekonomia", stopnie: [1, 2] }] } } }));
  const r = [{ id: "wefiz-gpi-1-st-2026", kod: "gpi26", pl: "Gospodarka Przestrzenna inż.", rok: 1, stopien: 1, wydzial: "WEFiZ" },
    { id: "wefiz-ek-1-st-2026", kod: "ek26", pl: "Ekonomia", rok: 1, stopien: 1, wydzial: "WEFiZ" }];
  assert.deepEqual(daneUS(r, { plik: fk, wydzialyPlik: fw }).bezPlanu.map((b) => `${b.pl}:${b.stopien}`), ["Ekonomia:2"]);
});
