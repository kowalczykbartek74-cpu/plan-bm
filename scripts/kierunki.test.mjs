// Inne roczniki w plan-bm: konfiguracja z kierunki/*.json, parser planów z samą polską nazwą, lista na stronie.
// node --test scripts/*.test.mjs
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import { parseEntry } from "./parse.mjs";
import { zKonfiguracji } from "./update-plan.mjs";
import { zKonfiguracji as dzKonfiguracji, parseList, SOURCE } from "./dziekanat.mjs";
import { lista, wstaw } from "./kierunki.mjs";

const Y = [2026, 2027];
const komorka = (tytul, naucz = "dr Jan Nowak", sala = "s. 104 Cuk.8") =>
  `${tytul} <br/><form action="planNaucz"><input class="linkClass" type="submit" value="${naucz}" /></form><form action="planSal"><input class="salButtonClass" type="submit" value="${sala}" /></form>`;

test("parser: lab z grupą bez nazwy angielskiej („PODSTAWY FINANSÓW (LB) GRUPA A”)", () => {
  const e = parseEntry(komorka("PODSTAWY FINANSÓW (LB) GRUPA A"), Y);
  assert.deepStrictEqual({ pl: e.pl, k: e.k, g: e.g, p: e.p, r: e.r }, { pl: "Podstawy finansów", k: "LAB", g: "A", p: "dr Jan Nowak", r: "s. 104" });
});

test("parser: wykład e-learning z datami w opisie", () => {
  const e = parseEntry("OCHRONA WŁASNOŚCI INTELEKTUALNEJ (W e-learning)\ndr hab. Anna Kowal\nMS Teams Z I 1rok\ndaty zajęć: 15.10; 29.10; 12.11; 26.11.2026", Y);
  assert.strictEqual(e.k, "W");
  assert.strictEqual(e.tag, "e-learning");
  assert.deepStrictEqual(e.dates, ["2026-10-15", "2026-10-29", "2026-11-12", "2026-11-26"]);
  assert.strictEqual(e.x, "dr hab. Anna Kowal MS Teams Z I 1rok");
});

test("parser: wpisy BM (nazwa EN + PL) i ręczne bez typu jak dotąd", () => {
  const e = parseEntry(komorka("MACROECONOMICS (MAKROEKONOMIA) (ĆW)"), Y);
  assert.deepStrictEqual({ pl: e.pl, en: e.en, k: e.k }, { pl: "Makroekonomia", en: "Macroeconomics", k: "CW" });
  assert.strictEqual(parseEntry("Odrabianie zajęć \n17.11.2026\ndr D. Kordela\ngrupa B\nsala s. SIL 116 lab", Y).k, "X");
});

test("parser: rodzaj, grupa labów i godziny w nazwie (FiR: „MAKROEKONOMIA (ĆW)(30)”, „(LAB GR. A)(15)”)", () => {
  const cw = parseEntry(komorka("makroekonomia (ćw)(30)", "dr Anna Kowalska", "s.S0123 Mic.64"), Y);
  assert.deepStrictEqual({ pl: cw.pl, k: cw.k, g: cw.g, h: cw.h, r: cw.r }, { pl: "Makroekonomia", k: "CW", g: undefined, h: 30, r: "s. S0123" });
  const lab = parseEntry(komorka("podstawy finansów (lab gr. B)(15)", "dr Jan Nowak", "s.N08d lab Mic.64"), Y);
  assert.deepStrictEqual({ pl: lab.pl, k: lab.k, g: lab.g, h: lab.h, r: lab.r }, { pl: "Podstawy finansów", k: "LAB", g: "B", h: 15, r: "s. N08d (lab)" });
  const w = parseEntry(komorka("ochrona własności intelektualnej (w)(8)", "dr Jan Nowak", "s.Aula Nowa Mic.64"), Y);
  assert.deepStrictEqual({ k: w.k, h: w.h, r: w.r }, { k: "W", h: 8, r: "s. Aula Nowa" });
});

test("parser: EaIA – polska nazwa, angielska w nawiasie („makroekonomia (macroeconomics) (ćw)(30)”)", () => {
  const e = parseEntry(komorka("makroekonomia (macroeconomics) (ćw)(30)", "dr Anna Kowalska", "s.S0123 Mic.64"), Y);
  assert.deepStrictEqual({ pl: e.pl, en: e.en, k: e.k, h: e.h }, { pl: "Makroekonomia", en: "Macroeconomics", k: "CW", h: 30 });
  const lab = parseEntry(komorka("technologie informacyjne (information technologies - IT) (lb gr.A)(15)"), Y);
  assert.deepStrictEqual({ pl: lab.pl, en: lab.en, g: lab.g }, { pl: "Technologie informacyjne", en: "Information Technologies - IT", g: "A" });
  // angielska z przodu (inne kierunki): bez zmian, całość zostaje nazwą
  const bm = parseEntry(komorka("communication in the global business (komunikacja w biznesie globalnym) (w)(15)"), Y);
  assert.strictEqual(bm.en, undefined);
});

test("parser: wpis ręczny z kropką po dacie („08.10.2026.” i miejsce w następnej linii)", () => {
  const e = parseEntry("szkolenie z obrony cywilnej \n08.10.2026. \nAula WNS ul Krakowska 71/79\n", Y);
  assert.deepStrictEqual({ pl: e.pl, k: e.k, dates: e.dates, x: e.x }, { pl: "Szkolenie z obrony cywilnej", k: "X", dates: ["2026-10-08"], x: "Aula WNS ul Krakowska 71/79" });
});

test("dziekanat: lista wpisów z sekcji DOS dowolnego budynku, BM dalej z Cukrowej", () => {
  const html = (b, l) => `<h2 class="entry-title"><a href="https://dos.usz.edu.pl/${b}/2026/10/m120-x/">M120- odwołanie zajęć</a></h2>
    <h2 class="entry-title"><a href="https://dos.usz.edu.pl/cukrowa/2026/10/c111-y/">GRUPA C111</a></h2>
    <a href="https://dos.usz.edu.pl/${b}/${l}/page/2/?et_blog">« Starsze wpisy</a>`;
  const mic = parseList(html("mickiewicza", "zajecia-mickiewicza"), "https://dos.usz.edu.pl/mickiewicza/zajecia-mickiewicza/");
  assert.deepStrictEqual(mic.posts.map(p => p.title), ["M120- odwołanie zajęć"]);
  assert.match(mic.older, /zajecia-mickiewicza\/page\/2/);
  const cuk = parseList(html("cukrowa", "zajecia-cukrowa"));
  assert.deepStrictEqual(cuk.posts.map(p => p.title), ["M120- odwołanie zajęć", "GRUPA C111"]);   // bez adresu: Cukrowa (BM)
  assert.match(cuk.older, /zajecia-cukrowa\/page\/2/);
  assert.strictEqual(SOURCE, "https://dos.usz.edu.pl/cukrowa/zajecia-cukrowa/");
});

test("dziekanat: \"dos\" w konfiguracji rocznika ma pierwszeństwo przed adresem wydziału", async () => {
  const K = dzKonfiguracji({ id: "wefiz-fir-1-st-2026", plik: "plan/wefiz-fir-1-st-2026.json", grupy: ["M120"], wydzial: { kod: "WEFiZ" }, odwolania: ["dos"], dos: "https://dos.usz.edu.pl/mickiewicza/zajecia-mickiewicza/" });
  assert.strictEqual(await K.source(null), "https://dos.usz.edu.pl/mickiewicza/zajecia-mickiewicza/");
});

test("konfiguracja kierunku: grupy z pliku + 3 kolejne numery, plik plan/<id>.json, nazwa bez skrótu", () => {
  for (const f of fs.readdirSync("kierunki").filter(f => f.endsWith(".json"))) {
    const c = JSON.parse(fs.readFileSync("kierunki/" + f, "utf8"));
    const K = zKonfiguracji(c);
    assert.strictEqual(K.plik, `plan/${c.id}.json`);
    assert.strictEqual(K.html, false, "kopia w index.html tylko dla BM");
    assert.deepStrictEqual(K.wymagane, c.grupy);
    assert.strictEqual(K.kandydaci.length, c.grupy.length + 3);
    assert.ok(!/\(/.test(K.kierunek), K.kierunek);
    assert.strictEqual(K.rocznik, c.id, "import z kolejki Skrótu dla tego rocznika");
    const D = dzKonfiguracji(c);
    assert.strictEqual(D.plik, K.plik);
    assert.ok(c.grupy.every(D.grupy) && !D.grupy("C111"), "dziekanat: tylko grupy rocznika");
  }
  const z = zKonfiguracji({ id: "x-a-1-st-2026", system: { nazwa: "Abc (A)" }, grupy: ["C151", "C152", "C153"], plik: "plan/x-a-1-st-2026.json", kierunek: { pl: "Abc" }, wydzial: { kod: "X" }, rok: 1 });
  assert.deepStrictEqual(z.kandydaci, ["C151", "C152", "C153", "C154", "C155", "C156"]);
  assert.strictEqual(z.kierunek, "Abc");
  assert.throws(() => zKonfiguracji({ id: "x", system: { nazwa: "A" }, grupy: ["C1"], plik: "plan.json" }), /konfiguracja/);
});

test("lista roczników na stronie jest aktualna, a wstawienie drugi raz nic nie zmienia", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.strictEqual(wstaw(html, lista()), html, "node scripts/kierunki.mjs");
  assert.strictEqual(wstaw(wstaw(html, lista()), lista()), html);
  for (const r of lista()) assert.ok(fs.existsSync(r.plik), `brak ${r.plik}`);
});

test("plan każdego rocznika ma format plan.json BM (groups → odd/even, kalendarz, dziekanat)", () => {
  for (const r of lista()) {
    const p = JSON.parse(fs.readFileSync(r.plik, "utf8"));
    assert.ok(Object.keys(p.groups).length > 0, r.id);
    for (const [g, v] of Object.entries(p.groups)) assert.ok(Array.isArray(v.odd) && Array.isArray(v.even), `${r.id} ${g}`);
    assert.ok(p.kalendarz?.tygodnie?.length, `${r.id}: kalendarz`);
    assert.ok(p.dziekanat?.source?.startsWith("https://dos.usz.edu.pl/"), `${r.id}: komunikaty DOS`);
    assert.strictEqual(p.id, r.id);
  }
});
