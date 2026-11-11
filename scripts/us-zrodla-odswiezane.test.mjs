// Lista plików wydziałów odświeżana przed importem (update-plan.mjs --wszystkie → inwentarz + scalZrodla):
// nowa nazwa pliku wchodzi od razu, chwilowa awaria sieci nie psuje listy.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scalZrodla } from "./us/inwentarz.mjs";
import { pobieracz } from "./us/wspolne.mjs";

const z = (plik, extra = {}) => ({ url: `https://x.usz.edu.pl/${plik}`, plik, format: "pdf", kierunki: [], sha256: "a", rozmiar: 1, ...extra });
const stare = { opis: "o", wydzialy: {
  wh: { skrot: "WH", zrodla: [z("FN-zm.-30-X.xlsx"), z("H.xlsx")] },
  wns: { skrot: "WNS", zrodla: [z("PPIW-15.pdf"), z("A.pdf"), z("B.pdf")] },
  wpia: { skrot: "WPiA", zrodla: [z("I-SSA.pdf"), z("II-SSA.pdf")] },
} };

test("nowa nazwa pliku zastępuje starą", () => {
  const r = scalZrodla(stare, { wydzialy: { ...stare.wydzialy, wh: { skrot: "WH", zrodla: [z("FN-zm.-10-XI.xlsx", { sha256: "b" }), z("H.xlsx")] } } });
  assert.deepEqual(r.zrodla.wydzialy.wh.zrodla.map((x) => x.plik), ["FN-zm.-10-XI.xlsx", "H.xlsx"]);
  assert.match(r.zmiany.join(), /wh: nowe FN-zm\.-10-XI\.xlsx; zniknęły FN-zm\.-30-X\.xlsx/);
  assert.equal(r.zrodla.opis, "o");
});

test("plik bez odpowiedzi → poprzedni wpis; 404 zostaje 404", () => {
  const r = scalZrodla(stare, { wydzialy: { ...stare.wydzialy, wpia: { skrot: "WPiA", zrodla: [
    { ...z("I-SSA.pdf"), sha256: undefined, blad: "brak odpowiedzi: https://x.usz.edu.pl/I-SSA.pdf" },
    { ...z("II-SSA.pdf"), sha256: undefined, blad: "brak pliku (404)" }] } } });
  const [a, b] = r.zrodla.wydzialy.wpia.zrodla;
  assert.equal(a.sha256, "a"); assert.equal(a.blad, undefined);
  assert.equal(b.blad, "brak pliku (404)");
  assert.equal(r.zachowane.length, 1);
  assert.deepEqual(r.zmiany, []);
});

test("strona wydziału nie odpowiedziała albo lista wyraźnie krótsza → cała poprzednia lista", () => {
  const r = scalZrodla(stare, { wydzialy: { ...stare.wydzialy, wh: { skrot: "WH", zrodla: [z("H.xlsx")] }, wns: { skrot: "WNS", zrodla: [z("A.pdf")] } } }, { wh: 1 });
  assert.equal(r.zrodla.wydzialy.wh, stare.wydzialy.wh);
  assert.equal(r.zrodla.wydzialy.wns, stare.wydzialy.wns);
  assert.equal(r.zachowane.length, 2);
  // wydział, którego nie ma w świeżym wyniku, też zostaje
  assert.equal(scalZrodla(stare, { wydzialy: {} }).zrodla.wydzialy.wpia, stare.wydzialy.wpia);
});

test("pobieracz: plik sprawdzony w tym przebiegu nie jest pobierany drugi raz", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pob-"));
  let zapytan = 0;
  const fetchFn = async () => { zapytan++; return new Response(Buffer.from("abc"), { status: 200, headers: { etag: "e1" } }); };
  const p = pobieracz({ dir, pauzaMs: 0, fetchFn });
  const a = await p.plik("https://x/a.pdf"), b = await p.plik("https://x/a.pdf");
  assert.equal(zapytan, 1);
  assert.equal(a.zCache, false); assert.equal(b.zCache, true);
  assert.equal(b.buf.toString(), "abc");
  // nowy przebieg (nowy pobieracz): HEAD, plik z cache
  const p2 = pobieracz({ dir, pauzaMs: 0, fetchFn });
  assert.equal((await p2.plik("https://x/a.pdf")).zCache, true);
  assert.equal(zapytan, 2);
});
