// Etap 5 (cały US): parser PDF WNŚiP na zapisanym tekście PDF-ów z 8.11.2026 (scripts/fixtures/wnsip/: Matematyka I st. 1 rok,
// Biologia I st. 1 rok), bez Pythona.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { stronaNaZajecia, podzialKomorki, zajeciaZLinii, plikNaPlan } from "./us/wnsip-pdf.mjs";
import { waliduj } from "./us/wspolne.mjs";

const strona = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/wnsip/${n}.json`, import.meta.url), "utf8")).strony[0];
const sem = { od: "2026-10-01", do: "2027-02-01" };
const D = ["pon", "wt", "śr", "czw", "pt"];
const opis = (w) => `${D[w.d]} ${w.time.join("-")} ${w.k} ${w.pl} | ${w.p} | ${w.r}`;

test("Matematyka 1 rok: 13 zajęć dokładnie jak w PDF (komórki z linii, nie z tła)", () => {
  const r = stronaNaZajecia(strona("mat1"), { sem });
  assert.deepEqual(r.wpisy.map(opis).sort(), [
    "czw 08:15-09:50 W Ochrona własności intelektualnej | dr P. Katner | s. 116 (aula)",
    "pon 11:45-13:20 W Wstęp do matematyki współczesnej | dr E. Ciechanowicz | s. 212",
    "pon 13:30-14:15 K Wstęp do matematyki współczesnej | dr E. Ciechanowicz | s. 212",
    "pon 14:20-16:00 K Wstęp do algebry | dr M. Wieczorek | s. 212",
    "pt 10:00-11:35 W Elementarna teoria liczb | dr hab. T. Jędrzejak, prof. US | s. 212",
    "pt 11:45-13:20 K Elementarna teoria liczb | dr hab. T. Jędrzejak, prof. US | s. 212",
    "pt 13:30-16:00 K Wstęp do analizy matematycznej | dr M. Wieczorek | s.212",
    "wt 10:00-11:35 W Wstęp do matematyki współczesnej | dr E. Ciechanowicz | s. 212",
    "wt 11:45-13:20 K Wstęp do matematyki współczesnej | dr E. Ciechanowicz | s. 212",
    "wt 13:30-16:00 K Wstęp do analizy matematycznej | dr M. Wieczorek | s.212",
    "śr 10:50-12:30 W Wstęp do geometrii | dr E. Ciechanowicz | s. 212",
    "śr 12:35-14:15 K Wstęp do geometrii | dr E. Ciechanowicz | s. 212",
    "śr 14:20-16:00 K Wstęp do algebry | dr M. Wieczorek | s. 212",
  ]);
  const an = r.wpisy.find((w) => w.d === 1 && /analizy/.test(w.pl));
  assert.equal(an.daty.length, 11); assert.equal(an.daty[0], "2026-10-27"); assert.ok(!an.daty.includes("2026-12-22"), "„27.10 - 15.12; 12.01 - 26.01”: przerwa świąteczna");
  assert.deepEqual(r.wpisy.find((w) => /Ochrona/.test(w.pl)).daty, ["2026-10-15", "2026-10-29", "2026-11-12", "2026-11-26"]);
});

test("Biologia 1 rok: dni podzielone na grupy, godzina z pierwszej linii, sale z literą budynku", () => {
  const r = stronaNaZajecia(strona("biol1"), { sem });
  assert.ok(r.wpisy.length >= 18);
  const h = r.wpisy.find((w) => w.d === 0 && w.pl === "Histologia");
  assert.deepEqual([h.time, h.k, h.p, h.r], [["08:15", "09:45"], "W", "dr L. Kirczuk", "s. 202F"]);
  const ch = r.wpisy.filter((w) => w.d === 0 && /Chemia/.test(w.pl));
  assert.equal(ch.length, 1, "bez dubla z rozciętej komórki");
  assert.deepEqual([ch[0].time, ch[0].k, ch[0].pg, ch[0].r], [["12:00", "15:15"], "LAB", "gr:1", "s. 005W"]);
  assert.ok(r.wpisy.some((w) => w.pg === "gr:2"));
  const { groups } = plikNaPlan(null, "BIOL1", { sem, tekst: { strony: [strona("biol1")] } });
  assert.deepEqual(waliduj({ groups }), []);
});

test("zajęcia z linii: angielski rodzaj, godziny co 5 min, tytuły bez kropek, wyjątki do notki", () => {
  const z = zajeciaZLinii([{ y: 0, t: "10:50-12:20 Cell biology [lecture/10h] online classes* 12.10-16.11 prof US dr hab Lidia Skuza" }], 0, sem);
  assert.deepEqual([z.time, z.pl, z.k, z.p, z.r, z.daty.length], [["10:50", "12:20"], "Cell biology", "W", "prof US dr hab Lidia Skuza", "online", 6]);
  const p = zajeciaZLinii([{ y: 0, t: "10:00-11:30 Marine Invertebrates [practical classes/20h] room 016W 13.10-15.12 dr Tomasz Krepski" }], 1, sem);
  assert.deepEqual([p.k, p.r, p.p], ["CW", "s. 016W", "dr Tomasz Krepski"]);
  const m = zajeciaZLinii([{ y: 0, t: "Mikrobiologia [w/20h] 06.10.-08.12. s. 104W dr n. med. A. Poniewierska-Baran 24.11 - 8:30-10:30" }], 1, sem);
  assert.equal(m.p, "dr n. med. A. Poniewierska-Baran"); assert.match(m.n, /inne godziny: 24\.11/);
  assert.equal(podzialKomorki([{ y: 1, t: "Wstęp do geometrii" }, { y: 2, t: "[w/30h]" }, { y: 3, t: "dr E. C." }, { y: 4, t: "Wstęp do algebry [k/30h]" }]).length, 2);
});
