// Plany wszystkich kierunków WEFiZ (scripts/wefiz-wszystkie.mjs): odczyt formularza, grupy, rok, pliki konfiguracji.
// Bez sieci: strony uczelni to atrapa w pamięci. node --test scripts/*.test.mjs
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SLOTS } from "./parse.mjs";
import { kierunkiZFormularza, grupyZFormularza, kandydaciGrup, przedmiotyStrony, liczbaZajec, konfiguracja, znajdz, zapiszKonfiguracje,
  raportMd, prefiks, idRocznika, nabor, kodZ, zSkrotu } from "./wefiz-wszystkie.mjs";
import { zKonfiguracji } from "./update-plan.mjs";
import { lista } from "./kierunki.mjs";

const TERAZ = new Date(2026, 10, 8);
const komorka = (t, sala = "s.104 Cuk.8") => `<table>${t} <br/><form action="planNaucz"><input class="linkClass" type="submit" value="dr Jan Nowak" /></form><form action="planSal"><input class="salButtonClass" type="submit" value="${sala}" /></form></td>`;
// strona grupy w układzie uczelni (parseGroupPage): kierunek, tydzień nieparzysty / parzysty, 5 dni w wierszu
function stronaGrupy(kierunek, przedmioty) {
  const wiersze = przedmioty.map((p, i) => `<tr><th id="pierwszaKom">${SLOTS[i % SLOTS.length]}</th>` +
    [0, 1, 2, 3, 4].map((d) => `<td id="przedmiot${d}">${d === i % 5 ? komorka(p) : "</td>"}`).join("") + "</tr>").join("");
  return `<div id="kierunek"><strong>Kierunek: </strong> ${kierunek}</div><strong>Grupa: </strong> X<
    <strong>Rok Akademicki: </strong> 2026/2027 <strong>Semestr: </strong> zimowy<
    <table class="tydzien1">${wiersze}</table><table class="tydzien2">${wiersze}</table><div class="tydzien12"></div>`;
}
const FORM = `<select name="Kieruek"><option>Logistyka (L)</option><option>Ekonomia (Ek)</option><option>Zarządzanie (Z)</option></select>
  <select name="numerGrupy"><option value="C161">C161</option><option value="C162">C162</option><option value="E251">E251</option></select>
  <p>Aktualizacja planu: 08.11.2026</p>`;
const LOG = ["Logistyka (w)", "Matematyka (ćw)", "Podstawy logistyki (w)", "Ekonomia (ćw)", "Prawo (w)"];
const EK2 = ["Mikroekonomia II (w)", "Statystyka (ćw)", "Ekonometria (w)", "Finanse publiczne (ćw)", "Polityka gospodarcza (w)"];
const ZARZ = ["Podstawy zarządzania (w)", "Matematyka (ćw)", "Nauka o przedsiębiorstwie (w)", "Podstawy prawa (ćw)", "Technologie informacyjne (lab gr. A)"];
// plan kierunku i roku: Logistyka podaje grupy w treści (C161, C162; sala „s.C163 Cuk.8” to nie grupa), Ekonomia 2. roku nie podaje grup
const kier = (przedm, grupy = "") => przedm.map((p) => `<td>${p} ${grupy}</td>`).join("");
const STRONY = {
  "plan": FORM,
  "planKierunek?Kieruek=Logistyka+%28L%29&rok=1+rokI": kier(LOG, "gr. C161, C162 s.C163 Cuk.8"),
  "planKierunek?Kieruek=Ekonomia+%28Ek%29&rok=2+rokI": kier(EK2),
  "planKierunek?Kieruek=Zarz%C4%85dzanie+%28Z%29&rok=1+rokI": kier(ZARZ, "<a href='planGrup?numerGrupy=C151'>C151</a> C152"),
  "planGrup?numerGrupy=C161": stronaGrupy("Logistyka", LOG),
  "planGrup?numerGrupy=C162": stronaGrupy("Logistyka", LOG),
  "planGrup?numerGrupy=E251": stronaGrupy("Ekonomia", EK2.slice(0, 4)),
  "planGrup?numerGrupy=C151": stronaGrupy("Zarządzanie", ZARZ),
  "planGrup?numerGrupy=C152": stronaGrupy("Zarządzanie", ZARZ),
};
const atrapa = (log = []) => async (p) => { log.push(p); return STRONY[p] ?? null; };

test("formularz uczelni: kierunki ze skrótem i lista grup", () => {
  assert.deepStrictEqual(kierunkiZFormularza(FORM).map((k) => [k.nazwa, k.skrot]), [["Logistyka", "L"], ["Ekonomia", "Ek"], ["Zarządzanie", "Z"]]);
  assert.deepStrictEqual(grupyZFormularza(FORM), ["C161", "C162", "E251"]);
  assert.deepStrictEqual(grupyZFormularza("<p>bez formularza</p>"), []);
});

test("kandydaci na grupy: odnośniki i napisy grup, bez sal", () => {
  assert.deepStrictEqual(kandydaciGrup("gr. C161, C162 s.C163 Cuk.8 sala A101 <a href='planGrup?numerGrupy=M120'>"), ["C161", "C162", "M120"]);
  assert.deepStrictEqual(kandydaciGrup("Mikroekonomia (w) s. 104"), []);
});

test("przedmioty strony i liczba zajęć", () => {
  assert.deepStrictEqual([...przedmiotyStrony(kier(LOG))].sort(), ["ekonomia", "logistyka", "matematyka", "podstawy logistyki", "prawo"]);
  assert.strictEqual(liczbaZajec(kier(EK2)), 5);
  assert.strictEqual(liczbaZajec("<p>Brak planu</p>"), 0);
});

test("id rocznika i kod strony planu: ten sam wzór co Zarządzanie i FiR", () => {
  assert.strictEqual(nabor(1, TERAZ), 2026);
  assert.strictEqual(nabor(3, TERAZ), 2024);
  assert.strictEqual(kodZ("Z"), "ZARZ");
  assert.strictEqual(kodZ("FiR"), "FIR");
  assert.strictEqual(kodZ("BIwG"), "BIWG");
  assert.strictEqual(prefiks("ZARZ", 1, 2026), "zarz26");
  assert.strictEqual(prefiks("EK", 2, 2026), "ekm26");
  assert.strictEqual(idRocznika("FIR", 1, 2026), "wefiz-fir-1-st-2026");
});

test("przebieg na atrapie: grupy z planu kierunku, rok po przedmiotach, Zarządzanie z odnośnika", async () => {
  const log = [];
  const w = await znajdz(atrapa(log), { log: () => {} });
  const po = Object.fromEntries(w.map((x) => [`${x.nazwa}/${x.stopien}/${x.rok}`, x]));
  assert.deepStrictEqual(po["Logistyka/1/1"].grupy, ["C161", "C162"]);
  assert.strictEqual(po["Logistyka/1/1"].zrodlo, "plan kierunku");
  assert.deepStrictEqual(po["Ekonomia/1/2"].grupy, ["E251"], "grupa z formularza, rok po przedmiotach");
  assert.strictEqual(po["Ekonomia/1/2"].zrodlo, "rok dopasowany po przedmiotach");
  assert.deepStrictEqual(po["Zarządzanie/1/1"].grupy, ["C151", "C152"]);
  assert.strictEqual(w.length, 3, "lata bez planu pominięte");
  assert.strictEqual(new Set(log).size, log.length, "każda strona pobrana raz");
  const tylko1 = await znajdz(atrapa(), { lata: [1], tylko: ["Logistyka"] });
  assert.deepStrictEqual(tylko1.map((x) => x.nazwa + x.rok), ["Logistyka1"]);
});

test("pliki konfiguracji: format kierunek.mjs, nie ruszają plików ze Skrótu, drugi przebieg bez zmian", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wefiz-"));
  // plik ze Skrótu (skrot-bm/scripts/kierunek.mjs) dla Zarządzania
  const zarz = JSON.parse(fs.readFileSync("kierunki/wefiz-zarz-1-st-2026.json", "utf8"));
  fs.writeFileSync(path.join(dir, "wefiz-zarz-1-st-2026.json"), JSON.stringify(zarz));
  const w = await znajdz(atrapa());
  const r = zapiszKonfiguracje(w, { dir, teraz: TERAZ });
  assert.deepStrictEqual(r.nowe.map((x) => x.id).sort(), ["wefiz-ek-1-st-2025", "wefiz-log-1-st-2026"]);
  assert.deepStrictEqual(r.pominiete.map((x) => [x.id, x.powod]), [["wefiz-zarz-1-st-2026", "plik ze Skrótu (skrot-bm)"]]);
  assert.ok(zSkrotu(zarz));
  const log = JSON.parse(fs.readFileSync(path.join(dir, "wefiz-log-1-st-2026.json"), "utf8"));
  assert.deepStrictEqual(Object.keys(log), Object.keys(zarz), "te same pola co plik ze Skrótu");
  assert.deepStrictEqual([log.kod, log.kierunek.kod, log.system.nazwa, log.system.rok, log.plik], ["log26", "LOG", "Logistyka (L)", "1 rokI", "plan/wefiz-log-1-st-2026.json"]);
  // codzienny automat i strona wyboru przyjmują plik bez zmian w kodzie
  const K = zKonfiguracji(log);
  assert.deepStrictEqual([K.kierunek, K.plik, K.wymagane], ["Logistyka", "plan/wefiz-log-1-st-2026.json", ["C161", "C162"]]);
  assert.ok(lista(dir).some((x) => x.id === "wefiz-ek-1-st-2025" && x.rok === 2 && x.stopien === 1));
  const r2 = zapiszKonfiguracje(w, { dir, teraz: TERAZ });
  assert.strictEqual(r2.nowe.length, 0, "drugi przebieg bez --odswiez niczego nie nadpisuje");
  const r3 = zapiszKonfiguracje(w, { dir, teraz: TERAZ, odswiez: true });
  assert.deepStrictEqual(r3.nowe.map((x) => x.id).sort(), ["wefiz-ek-1-st-2025", "wefiz-log-1-st-2026"], "--odswiez: tylko własne pliki");
  assert.match(raportMd(r), /Nowe pliki konfiguracji: \*\*2\*\*/);
  const sucho = fs.mkdtempSync(path.join(os.tmpdir(), "wefiz-"));
  zapiszKonfiguracje(w, { dir: sucho, teraz: TERAZ, naSucho: true });
  assert.deepStrictEqual(fs.readdirSync(sucho), [], "na sucho nic nie zapisuje");
});

test("konfiguracja: BM 1. roku zostaje przy plan.json", () => {
  const c = konfiguracja({ nazwa: "Business Management", skrot: "BM", pelna: "Business Management (BM)" }, 1, 1, ["C111"], { teraz: TERAZ });
  assert.strictEqual(c.id, "wefiz-bm-1-st-2026");
  const r = zapiszKonfiguracje([{ nazwa: "Business Management", skrot: "BM", pelna: "Business Management (BM)", stopien: 1, rok: 1, grupy: ["C111"] }],
    { dir: fs.mkdtempSync(path.join(os.tmpdir(), "wefiz-")), teraz: TERAZ });
  assert.deepStrictEqual(r.pominiete.map((x) => x.powod), ["BM (plan.json)"]);
});

test("codzienny automat: inne roczniki bez pobierania, gdy uczelnia nic nie zmieniła (BM zawsze jak dotąd)", async () => {
  const { bezZmianUczelni } = await import("./update-plan.mjs");
  const K = zKonfiguracji(JSON.parse(fs.readFileSync("kierunki/wefiz-zarz-1-st-2026.json", "utf8")));
  const old = { updated: "08.11.2026", groups: { C151: {}, C152: {}, C153: {} } };
  assert.strictEqual(bezZmianUczelni(K, old, "08.11.2026", []), true);
  assert.strictEqual(bezZmianUczelni(K, old, "09.11.2026", []), false, "nowy znacznik uczelni → pobieramy");
  assert.strictEqual(bezZmianUczelni(K, { ...old, groups: { C151: {} } }, "08.11.2026", []), false, "brak wymaganej grupy → pobieramy");
  assert.strictEqual(bezZmianUczelni(K, old, "08.11.2026", ["--wymus"]), false);
  assert.strictEqual(bezZmianUczelni(K, null, "08.11.2026", []), false, "pierwszy raz → pobieramy");
  assert.strictEqual(bezZmianUczelni({ ...K, html: true }, old, "08.11.2026", []), false, "BM zawsze pobiera jak dotąd");
});

test("formularz bez listy grup (Marketing II st.): przegląd numerów, rok po przedmiotach, pamięć do następnego przebiegu", async () => {
  const MKT = ["AI w marketingu (w)", "Zarządzanie marką (ćw)", "Public relations (w)", "Marketing zrównoważony (k)", "Badania jakościowe w marketingu (lb)"];
  const BEZ_LISTY = `<select name="Kieruek"><option>Marketing (M)</option></select><p>Aktualizacja planu: 06.11.2026 11:48</p>`;
  const S = {
    "plan": BEZ_LISTY,
    "planKierunek?Kieruek=Marketing+%28M%29&rok=1+rokII": kier(MKT),          // plan kierunku bez numerów grup
    "planGrup?numerGrupy=C412": stronaGrupy("Marketing", MKT),
    "planGrup?numerGrupy=C413": stronaGrupy("Marketing", MKT.slice(0, 4)),
    "planGrup?numerGrupy=C411": stronaGrupy("Logistyka", LOG),
  };
  const log = [];
  const get = async (p) => { log.push(p); return S[p] ?? null; };
  const w = await znajdz(get, { skan: { litery: ["C", "M"], od: 410, do: 414 } });
  assert.deepStrictEqual(w.map((x) => [x.nazwa, x.stopien, x.rok, x.grupy, x.zrodlo]), [["Marketing", 2, 1, ["C412", "C413"], "przegląd numerów, rok po przedmiotach"]]);
  assert.strictEqual(log.filter((p) => p.startsWith("planGrup")).length, 10, "5 numerów × 2 litery, każdy raz");
  const r = zapiszKonfiguracje(w, { dir: fs.mkdtempSync(path.join(os.tmpdir(), "wefiz-")), teraz: TERAZ });
  assert.deepStrictEqual(r.nowe.map((x) => [x.id, x.kod]), [["wefiz-mkt-2-st-2026", "mktm26"]]);
  // drugi przebieg z pamięcią, ta sama „Aktualizacja planu”: strony grup nie są pobierane drugi raz
  const pam = JSON.parse(JSON.stringify(w.pamiec));
  assert.deepStrictEqual(Object.keys(pam.grupy).sort(), ["C411", "C412", "C413"]);
  assert.strictEqual(pam.puste.length, 7);
  const log2 = [];
  const w2 = await znajdz(async (p) => { log2.push(p); return S[p] ?? null; }, { skan: { litery: ["C", "M"], od: 410, do: 414 }, pamiec: pam });
  assert.deepStrictEqual(w2[0].grupy, ["C412", "C413"]);
  assert.strictEqual(log2.filter((p) => p.startsWith("planGrup")).length, 0);
  // nowa „Aktualizacja planu” = pamięć nieważna
  S.plan = BEZ_LISTY.replace("06.11.2026", "07.11.2026");
  const log3 = [];
  await znajdz(async (p) => { log3.push(p); return S[p] ?? null; }, { skan: { litery: ["C"], od: 410, do: 414 }, pamiec: pam });
  assert.strictEqual(log3.filter((p) => p.startsWith("planGrup")).length, 5);
});
