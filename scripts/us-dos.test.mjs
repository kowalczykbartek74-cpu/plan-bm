// Etap 6 (cały US): odwołane zajęcia ze wszystkich 8 sekcji DOS. Próbki z 9.11.2026 w scripts/fixtures/dos/:
//   <sekcja>.html        – lista wpisów (tylko bloki wpisów i „Starsze”), cukrowa/mickiewicza – pełne strony z 8.11
//   <sekcja>-wpisy.json  – prawdziwe wpisy (tytuł + treść) z WH (piastow), WNS (krakowska), WNŚiP (waska)
// Plany w testach są małe i zbudowane z prawdziwych zajęć tych roczników (nie zależą od kolejnych importów).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseList, resolve, findDates } from "./dziekanat.mjs";
import { dopasowanie, formularz, formularzDla, rokZ, stopienZ, grupaZ } from "./us/dos-dopasuj.mjs";

const fx = (f) => fs.readFileSync(new URL(`./fixtures/dos/${f}`, import.meta.url), "utf8");
const wpisy = (f) => JSON.parse(fx(`${f}-wpisy.json`));
const kalendarz = JSON.parse(fs.readFileSync("plan.json", "utf8")).kalendarz;
const plan = (g, zajecia) => ({ groups: { [g]: { odd: zajecia, even: zajecia } }, kalendarz });
// tak jak zUS w dziekanat.mjs: dopasowanie rocznika + formularz
const opcje = (r, p) => {
  const m = dopasowanie(r, p), nasz = formularzDla(r);
  return { rozsz: true, formularz: (post) => { const f = formularz(post.text); return f ? f.filter(nasz) : null; },
    dopasuj: (post, known) => { const x = m(post); return x ? known.map((g) => ({ g, sub: "", ...(x.nr ? { nr: x.nr } : {}), niska: x.pewnosc === "niska", prowadzacy: x.prowadzacy })) : []; } };
};

test("lista wpisów z każdej sekcji DOS: adresy /<budynek>/<lista>/RRRR/MM/…, tylko własny budynek, „Starsze”", () => {
  const S = { krakowska: "krakowska/zajecia-krakowska", narutowicza: "narutowicza/zajecia-narutowicza", teologia: "teologia/zajecia-teologia", piastow: "piastow/zajecia-piastow",
    "piastow-wkfiz": "piastow/zajecia-piastow-wkfiz", waska: "waska/zajecia-waska", cukrowa: "cukrowa/zajecia-cukrowa", mickiewicza: "mickiewicza/zajecia-mickiewicza" };
  for (const [f, u] of Object.entries(S)) {
    const { posts, older } = parseList(fx(`${f}.html`), `https://dos.usz.edu.pl/${u}/`);
    assert.ok(posts.length >= 3, f);
    assert.ok(posts.every((p) => p.url.startsWith(`https://dos.usz.edu.pl/${u.split("/")[0]}/`) && /^\d{4}-\d{2}$/.test(p.ym)), f);
    assert.match(older, /\/page\/2\//, f);
  }
  // Mickiewicza: wpisy „Grupa M170-M171” mają adres z /zajecia-mickiewicza/ – wcześniej wypadały z listy
  assert.ok(parseList(fx("mickiewicza.html"), "https://dos.usz.edu.pl/mickiewicza/zajecia-mickiewicza/").posts.some((p) => p.title === "Grupa M170-M171"));
});

test("rok, stopień, grupa z tytułu (PL i EN)", () => {
  assert.deepEqual(["Geologia I st. 1 rok – x", "dla V roku, kier. psychologia", "Hydrobiology 1st degree 2nd year – x", "PSM I st. I r. zmiana sali", "BPK II st. 2 rok"].map((t) => [rokZ(t), stopienZ(t)]),
    [[1, 1], [5, null], [2, 1], [1, 1], [2, 2]]);
  assert.deepEqual([grupaZ("Mikrobiologia II st. 1 rok (Gr.1)"), grupaZ("GiBE I st. 1 rok GR. 1"), grupaZ("sala 211")], ["1", "1", null]);
});

test("daty bez roku tylko poza BM: „4.11”, „30.X”, „5th of November”, nie godzina „10.15”", () => {
  const k = (t) => findDates(t, 2026, { rozsz: true, mHint: 11 }).map((d) => d.k);
  assert.deepEqual(k("w dniu 4.11 godz. 10.15"), ["2026-11-04"]);
  assert.deepEqual(k("zmiana sali w dn. 30.X"), ["2026-10-30"]);
  assert.deepEqual(k("cancelled on Thursday, the 5th of November"), ["2026-11-05"]);
  assert.deepEqual(k("od 7 I do 14 I"), ["2027-01-07", "2027-01-14"], "styczeń = następny rok kalendarzowy");
  assert.deepEqual(findDates("w dniu 4.11", 2026).map((d) => d.k), [], "BM i WEFiZ bez zmian");
});

test("WH: formularz nieobecności → odwołanie obu grup i termin odrabiania (Stosunki międzynarodowe 1 rok)", () => {
  const [post] = wpisy("piastow");
  const f = formularz(post.text);
  assert.deepEqual(f.map((x) => [x.zDnia, x.zGodz, x.naDzien, x.naGodz, x.sala, x.kierunek, x.stopien, x.rok, x.k]),
    [["2026-11-09", "17:00", "2026-11-18", "15:30", "071", "stosunki międzynarodowe", 1, 1, "CW"]]);
  const r = { kierunek: { pl: "Stosunki międzynarodowe" }, skroty: ["SM"], rok: 1, stopien: 1, tryb: "st", inne: [] };
  const p = plan("SM1", [
    { d: 0, time: ["17:00", "18:30"], pl: "historia stosunków międzynarodowych 1815-1918", k: "CW", p: "dr J. Morawska-Tołek", r: "s.072 (IH)", pg: "gr:1A" },
    { d: 0, time: ["18:45", "20:15"], pl: "historia stosunków międzynarodowych 1815-1918", k: "CW", p: "dr J. Morawska-Tołek", r: "s.072 (IH)", pg: "gr:1B" },
    { d: 0, time: ["13:30", "15:00"], pl: "polityka gospodarcza", k: "W", p: "dr L. Kłos" }]);
  const z = resolve(p, [post], opcje(r, p)).SM1;
  assert.deepEqual(z.filter((x) => x.type === "cancel").map((x) => [x.date, x.start, x.moved]), [["2026-11-09", "17:00", true], ["2026-11-09", "18:45", true]]);
  const odr = z.find((x) => x.type === "extra");
  assert.deepEqual([odr.date, odr.start, odr.end, odr.r, odr.k], ["2026-11-18", "15:30", "17:00", "s. 071", "CW"]);
  // inny rocznik (SM 2 rok) – formularz go nie dotyczy
  assert.deepEqual(resolve(p, [post], opcje({ ...r, rok: 2 }, p)).SM1, []);
});

test("WH: wpis z kilkoma kierunkami w jednym formularzu trafia tylko do właściwego rocznika (Majewicz: SPI 3 rok, FPOL 2 rok)", () => {
  const post = wpisy("piastow")[1];
  const fp = { kierunek: { pl: "Filologia polska" }, skroty: ["FPOL"], rok: 2, stopien: 1, tryb: "st", inne: [] };
  assert.deepEqual(formularz(post.text).filter(formularzDla(fp)).map((x) => [x.zDnia, x.zGodz, x.przedmiot]),
    [["2026-11-12", "10:00", "motywy, wątki i tematy antyczne w literaturze i kulturze współczesnej"]]);
  assert.equal(formularz(post.text).filter(formularzDla({ ...fp, rok: 3 })).length, 0);
});

test("WH: tylko prowadzący w tytule → niska pewność: notka pod dniem, bez zgadywania zajęć", () => {
  const post = wpisy("piastow")[3];   // dr Barbara Popiel-Kobielska – seminarium FP II st., 12 listopada
  const r = { kierunek: { pl: "Filologia polska" }, skroty: ["FPOL"], rok: 1, stopien: 2, tryb: "st", inne: ["Studia pisarskie"] };
  const p = plan("FPOL1", [{ d: 3, time: ["10:00", "11:30"], pl: "seminarium magisterskie", k: "S", p: "dr B. Popiel-Kobielska" }]);
  const z = resolve(p, [post], opcje(r, p)).FPOL1;
  assert.deepEqual(z.map((x) => [x.type, x.date, !!x.niska]), [["note", "2026-11-12", true]]);
  // rocznik, w którym ta osoba nie uczy – nic
  const q = plan("FPOL1", [{ d: 3, time: ["10:00", "11:30"], pl: "inne", k: "K", p: "dr A. Nowak" }]);
  assert.deepEqual(resolve(q, [post], opcje(r, q)).FPOL1, []);
});

test("WNS: rok przy właściwym kierunku z listy, niestacjonarne odrzucone, formularz bez zdania wstępnego", () => {
  const [krol, kerestey, kozinska] = wpisy("krakowska");
  const p = plan("EA3", [{ d: 0, time: ["10:00", "11:30"], pl: "x", k: "W", p: "dr hab. Joanna Król, prof. US" }]);
  const ea = (rok) => dopasowanie({ kierunek: { pl: "Edukacja artystyczna" }, skroty: ["EA"], rok, stopien: 1, tryb: "st", inne: [] }, p)(krol);
  assert.equal(ea(3)?.pewnosc, "wysoka"); assert.equal(ea(1), null);
  assert.equal(dopasowanie({ kierunek: { pl: "Pedagogika" }, skroty: ["Ped-o"], rok: 2, stopien: 1, tryb: "st", inne: [] }, p)(kozinska), null);
  const f = formularz(kerestey.text);
  assert.deepEqual(f.map((x) => [x.kierunek, x.stopien, x.rok, x.zDnia, x.naDzien, x.naGodz]), [["psychologia", 0, 3, "2026-10-15", "2026-10-29", "9:00"]]);
});

test("WNŚiP: kierunek + rok w tytule → odwołanie konkretnych zajęć (PL i EN), grupa z tytułu, inne roczniki bez zmian", () => {
  const [geo, hydro, gibe, bpk] = wpisy("waska");
  const r = { kierunek: { pl: "Geologia", en: "Geology" }, skroty: ["GEOL"], rok: 1, stopien: 1, tryb: "st", inne: ["Geografia"] };
  const p = plan("GEOL1", [{ d: 2, time: ["10:00", "11:30"], pl: "chemia", k: "LAB", p: "dr T. Miller" }, { d: 2, time: ["12:00", "13:30"], pl: "geologia ogólna", k: "W", p: "dr A. B" }]);
  assert.deepEqual(resolve(p, [geo], opcje(r, p)).GEOL1.map((x) => [x.type, x.date, x.start, x.pl]), [["cancel", "2026-11-04", "10:00", "chemia"]]);
  assert.deepEqual(resolve(p, [geo], opcje({ ...r, rok: 2 }, p)).GEOL1, [], "2 rok Geologii – nie dotyczy");
  const h = { kierunek: { pl: "Hydrobiologia", en: "Hydrobiology" }, skroty: [], rok: 2, stopien: 1, tryb: "st", inne: [] };
  const ph = plan("HYD2", [{ d: 3, time: ["08:15", "09:45"], pl: "microbiology of the aquatic environment", k: "W", p: "dr Agata Poniewierska-Baran" }]);
  assert.deepEqual(resolve(ph, [hydro], opcje(h, ph)).HYD2.map((x) => [x.type, x.date, x.start]), [["cancel", "2026-11-05", "08:15"]]);
  const g = { kierunek: { pl: "Genetyka i biologia eksperymentalna" }, skroty: ["GiBE"], rok: 1, stopien: 1, tryb: "st", inne: [] };
  const pg = plan("GIBE1", [{ d: 2, time: ["08:15", "09:45"], pl: "biologia komórki", k: "LAB", p: "dr I. Szućko-Kociuba", pg: "gr:1" }, { d: 2, time: ["08:15", "09:45"], pl: "biologia komórki", k: "LAB", p: "dr I. Szućko-Kociuba", pg: "gr:2" }]);
  assert.equal(resolve(pg, [gibe], opcje(g, pg)).GIBE1.filter((x) => x.type === "cancel").length, 1, "tylko GR. 1");
  const b = { kierunek: { pl: "Biologia" }, skroty: ["BPK"], rok: 2, stopien: 2, tryb: "st", inne: [] };
  const pb = plan("BPK2", [{ d: 1, time: ["10:00", "11:30"], pl: "farmakologia i metabolizm związków psychoaktywnych", k: "W", p: "dr A. Maruszewska" }]);
  assert.deepEqual(resolve(pb, [bpk], opcje(b, pb)).BPK2.map((x) => [x.type, x.date]), [["cancel", "2026-10-27"], ["cancel", "2026-11-03"]]);
});

test("WH: formularz, a w planie dwa zajęcia o tej godzinie i literówka w nazwie → wybór po prowadzącym z tytułu, nie oba", () => {
  const post = wpisy("piastow")[4];   // dr Aleksandra Kamińska – „tłumaczenia pisemne”, w planie „pismne”
  const r = { kierunek: { pl: "Filologia romańska z językiem obcym do wyboru" }, skroty: ["FRZJO"], rok: 2, stopien: 1, tryb: "st", inne: [] };
  const p = plan("FRZJO2", [{ d: 0, time: ["17:00", "18:30"], pl: "psychologia ogólna", k: "W", p: "dr E. Pieńkowska" },
    { d: 0, time: ["17:00", "18:30"], pl: "tłumaczenia pismne (francusko-polskie, polsko-francuskie)", k: "CW", p: "dr A. Kamińska" }]);
  assert.deepEqual(resolve(p, [post], opcje(r, p)).FRZJO2.map((x) => [x.type, x.date, x.pl]), [["cancel", "2026-10-12", "tłumaczenia pismne (francusko-polskie, polsko-francuskie)"]]);
});

test("WPiA: „SSP IV” = Prawo 4 rok, lista grup, różne godziny odrabiania nie są zgadywane; „N…” = niestacjonarne; IEBL po angielsku", () => {
  const [ssp, ssa, nsp, iebl] = wpisy("narutowicza");
  const prawo = { kierunek: { pl: "Prawo", en: "Law" }, skroty: ["PRAWO", "SSP"], rok: 4, stopien: 0, tryb: "st", nst: ["NSP", "NSA", "NPSM"], inne: ["Administracja"], inneSkroty: ["ADM", "SSA", "PSM", "IEBL"] };
  const zaj = (pg) => ({ d: 1, time: ["10:00", "11:30"], pl: "Prawo rodzinne", k: "CW", p: "dr A. Tomczyk", pg: `Prawo rodzinne:${pg}` });
  const p = plan("PRAWO4", [zaj(1), zaj(4), { d: 1, time: ["12:00", "13:30"], pl: "Prawo karne", k: "W", p: "dr X Y" }]);
  const z = resolve(p, [ssp], opcje(prawo, p)).PRAWO4;
  assert.deepEqual(z.map((x) => [x.type, x.date, x.start, x.pl]), [["cancel", "2026-11-03", "10:00", "Prawo rodzinne"]], "gr. 1 tak, gr. 4 nie; bez zgadniętego odrabiania 15.12");
  assert.deepEqual(resolve(p, [ssp], opcje({ ...prawo, rok: 3 }, p)).PRAWO4, [], "SSP IV ≠ 3 rok");
  assert.deepEqual(resolve(p, [ssa, nsp], opcje(prawo, p)).PRAWO4, [], "SSA to Administracja, NSP to niestacjonarne");
  const adm = { kierunek: { pl: "Administracja" }, skroty: ["ADM", "SSA"], rok: 1, stopien: 1, tryb: "st", nst: ["NSA"], inne: ["Prawo"], inneSkroty: ["SSP", "PRAWO"] };
  const pa = plan("ADM1", [{ d: 2, time: ["08:15", "09:45"], pl: "Podstawy prawoznawstwa", k: "CW", p: "mgr M. Sowa", pg: "Podstawy prawoznawstwa:3" }, { d: 2, time: ["08:15", "09:45"], pl: "Podstawy prawoznawstwa", k: "CW", p: "mgr K. Inna", pg: "Podstawy prawoznawstwa:2" }]);
  assert.deepEqual(resolve(pa, [ssa], opcje(adm, pa)).ADM1.map((x) => [x.type, x.date]), [["cancel", "2026-11-04"]]);
  const ie = { kierunek: { pl: "International and European Business Law" }, skroty: ["IEBL"], rok: 2, stopien: 2, tryb: "st", nst: [], inne: [], inneSkroty: ["SSP", "SSA"] };
  const pi = plan("IEBL2", [{ d: 2, time: ["15:15", "16:45"], pl: "Environmental Law and Business", k: "CW", p: "dr A. Ogonowska" }]);
  assert.deepEqual(resolve(pi, [iebl], opcje(ie, pi)).IEBL2.map((x) => [x.type, x.date, x.start]), [["cancel", "2026-11-04", "15:15"]]);
});

test("WT (Teologia) i WKFiZ: wpis tylko z prowadzącym = notka; wykład ogólnouczelniany z innej sekcji nie trafia do WKFiZ", () => {
  const [kozak] = wpisy("teologia");
  const nor = { kierunek: { pl: "Nauki o rodzinie — doradztwo, coaching, mediacje" }, skroty: ["NOR"], rok: 2, stopien: 1, tryb: "st", inne: ["Teologia"] };
  const kal = { ...kalendarz, tygodnie: [["2026-03-02", "2026-03-06", "odd"]], wolne: {}, zamiany: {} };
  const p = { groups: { NOR2: { odd: [{ d: 3, time: ["13:30", "15:00"], pl: "Psychologia osobowości", k: "X", p: "Dr Igor Kozak" }], even: [] } }, kalendarz: kal };
  assert.deepEqual(resolve(p, [kozak], opcje(nor, p)).NOR2.map((x) => [x.type, x.date, !!x.niska]), [["note", "2026-03-05", true]]);
  const wkfiz = parseList(fx("piastow-wkfiz.html"), "https://dos.usz.edu.pl/piastow/zajecia-piastow-wkfiz/").posts;
  assert.ok(wkfiz.every((x) => !/\/waska\//.test(x.url)), "wpisy z Wąskiej (wykłady ogólnouczelniane w każdej kategorii) pominięte");
});
