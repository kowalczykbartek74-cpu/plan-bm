// Etap 0 (cały US): parsery list planów na próbkach stron z scripts/fixtures/<wydział>/ (zapisane przez inwentarz --probki).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import { dataZNazwy, sekwencja, zip, xlsxNapisy, encje } from "./us/wspolne.mjs";
import { zrodlaWH, zrodlaWNS, zrodlaWNSiP, zrodlaWPIA, zrodlaWT, zrodlaWKFiZ, grupaWKFiZ, ofertaUS } from "./us/zrodla.mjs";
import { dopasuj, inicjaly, zlozKierunki, norm } from "./us/inwentarz.mjs";

const F = (w, n) => fs.readFileSync(new URL(`./fixtures/${w}/${n}`, import.meta.url), "utf8");
const plany = (l) => l.filter((z) => z.typ === "plan" && !z.pominiety);

test("daty w nazwach plików", () => {
  assert.equal(dataZNazwy("ARCH-I-i-II-st.-plan-zajec-semestr-zimowy-2026_2027-zm.-05-XI-2026.xlsx"), "2026-11-05");
  assert.equal(dataZNazwy("FP-II-st.-plan-zajec-semestr-zimowy-2026_2027-zm.-04-11-2026.xlsx"), "2026-11-04");
  assert.equal(dataZNazwy("SP-I-st.-plan-zajec-semestr-zimowy-2026_2027-zm.-2-20-X-2026.xlsx"), "2026-10-20");
  assert.equal(dataZNazwy("FGzJA-I-st.-plan-zajec-semestr-zimowy-2026_-2027-po-redukcji-grup-od-dnia-12.10.2026-r.xlsx"), "2026-10-12");
  assert.equal(dataZNazwy("biol_1-rok-I-st.-akt.-30.10.pdf"), "2026-10-30");
  assert.equal(dataZNazwy("mat_I-st.-3-rok-akt.-22.10-1.pdf"), "2026-10-22");
  assert.equal(dataZNazwy("oceanografia-I-st.-3-rok-akt-6.11.pdf"), "2026-11-06");
  assert.equal(dataZNazwy("FGzJA-I-st.-plan-zajec_-przed-redukja-grup-_semestr-zimowy-2026_-2027.xlsx"), null);
});

test("sekwencja: akapit z częściowym pogrubieniem to jeden nagłówek, encje", () => {
  const s = sekwencja('<p><strong>PSYCHOLOGIA &#8211;</strong> studia jednolite magisterskie</p><p><a href="/x/Psych-I.pdf">ROK 1</a></p>', "https://nsp.usz.edu.pl/");
  assert.deepEqual(s.map((x) => [x.t, x.tekst]), [["h", "PSYCHOLOGIA – studia jednolite magisterskie"], ["a", "ROK 1"]]);
  assert.equal(s[1].url, "https://nsp.usz.edu.pl/x/Psych-I.pdf");
  assert.equal(encje("a&#8211;b&nbsp;c&amp;d"), "a–b c&d");
});

test("WH: skróty i stopnie z nazwy pliku, starsza wersja FGzJA pominięta", () => {
  const z = zrodlaWH(F("wh", "lista-st.html"), "st", "https://hum.usz.edu.pl/");
  const p = plany(z);
  assert.ok(p.length >= 25, `plików planów: ${p.length}`);
  assert.ok(p.every((x) => x.format === "xlsx" && x.kierunki.length >= 1));
  const fgzja = z.filter((x) => x.kierunki.some((k) => k.skrot === "FGzJA"));
  assert.equal(fgzja.length, 2);
  assert.equal(fgzja.filter((x) => x.pominiety).length, 1);
  assert.match(fgzja.find((x) => !x.pominiety).wariant, /po redukcji/);
  const dwa = p.find((x) => x.kierunki.length === 2);
  assert.deepEqual(dwa?.kierunki.map((k) => [k.skrot, k.stopnie]), [["FRZJOdW", [1]], ["FROM", [2]]]);
  const fg = p.filter((x) => x.kierunki[0].skrot === "FG");
  assert.equal(fg.length, 2, "FG I st. i FG II st. to dwa osobne pliki, żaden nie jest pominięty");
  const pg = p.filter((x) => x.kierunki[0].skrot === "P_GWSN").map((x) => x.kierunki[0].lata[0]).sort();
  assert.deepEqual(pg, [2, 3]);
});

test("WNS: nagłówek = kierunek, odnośnik = stopień i lata", () => {
  const p = plany(zrodlaWNS(F("wns", "lista-st.html"), "st", "https://nsp.usz.edu.pl/"));
  assert.ok(p.length >= 30);
  const psych = p.filter((x) => x.kierunki[0].skrot === "Psych");
  assert.deepEqual(psych.map((x) => x.kierunki[0].stopien), [0, 0, 0, 0, 0]);
  assert.deepEqual(psych.map((x) => x.kierunki[0].lata[0]), [1, 2, 3, 4, 5]);
  const bn = p.filter((x) => x.kierunki[0].skrot === "BN");
  assert.deepEqual(bn.map((x) => [x.kierunki[0].stopien, x.kierunki[0].lata]), [[1, [1, 2, 3]], [2, [1, 2]]]);
  assert.ok(p.some((x) => x.kierunki[0].skrot === "SOC" && x.kierunki[0].stopien === 2));
});

test("WNS niestacjonarne: plik na zjazd", () => {
  const p = plany(zrodlaWNS(F("wns", "lista-nst.html"), "nst", "https://nsp.usz.edu.pl/"));
  assert.ok(p.length >= 20);
  assert.ok(p.every((x) => Number.isInteger(x.zjazd)));
  assert.ok(p.some((x) => /PEDAGOGIKA i PRACA SOCJALNA/.test(x.kierunki[0].nazwa)));
});

test("WNŚiP: plik na kierunek, stopień i rok", () => {
  const p = plany(zrodlaWNSiP(F("wnsip", "lista-st.html"), "st", "https://spr.usz.edu.pl/"));
  assert.ok(p.length >= 35);
  const mat = p.filter((x) => x.kierunki[0].nazwa === "matematyka").map((x) => `${x.kierunki[0].stopien}/${x.kierunki[0].lata[0]}`);
  assert.deepEqual(mat, ["1/1", "1/2", "1/3", "2/1", "2/2"]);
  assert.ok(p.some((x) => x.kierunki[0].skrot === "hydro" && x.kierunki[0].lata[0] === 1), "„hydro_1 ok I st.” (literówka na stronie)");
});

test("WPiA: nagłówek = kierunek + stopień + tryb, odnośnik = rok", () => {
  const z = zrodlaWPIA(F("wpia", "lista-st-nst.html"), "st", "https://wpia.usz.edu.pl/");
  const p = plany(z);
  const prawoSt = p.filter((x) => x.kierunki[0].nazwa === "Prawo" && x.tryb === "st");
  assert.deepEqual(prawoSt.map((x) => [x.kierunki[0].stopien, x.kierunki[0].lata[0]]), [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]]);
  const ep = p.filter((x) => /Ekonomiczno/i.test(x.kierunki[0].nazwa));
  assert.equal(ep.length, 5);
  assert.ok(p.some((x) => x.kierunki[0].nazwa === "Administracja" && x.tryb === "nst" && x.kierunki[0].stopien === 2));
  assert.ok(z.some((x) => x.typ === "sale"));
});

test("WT: tylko tygodniowe plany (bez rocznych układów przedmiotów)", () => {
  const z = zrodlaWT(F("wt", "lista-st.html"), "st", "https://teo.usz.edu.pl/");
  assert.deepEqual(plany(z).map((x) => x.kierunki[0].skrot), ["TEO", "NOR"]);
  assert.ok(z.some((x) => x.typ === "wf"));
});

test("WKFiZ: grupy z aplikacji", () => {
  assert.deepEqual(grupaWKFiZ("MwS 2 rok I stopień"), { skrot: "MwS", rok: 2, stopien: 1 });
  assert.deepEqual(grupaWKFiZ("WF 1 rok II stopień"), { skrot: "WF", rok: 1, stopien: 2 });
  assert.deepEqual(grupaWKFiZ("ERASMUS +"), { skrot: "ERASMUS", rok: 1, stopien: 1 }, "studenci z wymiany = osobny rocznik (9.11)");
  assert.equal(grupaWKFiZ("Grupa specjalna"), null);
  const r = zrodlaWKFiZ(JSON.parse(F("wkfiz", "schedule.json")), JSON.parse(F("wkfiz", "html-plans.json")), "S", "N");
  assert.ok(r.zrodla.filter((x) => x.tryb === "st").length >= 15);
  assert.ok(r.zrodla.some((x) => x.tryb === "nst"));
  assert.ok(r.zrodla.some((x) => x.grupa === "ERASMUS +"));
});

test("oferta US: kierunki z wydziałem i trybem", () => {
  const o1 = ofertaUS(F("oferta", "i-stopnia.html"), 1), o2 = ofertaUS(F("oferta", "ii-stopnia.html"), 2);
  assert.ok(o1.length >= 70 && o2.length >= 50, `${o1.length} / ${o2.length}`);
  const adm = o1.find((o) => o.nazwa === "Administracja");
  assert.equal(adm.wydzial, "Wydział Prawa i Administracji");
  assert.deepEqual(adm.tryby, ["st", "nst"]);
  assert.ok(o2.some((o) => o.nazwa === "Data Science" && o.wydzial === "Wydział Ekonomii, Finansów i Zarządzania"));
});

test("dopasowanie nazw i inicjały", () => {
  const of = [{ nazwa: "Nauki o rodzinie — doradztwo, coaching, mediacje" }, { nazwa: "Pedagogika" }, { nazwa: "Ekonomiczno-prawny" }];
  assert.equal(dopasuj("NAUKI O RODZINIE", of).nazwa, of[0].nazwa);
  assert.equal(dopasuj("PEDAGOGIKA", of).nazwa, "Pedagogika");
  assert.equal(dopasuj("Ekonomiczno-Prawny", of).nazwa, "Ekonomiczno-prawny");
  assert.equal(dopasuj("PEDAGOGIKA SPECJALNA", of), null);
  assert.equal(inicjaly("Management w sporcie"), "MWS");
  assert.equal(norm("Ekonomia (II stopień)"), "ekonomia");
});

test("kierunki: kod ze skrótu 2–6 liter, za długi → pytanie, id rocznika", () => {
  const wydz = { kod: "wns", skrot: "WNS", oferta: "WNS" };
  const oferta = [{ nazwa: "Pedagogika specjalna", wydzial: "WNS", stopien: 1, tryby: ["st"] }, { nazwa: "Psychologia", wydzial: "WNS", stopien: 1, tryby: ["st"] }];
  const wpisy = [
    { nazwa: "PEDAGOGIKA SPECJALNA", skrot: "PEDSPEC", stopien: 0, lata: [1], tryb: "st", zrodlo: "u1" },
    { nazwa: "PSYCHOLOGIA", skrot: "Psych", stopien: 0, lata: [1, 2], tryb: "st", zrodlo: "u2" },
  ];
  const r = zlozKierunki(wydz, wpisy, oferta, { teraz: new Date("2026-11-08") });
  const ps = r.kierunki.find((k) => k.pl === "Psychologia");
  assert.equal(ps.kod, "PSYCH");
  assert.deepEqual(ps.roczniki.map((x) => x.id), ["wns-psych-0-st-2026", "wns-psych-0-st-2025"]);
  assert.equal(r.kierunki.find((k) => k.pl === "Pedagogika specjalna").kod, null);
  assert.ok(r.pytania.some((q) => /PEDSPEC/.test(q) && /7 liter/.test(q)));
});

test("XLSX: odczyt napisów z zipa bez zależności", () => {
  const plik = (nazwa, tresc) => ({ nazwa: Buffer.from(nazwa), dane: zlib.deflateRawSync(Buffer.from(tresc)), dl: Buffer.byteLength(tresc) });
  const pliki = [plik("xl/sharedStrings.xml", '<sst><si><t>Kierunek: Historia</t></si><si><r><t>I </t></r><r><t>rok</t></r></si></sst>')];
  const lok = [], cen = [];
  let off = 0;
  for (const p of pliki) {
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(8, 8); h.writeUInt32LE(p.dane.length, 18); h.writeUInt32LE(p.dl, 22); h.writeUInt16LE(p.nazwa.length, 26);
    lok.push(h, p.nazwa, p.dane);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(p.dane.length, 20); c.writeUInt32LE(p.dl, 24); c.writeUInt16LE(p.nazwa.length, 28); c.writeUInt32LE(off, 42);
    cen.push(c, p.nazwa);
    off += 30 + p.nazwa.length + p.dane.length;
  }
  const cd = Buffer.concat(cen), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(pliki.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  const buf = Buffer.concat([...lok, cd, e]);
  assert.deepEqual(Object.keys(zip(buf)), ["xl/sharedStrings.xml"]);
  assert.deepEqual(xlsxNapisy(buf), ["Kierunek: Historia", "I rok"]);
});
